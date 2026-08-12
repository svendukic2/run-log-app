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
import {
  claimedTokenVersion,
  sessionStartedAt,
  REFRESH_IDLE_WINDOW_SECONDS,
  SESSION_ABSOLUTE_MAX_SECONDS,
  type AccessTokenClaims,
} from './token-lifecycle';

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

// The single answer for every way a refresh can be refused: expired beyond
// the idle window, past the absolute ceiling, revoked by a logout, signed
// with the wrong key, or naming a user who no longer exists. The caller's
// fix is the same in all five cases (sign in again), and a more specific
// message would only help someone probing which of our windows they are
// outside of.
export const SESSION_ENDED_MESSAGE = 'Session ended. Sign in again.';

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

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

  // Signup and login both start a NEW session, so the session clock starts
  // now. Refresh is the one caller that passes a start time forward.
  private async toAuthResponse(
    row: UserRow,
    startedAt: number = nowInSeconds(),
  ): Promise<AuthResponse> {
    // The user id as the subject claim (AC3); email rides along so a future
    // guard can show who a token belongs to without a database roundtrip.
    // `ver` and `sst` are RUN-74: see token-lifecycle.ts for what each one
    // bounds. `iat` and `exp` are the library's, so they are not set here.
    const token = await this.jwt.signAsync({
      sub: row.id,
      email: row.email,
      ver: row.tokenVersion,
      sst: startedAt,
    });
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

  // Verifies a token that is allowed to be expired, WITHOUT applying any of
  // the lifecycle rules. Shared by refresh and logout so there is one
  // spelling of "is this really one of ours"; each caller then decides what
  // an unusable token means for it (refresh throws, logout shrugs).
  private async verifyIgnoringExpiry(
    rawToken: string | null,
  ): Promise<AccessTokenClaims | null> {
    if (!rawToken) return null;
    let claims: AccessTokenClaims;
    try {
      // The signature, the issuer and the shape are all still enforced; only
      // `exp` is waived, because renewing an expired token is the entire
      // point of the endpoint.
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(rawToken, {
        ignoreExpiration: true,
      });
    } catch {
      return null;
    }
    if (typeof claims.sub !== 'string' || claims.sub.length === 0) return null;
    return claims;
  }

  // POST /api/auth/refresh (RUN-74). Trades a valid-or-recently-expired
  // access token for a fresh one. Every rule it applies, and every threat it
  // knowingly leaves open, is documented in token-lifecycle.ts.
  async refresh(rawToken: string | null): Promise<AuthResponse> {
    const claims = await this.verifyIgnoringExpiry(rawToken);
    if (!claims) throw new UnauthorizedException(SESSION_ENDED_MESSAGE);

    const now = nowInSeconds();

    // Idle window, measured from when THIS token was issued. Every refresh
    // mints a token with a fresh `iat`, so an active session keeps sliding
    // and an abandoned one runs out.
    const issuedAt = typeof claims.iat === 'number' ? claims.iat : null;
    if (issuedAt === null || now - issuedAt > REFRESH_IDLE_WINDOW_SECONDS) {
      throw new UnauthorizedException(SESSION_ENDED_MESSAGE);
    }

    // Absolute ceiling, measured from when the SESSION started. `sst` is
    // copied forward unchanged below, which is what stops sliding from
    // outrunning this. A pre-RUN-74 token has no `sst` and falls back to its
    // own `iat`.
    const startedAt = sessionStartedAt(claims);
    if (startedAt === null || now - startedAt > SESSION_ABSOLUTE_MAX_SECONDS) {
      throw new UnauthorizedException(SESSION_ENDED_MESSAGE);
    }

    const row = await this.prisma.user.findUnique({
      where: { id: claims.sub as string },
    });
    // A deleted account, or a token from a database that no longer exists.
    if (!row) throw new UnauthorizedException(SESSION_ENDED_MESSAGE);

    // Revocation. A missing claim reads as 0, which is what the migration
    // gave every pre-existing row, so tokens live in real browsers today
    // pass this check rather than being logged out by the deploy.
    if (claimedTokenVersion(claims) !== row.tokenVersion) {
      throw new UnauthorizedException(SESSION_ENDED_MESSAGE);
    }

    return this.toAuthResponse(row, startedAt);
  }

  // POST /api/auth/logout (RUN-74). Ends every session this account has by
  // bumping the version each outstanding token was minted against.
  //
  // It answers 204 whatever it is given - no token, a garbage token, a token
  // for a deleted user - and that is deliberate. Signing out is the one
  // action that must never fail in the user's face, and the client clears
  // its own session regardless, so a 401 here would be a broken button
  // reporting an outcome the user already got. It also cannot be used to
  // probe: the response is identical for a valid and an invalid token.
  //
  // Expiry is ignored for the same reason. A user who left a tab open
  // overnight and then clicks Sign out holds an expired token, and that is
  // exactly the session most worth revoking.
  async logout(rawToken: string | null): Promise<void> {
    const claims = await this.verifyIgnoringExpiry(rawToken);
    if (!claims) return;

    try {
      await this.prisma.user.update({
        where: { id: claims.sub as string },
        data: { tokenVersion: { increment: 1 } },
      });
    } catch (error) {
      // P2025 = the user is already gone, so every token naming them is
      // already dead. Anything else is a real database failure and must not
      // be swallowed into a false 204.
      if (isPrismaError(error, 'P2025')) return;
      throw error;
    }
  }
}
