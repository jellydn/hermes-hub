# Plan: Fix SSH Host-Key Fingerprint Handling

## Verified Finding

The `CONCERNS.md` dependency-risk note about `node-ssh` / `ssh2` host-key shape is valid, and the current branch turns that risk into a runtime bug.

Evidence:

- `server/ssh/connection.ts` reads `ssh.connection?.hostFingerprint` and `ssh.connection?.hostKeyAlgorithm` in `captureHostKey()`.
- The installed `node-ssh` type only exposes `connection: SSH2.Client | null`; neither `node-ssh` nor `ssh2` source contains `hostFingerprint` or `hostKeyAlgorithm`.
- `ssh2` documents that `hostVerifier` receives the raw host key `Buffer` unless `hostHash` is set. When `hostHash: "sha256"` is set, the callback receives a hex digest of the key.
- Current code sets `hostHash: "sha256"` and then calls `fingerprintFromKeyHex()` on that digest, so pinned reconnects double-hash the host key and reject valid stored fingerprints.

Current user-visible failures:

- First-time `connectServer()` succeeds at SSH and OS checks, then `captureHostKey()` throws `Host key fingerprint not available`, so the server cannot be saved.
- Any flow using a stored `expectedFingerprint` can report `host_key_mismatch` for the correct host key because the callback compares a double-hashed value.

## Fix Phases

### Phase 1: Capture Host Keys From `hostVerifier`

- Install a `hostVerifier` on every SSH connection, not only when `expectedFingerprint` is present.
- Do not set `hostHash`; let `ssh2` pass the raw host public key `Buffer`.
- Build the observed host-key record inside the verifier:
  - `fingerprint = SHA256:` plus the SHA-256 base64 digest of the raw key bytes.
  - `algorithm = parseKey(rawKey).type` when available, otherwise `"unknown"`.
- Store the observed key in closure state so `verifyServerConnection()` can return it after the connection is ready.

### Phase 2: Compare Without Double Hashing

- Compare the observed normalized fingerprint directly to `input.expectedFingerprint`.
- Keep `timingSafeEqual`, but compare UTF-8 bytes of normalized strings with equal-length guard.
- Accept the current padded base64 form and the OpenSSH no-padding form during comparison to avoid rejecting existing rows.
- On mismatch, throw `SshConnectError("host key mismatch", "host_key_mismatch", observedKey)` from the verifier.

### Phase 3: Remove Dead Capture Path

- Delete `captureHostKey(ssh)` and any dependency on `ssh.connection.hostFingerprint`.
- Replace `fingerprintFromKeyHex()` with a helper that accepts raw key bytes, or add `fingerprintFromKeyBytes()` and retire the hex-only use from connection code.
- Keep the public validation helper for the `acceptHostKey` route, but make its error text match the accepted padded/no-padding formats.

### Phase 4: Regression Tests

- Update `server/ssh/connection.test.ts` so the mocked `hostVerifier` receives a raw `Buffer`, matching `ssh2` when `hostHash` is absent.
- Add a test proving first-time `verifyServerConnection()` returns the captured host key without reading `ssh.connection.hostFingerprint`.
- Add a test proving a stored fingerprint generated from the same raw host key is accepted.
- Add a test proving a different stored fingerprint rejects with `code: "host_key_mismatch"` and includes the observed key.
- Update `server/servers.test.ts` expectations if fingerprint padding or algorithm fallback changes.

### Phase 5: Validation

- Run `bun run typecheck`.
- Run focused tests:
  - `bun run test server/ssh/connection.test.ts server/servers.test.ts`
- Run the wider backend install/action surface if focused tests pass:
  - `bun run test server/install.test.ts server/server-actions.test.ts server/telegram.test.ts server/deploy.test.ts`

## Stop Conditions

- Do not change the host-key accept endpoint behavior beyond fingerprint normalization unless a test proves the current contract is broken.
- Do not refactor unrelated SSH command execution or credential resolution in the same patch.
- Do not drop existing stored fingerprints without a migration; comparison should tolerate current values.
