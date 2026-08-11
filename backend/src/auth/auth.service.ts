import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { isPrismaError } from '../prisma/prisma-errors';
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

// P2002 = unique constraint violation (see ../prisma/prisma-errors.ts).
function isUniqueViolation(error: unknown): boolean {
  return isPrismaError(error, 'P2002');
}

// The clear-email-taken message shared by both places signup can detect the
// duplicate (fast path and race arbiter, below).
const DUPLICATE_EMAIL_MESSAGE = 'An account with this email already exists';

@Injectable()
export class AuthService {
  // Compared against when login hits an unknown email, so that path costs
  // one bcrypt comparison exactly like the known-email path does. Without
  // it, "unknown email" would answer visibly faster than "wrong password"
  // and the response timing would leak what AC3's single message hides.
  // A precomputed cost-12 hash of an irrelevant literal, checked in rather
  // than computed at class load: hashSync here would block the event loop
  // for ~300 ms on every boot and every test file that imports this module,
  // and nothing sensible can ever compare equal to it either way. If
  // BCRYPT_ROUNDS changes, regenerate to match the cost of freshly stored
  // hashes: node -e "console.log(require('bcrypt').hashSync('x', ROUNDS))"
  private static readonly dummyHash: string =
    '$2b$12$PXo.8y/.eEkRDpcSE1LdwOh59PFNS1AnI6pEjOHcrzLEJ.WJHvH0u';

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
    // Fast path on the unique email index BEFORE the expensive hash, so a
    // replayed duplicate signup costs a sub-millisecond indexed read instead
    // of ~300 ms of bcrypt CPU per attempt (an unauthenticated caller could
    // otherwise pin a core and starve the libuv threadpool). 409 with a
    // clear message (AC2): signup necessarily reveals that an email is
    // taken - that is inherent to signup everywhere; login is where the
    // generic message matters.
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) throw new ConflictException(DUPLICATE_EMAIL_MESSAGE);

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // The try covers ONLY the insert: the fast path above can lose the race
    // where two signups pass it simultaneously, and the UNIQUE index is the
    // arbiter that cannot. Token signing stays outside - a signing failure
    // after a committed row must surface as what it is, not funnel through
    // the P2002 mapping.
    let row: UserRow;
    try {
      row = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(DUPLICATE_EMAIL_MESSAGE);
      }
      throw error;
    }
    return this.toAuthResponse(row);
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
