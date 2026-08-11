import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { User as UserRow } from '../generated/prisma/client';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

// What the API says about a user: exactly these four fields and nothing
// else. passwordHash never leaves this service in any shape (AC4), and
// createdAt stays internal until a screen needs it.
export interface AuthUserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUserResponse;
}

// Ticket floor is 10; 12 is the common contemporary default and still fast
// enough that the e2e suite does not notice.
export const BCRYPT_ROUNDS = 12;

// One message for every way credentials can be wrong (AC3): a different
// message (or a different status) for "no such account" would let anyone
// enumerate registered emails.
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

// P2002 = unique constraint violation. Creating and catching, rather than
// checking findUnique first, closes the race where two signups with the
// same email pass the check simultaneously - the UNIQUE index is the only
// arbiter that cannot lose that race. Duck-typed instead of instanceof for
// the same module-resolution reason as isRecordNotFound in runs.service.ts.
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

@Injectable()
export class AuthService {
  // Compared against when login hits an unknown email, so that path costs
  // one bcrypt comparison exactly like the known-email path does. Without
  // it, "unknown email" would answer visibly faster than "wrong password"
  // and the response timing would leak what AC3's single message hides.
  // Computed once at class load; the hashed literal is irrelevant because
  // nothing sensible can ever compare equal to it.
  private static readonly dummyHash: string = bcrypt.hashSync(
    'timing-equalizer-never-a-real-password',
    BCRYPT_ROUNDS,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async toAuthResponse(row: UserRow): Promise<AuthResponse> {
    // The user id as the subject claim (AC3); email rides along so a future
    // guard can show who a token belongs to without a database roundtrip.
    const token = await this.jwt.signAsync({ sub: row.id, email: row.email });
    return {
      token,
      user: {
        id: row.id,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
      },
    };
  }

  async signup(dto: SignupDto): Promise<AuthResponse> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      const row = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
      });
      return await this.toAuthResponse(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        // 409 with a clear message (AC2). Signup necessarily reveals that an
        // email is taken - that is inherent to signup everywhere; login is
        // where the generic message matters.
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const row = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Always exactly one bcrypt comparison before any throw - see dummyHash.
    const passwordMatches = await bcrypt.compare(
      dto.password,
      row?.passwordHash ?? AuthService.dummyHash,
    );
    if (!row || !passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    return this.toAuthResponse(row);
  }
}
