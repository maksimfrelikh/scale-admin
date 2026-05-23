# BUG-REG-065 — Upgrade password hashing to Argon2id or bcrypt

Status: deferred from BUG-REG-041

## Finding

`backend/src/auth/password.util.ts` hashes passwords with PBKDF2-SHA512. Passwords are not stored in plaintext, but the BUG-REG-041 baseline asks for Argon2id or bcrypt specifically.

## Why deferred

This is broader than a safe defaults patch. A correct change needs dependency selection, production build validation, legacy PBKDF2 verification compatibility, opportunistic rehash or forced reset behavior, seed/test updates, and rollback planning.

## Expected follow-up

- Add Argon2id or bcrypt for all new password hashes.
- Keep legacy PBKDF2 verification until existing credentials are migrated.
- Rehash on successful login/password reset or run a planned reset/migration.
- Add tests proving legacy hashes still verify and new hashes use the approved algorithm.
- Document rollout and rollback behavior.
