import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard, type AuthenticatedRequest } from './jwt-auth.guard';

// Guard-level tests with a real JwtService (a mocked verifier would make
// the accept/reject assertions circular) and a stubbed Reflector for the
// @Public metadata.
describe('JwtAuthGuard', () => {
  const SECRET = 'unit-test-secret-32-characters-x';
  const jwt = new JwtService({ secret: SECRET });
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new JwtAuthGuard(jwt, reflector as unknown as Reflector);

  // The minimal ExecutionContext the guard touches: metadata targets and
  // the HTTP request.
  function contextFor(headers: Record<string, string>): {
    context: ExecutionContext;
    request: Partial<AuthenticatedRequest>;
  } {
    const request: Partial<AuthenticatedRequest> = { headers };
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(false);
  });

  it('lets a @Public route through without touching the header', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const { context } = contextFor({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('401s a missing Authorization header (AC1)', async () => {
    const { context } = contextFor({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('401s a non-Bearer scheme and a bare "Bearer" with no token', async () => {
    for (const authorization of ['Basic dXNlcjpwdw==', 'Bearer', 'Bearer ']) {
      const { context } = contextFor({ authorization });
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    }
  });

  it('accepts the RFC-permitted spellings: case-insensitive scheme, extra whitespace', async () => {
    // RFC 9110 s11.1 (auth-scheme is case-insensitive) and RFC 6750 s2.1
    // ("Bearer" 1*SP token): clients that emit these are conformant and
    // must not be locked out.
    const token = await jwt.signAsync({ sub: 'user-1' });
    for (const authorization of [
      `bearer ${token}`,
      `BEARER ${token}`,
      `Bearer   ${token}`,
    ]) {
      const { context, request } = contextFor({ authorization });
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toEqual({ id: 'user-1' });
    }
  });

  it('401s a token signed with a different secret (AC1)', async () => {
    const forged = await new JwtService({
      secret: 'a-completely-different-secret-32ch',
    }).signAsync({ sub: 'user-1' });
    const { context } = contextFor({ authorization: `Bearer ${forged}` });

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Invalid or expired token',
    );
  });

  it('401s an expired token with the same message as a forged one', async () => {
    const expired = await jwt.signAsync({ sub: 'user-1' }, { expiresIn: -10 });
    const { context } = contextFor({ authorization: `Bearer ${expired}` });

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Invalid or expired token',
    );
  });

  it('401s a validly signed token that carries no subject', async () => {
    const subjectless = await jwt.signAsync({ email: 'ana@example.com' });
    const { context } = contextFor({ authorization: `Bearer ${subjectless}` });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('attaches the verified subject to the request and passes (the happy path)', async () => {
    // The email claim rides in the token but is deliberately NOT exposed:
    // only the id is attached (see AuthenticatedUser).
    const token = await jwt.signAsync({
      sub: 'user-1',
      email: 'ana@example.com',
    });
    const { context, request } = contextFor({
      authorization: `Bearer ${token}`,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'user-1' });
  });
});
