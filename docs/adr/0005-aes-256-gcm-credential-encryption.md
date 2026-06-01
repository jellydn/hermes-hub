# 5. AES-256-GCM Credential Encryption

Date: 2026-05-31

## Status

Accepted

## Context

The application stores sensitive credentials: SSH passwords/private keys for server connections, and API keys for AI providers. These must be encrypted at rest in the PostgreSQL database. The encryption must be reversible to allow the application to use the credentials when connecting to servers or testing AI provider connections.

## Decision

Use AES-256-GCM symmetric encryption via Node.js's built-in `crypto` module. The algorithm choice and design details:

- **Algorithm**: AES-256-GCM (authenticated encryption) — provides both confidentiality and integrity
- **Key derivation**: The `ENCRYPTION_KEY` environment variable is hashed with SHA-256 to produce a 256-bit key — this allows users to provide a key of any length
- **IV**: 12-byte random IV (recommended for GCM mode), generated fresh for each encryption
- **Auth tag**: GCM produces a 16-byte authentication tag that is stored alongside the ciphertext
- **Encoding**: IV, auth tag, and ciphertext are each base64url-encoded and joined with `.`

The encrypted payload format is: `{iv}.{authTag}.{ciphertext}` (all base64url).

Credentials are decrypted on-demand when the application needs to use them (SSH connection, AI provider test). The decrypted value is never persisted to disk or logs.

## Consequences

### Positive

- Built-in Node.js crypto module — no external dependency for encryption
- AES-256-GCM provides authenticated encryption, preventing tampering with stored ciphertexts
- Variable-length `ENCRYPTION_KEY` is hashed to a consistent 256-bit key — easy to configure
- Base64url encoding is URL-safe and opaque in database columns and logs
- Each encryption uses a unique random IV — the same plaintext produces different ciphertexts

### Negative

- `ENCRYPTION_KEY` is a single global key — rotating it requires re-encrypting all stored credentials
- Losing the `ENCRYPTION_KEY` means all stored credentials are unrecoverable
- No key derivation function (like PBKDF2 or Argon2) — the raw key is hashed once with SHA-256
- The decrypt function assumes the three-part dot-separated format — malformed payloads throw
- Credentials are decrypted in process memory; a memory dump could expose them
