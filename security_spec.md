# Security Specification — ÉVASION Firestore Rules (Phase 0 TDD)

## 1. Data Invariants
1. **Default-Deny Catch-All**: Any path outside `/googleAuthLinks/{uid}` is unconditionally denied (`allow read, write: if false`).
2. **Strict Owner Isolation & Verified Email**: Only an authenticated user with `request.auth.uid == uid` and `request.auth.token.email_verified == true` may `get`, `create`, or `update` `/googleAuthLinks/{uid}`.
3. **No Collection Scraping (`list` / `delete` Forbidden)**: Listing `/googleAuthLinks` or deleting records from the client is strictly forbidden (`allow list, delete: if false`).
4. **Schema & Volumetric Bounds (`isValidGoogleAuthLink`)**:
   - `uid`: `string`, length `1..128`, matches `^[a-zA-Z0-9_\-]+$`, and equals `request.auth.uid`.
   - `evasionUserId`: `string`, length `4..64`, matches `^[a-zA-Z0-9_\-]+$`.
   - `displayName`: `string`, length `1..64`.
   - `createdAt`: server timestamp (`request.time` on create, immutable on update).
   - `updatedAt`: server timestamp (`request.time` on create and update).
   - Exact key allowlist enforced via `hasAll` and `hasOnly`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Write**: `auth = null` attempting `create` on `/googleAuthLinks/user_1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth = { uid: 'user_1', token: { email_verified: false } }` attempting `create` -> `PERMISSION_DENIED`.
3. **Cross-User Read (PII / Link Leak)**: `auth.uid = 'attacker'` attempting `get` on `/googleAuthLinks/victim` -> `PERMISSION_DENIED`.
4. **Collection Enumeration (`list`)**: `auth.uid = 'user_1'` attempting `list` query on `/googleAuthLinks` -> `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection**: Payload includes `isAdmin: true` alongside required fields -> `PERMISSION_DENIED`.
6. **Identity Spoofing in Body**: Path is `/googleAuthLinks/user_1` (`auth.uid == 'user_1'`), but payload sets `uid: 'user_2'` -> `PERMISSION_DENIED`.
7. **Oversized DisplayName DoS**: `displayName` is a 10,000-character string (> 64 max) -> `PERMISSION_DENIED`.
8. **Malformed EvasionUserId**: `evasionUserId` contains spaces/scripts (`"USR_123; DROP"`) failing regex `^[a-zA-Z0-9_\-]+$` -> `PERMISSION_DENIED`.
9. **Forged Client Timestamp on Create**: `createdAt` is a client-supplied past/future timestamp instead of `request.time` -> `PERMISSION_DENIED`.
10. **Immutable Field Mutation on Update**: Updating `createdAt` or `uid` to a new value -> `PERMISSION_DENIED`.
11. **Value Poisoning on Update**: Updating `displayName` to an integer `12345` or empty string `""` -> `PERMISSION_DENIED`.
12. **Client-Side Deletion**: `auth.uid = 'user_1'` attempting `delete` on `/googleAuthLinks/user_1` -> `PERMISSION_DENIED`.
