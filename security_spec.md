# Security Specification — RADAR UVEH (HAEV)

## 1. Data Invariants & Master Source of Truth

1. **Master Gate (`/hospitals/haev`):** All hospital surveillance sub-resources (`/hospitals/{hospitalId}/bulletins/{bulletinId}` and `/hospitals/{hospitalId}/boards/{boardId}`) derive read and write authorization synchronously from the parent `/hospitals/{hospitalId}` document (`memberUids` and `coordinatorUids`). Revoking a UID from `memberUids` and adding it to `revokedUids` instantaneously terminates access across all subcollections.
2. **Zero Self-Assigned Privilege Escalation:** Standard verified users (`email_verified == true`) can only register `/users/{uid}` with `role == "enfermeria"` and `status == "active"`. Only the bootstrapped administrators (`zoraah@gmail.com` or `uvehaev@gmail.com` with `email_verified == true`) or an existing UVEH coordinator (`uid in /hospitals/haev.coordinatorUids`) can assign `role == "uveh"` or modify `coordinatorUids`.
3. **PII Split Isolation:** User email addresses are isolated inside `/users/{userId}/private/contact` and never stored in `/users/{userId}` or `/hospitals/haev.staffDirectory`. Only `isOwner(userId)` or `isBootstrappedAdmin()` can read `/users/{userId}/private/{docId}`.
4. **Zero Blanket List Exposure:** All collections enforce `allow list: if false;` and `allow delete: if false;`. Every read is an explicit single-document `get` guarded by Master Gate membership.
5. **Temporal & Identity Immutability:** `createdAt` and `updatedAt` must equal `request.time` on creation; `createdAt`, `createdByUid`, `uid`, `hospitalId`, `bulletinId`, and `boardId` are immutable on update, while `updatedAt == request.time` and `updatedByUid == request.auth.uid` are enforced.
6. **Role-Gated Publishing, CODECIN Archiving & Outbreak Studies:** Only UVEH coordinators (`isHospitalCoordinator(hospitalId)`) may create or update `/hospitals/{hospitalId}/bulletins/{bulletinId}`, `/hospitals/{hospitalId}/boards/codecin`, or `/hospitals/{hospitalId}/boards/outbreaks`. Floor nursing (`enfermeria`) may read the bulletin and boards while active in `memberUids`, and update `marks`, `notes`, and `cultures` boards.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Self-Assigned Coordinator Role (`users/{uid}` create):** `{ "uid": "u1", "displayName": "Attacker", "role": "uveh", "serviceArea": "UCIA", "status": "active", "createdAt": "<request.time>", "updatedAt": "<request.time>" }` by non-admin → **DENIED** (`role == "enfermeria"` required for non-admin self-registration).
2. **Unverified Admin Email Spoof (`hospitals/haev` update):** Token `{ email: "zoraah@gmail.com", email_verified: false }` attempting to modify `coordinatorUids` → **DENIED** (`request.auth.token.email_verified == true` mandatory).
3. **Shadow Ghost Field Injection (`users/{uid}` update):** `{ ..., "isAdmin": true }` → **DENIED** (`hasOnly` in `isValidUserProfile` + `affectedKeys().hasOnly(...)`).
4. **PII Lateral Read (`users/otherUid/private/contact` get):** Authenticated nurse `u2` attempting `get` on `users/u1/private/contact` → **DENIED** (`isOwner(userId) || isBootstrappedAdmin()`).
5. **Collection Scraping (`users` or `hospitals/haev/boards` list):** Any authenticated user issuing a collection `list` query → **DENIED** (`allow list: if false;`).
6. **Floor Nurse Publishing Bulletin or Modifying Outbreaks (`hospitals/haev/boards/outbreaks` update):** Member in `memberUids` (not in `coordinatorUids`) attempting to overwrite `items` → **DENIED** (`isHospitalCoordinator(hospitalId)` required for `codecin` and `outbreaks`).
7. **Revoked User Re-Joining (`hospitals/haev` self-join update):** User whose UID is in `revokedUids` attempting `isSelfJoinAction` → **DENIED** (`!(request.auth.uid in existing().revokedUids)`).
8. **Forged Timestamp Backdating (`boards/notes` update):** Client passing `updatedAt: Timestamp(2020, 1, 1)` → **DENIED** (`incoming().updatedAt == request.time`).
9. **Creator Spoofing (`boards/marks` update):** User `u2` mutating `createdByUid` or setting `updatedByUid: "u1"` → **DENIED** (`incoming().createdByUid == existing().createdByUid && incoming().updatedByUid == request.auth.uid`).
10. **Denial-of-Wallet Oversized ID / String (`users/{1500_char_id}` create):** Path variable > 128 chars or `displayName` > 120 chars → **DENIED** (`isValidId` + `.size()` check before any `get()`).
11. **Terminal State Bypass (`bulletins/active` update when `state == "archived"`):** Non-bootstrapped user attempting to mutate an archived bulletin → **DENIED** (`existing().state != "archived" || isBootstrappedAdmin()`).
12. **Unbounded Array Poisoning (`boards/notes` update with 1000 items or non-map element):** `items` length 501 or `items[0] = 12345` → **DENIED** (`data.items.size() <= 500 && (data.items.size() == 0 || data.items[0] is map)`).

---

## 3. Red Team Audit & Conflict Report

| Collection Path | Identity Spoofing | State Shortcutting | Resource / Value Poisoning | `isValid[Entity]` Wrapping Update | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/users/{userId}` | Blocked (`uid == userId == request.auth.uid` or coordinator role update) | Blocked (`status != 'revoked'` terminal lock) | Blocked (`isValidId` + strict `.size()`) | Present at top of `allow update` | PASS |
| `/users/{userId}/private/{docId}` | Blocked (`isOwner(userId)`) | N/A (immutable `uid`, `createdAt`) | Blocked (`docId == 'contact'`, `email.size() <= 254`) | Present at top of `allow update` | PASS |
| `/hospitals/{hospitalId}` | Blocked (self-join can only add `request.auth.uid` to `memberUids`, cannot touch `coordinatorUids`) | Blocked (`!(uid in revokedUids)`) | Blocked (`hospitalId == 'haev'`, bounded lists/maps) | Present at top of `allow update` | PASS |
| `/hospitals/{hospitalId}/bulletins/{bulletinId}` | Blocked (`updatedByUid == request.auth.uid` + `isHospitalCoordinator`) | Blocked (`existing().state != 'archived'` terminal lock) | Blocked (`rows <= 500`, `cerrados <= 300`, `abRows <= 1000`) | Present at top of `allow update` | PASS |
| `/hospitals/{hospitalId}/boards/{boardId}` | Blocked (`updatedByUid == request.auth.uid` + Master Gate `get()`) | Blocked (`codecin` and `outbreaks` boards restricted to coordinators) | Blocked (`items <= 500`, `boardId` allowlist) | Present at top of `allow update` | PASS |
