// Duck-typed Prisma error predicate shared by every feature service.
// Duck-typed rather than instanceof on the generated error class, because
// instanceof breaks the moment two copies of the client exist in a
// resolution graph - and the Jest config already resolves modules under
// different rules than the production build.
//
// Codes in use today:
//   P2025 - record not found on a mutation (update/delete on a vanished row)
//   P2002 - unique constraint violation (e.g. User.email collision)
export function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
