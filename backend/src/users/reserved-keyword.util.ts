// Reserved path keywords that must not be treated as a real :userId in
// /api/users/:userId routes. The first such keyword shipping is `me`, which
// historically collided with the catch-all and produced a 500 because the
// underlying Prisma lookup rejects non-UUID strings (BUG-REG-058). Callers
// asking "who am I" should use GET /api/auth/session.
export const RESERVED_USER_ID_KEYWORDS: ReadonlySet<string> = new Set([
  'me',
  'current',
  'self',
]);

export function isReservedUserIdKeyword(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  return RESERVED_USER_ID_KEYWORDS.has(value.toLowerCase());
}

export function reservedUserIdMessage(value: string): string {
  return `'${value}' is a reserved keyword, not a user id. Use GET /api/auth/session for the current authenticated user.`;
}
