# Extension Architecture Note

The root [../architecture.md](../architecture.md) file is the source of truth for current InboxKey architecture.

This file stays intentionally short to avoid the drift that comes from maintaining duplicate architecture docs in two places.

Use the root docs for:

- system architecture and data flow
- storage and provider model
- security and privacy assumptions
- build and development commands

Extension package map:

- `src/background/` for the MV3 service worker
- `src/contents/` for content scripts and watch sessions
- `src/lib/` for shared detection, matching, provider, and storage logic
- `src/popup/`, `src/options/`, and `src/tabs/` for UI surfaces

When architecture changes, update the root `architecture.md` instead of reintroducing a second full copy here.
