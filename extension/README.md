# InboxKey Extension Package

This directory contains the Chrome extension package.

For product overview and install status, see [../README.md](../README.md).
For the current architecture, security model, and build details, use the root docs:

- [../architecture.md](../architecture.md)
- [../development.md](../development.md)
- [../SECURITY.md](../SECURITY.md)

## Common Commands

Run these from this directory:

```bash
npm run dev
npm run build
npm run test
npm run test:e2e
npm run type-check
```

## Local Testing After Rebuild

After `npm run build`:

1. Reload the extension in `chrome://extensions`.
2. Hard refresh any test page that already had the extension loaded.

If you skip the hard refresh, old content scripts can keep running and you may see `Extension context invalidated`.

## Build Verification

Production builds embed a short Git commit hash in the UI so a running build can be traced back to the source tree that produced it.

This is a transparency aid, not reproducible builds. Current Plasmo/Vite builds are not byte-for-byte deterministic.
