# Development Commands

All npm commands should be run from the `/extension` directory.

## Development

```bash
cd extension
npm run dev
```
Starts the development server with hot reloading using Plasmo.

## Build

```bash
cd extension
npm run build
```
Creates production build with git commit hash injection and copies locale files to `build/chrome-mv3-prod/`.

The build pipeline:
1. `prebuild` writes `PLASMO_PUBLIC_GIT_HASH=<short hash>` to `.env.local` (gitignored)
2. Plasmo reads `.env.local` and exposes the var to client code via `process.env.PLASMO_PUBLIC_GIT_HASH`
3. `plasmo build` produces the production bundle
4. `copy-locales` copies `_locales/` into the build output

```bash
cd extension
npm run package
```
Creates a packaged extension ready for distribution.

## Testing

```bash
cd extension
npm run test              # Run unit tests with Vitest
npm run test:ui           # Run unit tests with Vitest UI
npm run test:e2e          # Run all E2E tests with Playwright
npm run test:e2e:ui       # Run E2E tests with Playwright UI
npm run test:e2e:debug    # Run E2E tests in debug mode
npm run test:e2e:popup    # Run specific popup E2E tests
npm run test:e2e:headed   # Run E2E tests in headed mode (visible browser)
```

## Code Quality

```bash
cd extension
npm run lint              # Run ESLint
npm run format            # Format code with Prettier
npm run type-check        # Run TypeScript type checking (no emit)
```

## InboxBridge Version Check (Local Only)

InboxBridge update detection uses a fully local comparison -- no network requests, no phoning home. This is a deliberate architectural decision to honor the "local-only, no servers" promise.

### How it works

1. The extension ships with a `MIN_BRIDGE_VERSION` constant (e.g., `"1.3.0"`).
2. When the extension calls `bridge.ping`, InboxBridge responds with its installed `version` field.
3. The extension compares `installed version < MIN_BRIDGE_VERSION` using semver comparison.
4. If the installed version is outdated, a subtle info hint appears in the IMAP Accounts section of the Accounts panel: "A newer version of InboxBridge is expected (vX.Y.Z)." with a link to GitHub releases.
5. The hint does not block any functionality -- existing accounts continue to work, new accounts can still be added.

### When to bump MIN_BRIDGE_VERSION

Update the constant in the extension source when:
- A new InboxBridge release includes protocol changes the extension depends on.
- A new InboxBridge release includes security fixes that should be communicated.
- A new InboxBridge release includes bug fixes that affect sync reliability.

Do NOT bump for cosmetic or internal-only InboxBridge changes that don't affect the extension.

### Release procedure

When releasing a new InboxBridge version:

1. **Build InboxBridge:** `cd inboxbridge && cargo build --release`
2. **Tag the release:** Create a GitHub release with the InboxBridge binary attached.
3. **Bump MIN_BRIDGE_VERSION in extension source** (only if needed per rules above).
4. **Build and publish extension:** The next Chrome Web Store update will carry the new expected version. Users see the update hint after Chrome auto-updates the extension.

### Design rationale

Three options were evaluated:

| Option | Mechanism | Privacy | Accuracy |
|--------|-----------|---------|----------|
| **A: Extension-bundled version (chosen)** | Local semver comparison | No network requests | Coupled to extension releases |
| B: GitHub API check | Periodic fetch to api.github.com | Phones home | Always accurate |
| C: Opt-in check | Same as B, behind a toggle | User-controlled | Most users won't enable |

Option A was chosen because it is the only approach that makes zero network requests, fully consistent with "local-only, no servers." The tradeoff (coupled to extension releases) is acceptable because InboxBridge changes almost always require corresponding extension updates anyway.

## Build Verification (Transparency)

InboxKey embeds a git commit hash in every build so users can trace the running code back to the exact source on GitHub. This is a core part of the transparency promise.

### How it works

1. `npm run build` runs `prebuild` which writes the current git short hash to `.env.local`
2. Plasmo injects it as `process.env.PLASMO_PUBLIC_GIT_HASH` into the bundle
3. The About page displays `v{version} + {hash}` and links the hash to `github.com/slmnsrf/inboxkey/tree/{hash}`
4. Users can click the hash to read the exact source code that produced their installed build

### How users verify

Three levels of verification are available:

1. **Read the source:** The commit hash links directly to the exact commit on GitHub. Every line of code is visible.
2. **Inspect installed files:** `chrome://extensions` → Developer mode → InboxKey details → browse the installed extension files directly in the browser.
3. **Build from source:** Clone the repo, check out the commit, run `npm run build`, compare the output.

### What this is NOT

- This is NOT reproducible builds. Plasmo/Vite builds are not deterministic (timestamps, module IDs vary between builds). Two builds from the same commit may differ byte-for-byte.
- The commit hash proves which source was used, not that the binary is identical. For byte-level verification, post-launch we will publish `SHA256SUMS` on GitHub Releases (tooling already exists via `npm run build:verify` and `scripts/generate-checksums.sh`).

### Key files

- `extension/src/ui/components/AboutSection.tsx` -- reads `process.env.PLASMO_PUBLIC_GIT_HASH`, displays version, links to GitHub
- `extension/package.json` -- `prebuild` script writes hash to `.env.local`
- `extension/scripts/generate-checksums.sh` -- generates `SHA256SUMS` and `BUILD_INFO.txt` for release artifacts
- `extension/.env.local` -- gitignored, auto-generated by prebuild, contains `PLASMO_PUBLIC_GIT_HASH=<hash>`

## Agent Notes

- Always run commands from `/extension` directory
- Use `cd extension &&` prefix when running commands from project root
- Build command includes locale copying step automatically
- Tests use Vitest (unit) and Playwright (E2E)
