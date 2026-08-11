// Duck-typed Prisma error predicate shared by every feature service.
// Duck-typed rather than instanceof on the generated error class, because
// instanceof breaks the moment two copies of the client exist in a
// resolution graph - and the Jest config already resolves modules under
// different rules than the production build.
//
// Codes in use today (each call site attaches its own meaning; check the
// service before reusing one by analogy):
//   P2025 - record not found on a mutation (runs: update on a vanished or
//           foreign row -> 404)
//   P2002 - unique constraint violation (auth: email collision -> 409;
//           follow: repeated follow -> idempotent no-op)
//   P2003 - foreign key violation on insert (runs, follow: the caller's
//           userId has no User row -> 401 dead session; follow also
//           disambiguates the followee side -> 404, see prismaConstraint)
export function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

// The violated constraint's name from a Prisma error's meta, when present:
// e.g. "Follow_followerId_fkey" on a P2003. Postgres names exactly one
// violated constraint per error, so this is what lets a service with two
// foreign keys on the same table tell WHICH one broke without a second,
// racy existence query. Returns undefined if the shape is missing (other
// databases / driver versions put nothing or a string[] there), so callers
// must keep a fallback path.
export function prismaConstraint(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'meta' in error &&
    typeof error.meta === 'object' &&
    error.meta !== null &&
    'constraint' in error.meta &&
    typeof error.meta.constraint === 'string'
  ) {
    return error.meta.constraint;
  }
  return undefined;
}
