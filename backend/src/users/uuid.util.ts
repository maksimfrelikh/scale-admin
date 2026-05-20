// Loose UUID-shape check — 8-4-4-4-12 hex. Used as a guard before PostgreSQL
// to short-circuit non-UUID inputs against a `@db.Uuid` column (which would
// otherwise raise a Prisma validation error → unhandled 500). We deliberately
// don't version-lock so future UUIDv7 ids would also pass; PostgreSQL is the
// canonical validator and will still reject any hex-shaped non-UUID at the
// DB layer.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}
