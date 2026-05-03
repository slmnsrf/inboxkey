# Extension Security Notes

This file is intentionally brief.

The current public security policy lives in [../SECURITY.md](../SECURITY.md). The current architecture source of truth lives in [../architecture.md](../architecture.md).

Current extension-specific notes:

- InboxKey does not use an InboxKey-operated backend.
- All email providers, including Gmail, connect via InboxBridge over Native Messaging. Credentials are stored in the operating system keychain by the native app.
- Extension state uses `chrome.storage.local` and `chrome.storage.session`. Additional application-level encryption at rest is planned and not yet shipped.
- Build transparency uses an embedded Git hash. Builds are not byte-for-byte reproducible.

If you change security-sensitive behavior, update the root `SECURITY.md`, `README.md`, and `architecture.md` in the same commit.
