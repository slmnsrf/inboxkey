This is a [Plasmo extension](https://docs.plasmo.com/) project bootstrapped with [`plasmo init`](https://www.npmjs.com/package/plasmo).

## Getting Started

First, run the development server:

```bash
pnpm dev
# or
npm run dev
```

Open your browser and load the appropriate development build. For example, if you are developing for the chrome browser, using manifest v3, use: `build/chrome-mv3-dev`.

You can start editing the popup by modifying `popup.tsx`. It should auto-update as you make changes. To add an options page, simply add a `options.tsx` file to the root of the project, with a react component default exported. Likewise to add a content page, add a `content.ts` file to the root of the project, importing some module and do some logic, then reload the extension on your browser.

For further guidance, [visit our Documentation](https://docs.plasmo.com/)

## Making production build

Run the following:

```bash
pnpm build
# or
npm run build
```

This should create a production bundle for your extension, ready to be zipped and published to the stores.

## 🔒 Build Verification

InboxKey is open source to ensure transparency and trust. But how can you verify that the Chrome Web Store version actually matches the source code on GitHub?

### Quick Verification (5 minutes)

**For users who want to verify the published extension:**

1. **Find the installed version:**
   - Go to `chrome://extensions/`
   - Find InboxKey and note the version number (e.g., `1.0.0`)

2. **Download official checksums:**
   - Visit [GitHub Releases](https://github.com/slmnsrf/inboxkey/releases)
   - Find the matching version release
   - Download `SHA256SUMS` file

3. **Compare checksums:**
   ```bash
   # Find your extension installation directory:
   # macOS: ~/Library/Application Support/Google/Chrome/Default/Extensions/[EXTENSION_ID]/[VERSION]
   # Linux: ~/.config/google-chrome/Default/Extensions/[EXTENSION_ID]/[VERSION]
   # Windows: %LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions\[EXTENSION_ID]\[VERSION]

   cd [extension-directory]
   sha256sum manifest.json background.js popup.html
   # Compare output with SHA256SUMS from GitHub release
   ```

### Reproducible Build (30 minutes)

**For developers who want to build from source and verify:**

1. **Clone and checkout specific release:**
   ```bash
   git clone https://github.com/slmnsrf/inboxkey.git
   cd inboxkey/extension
   git checkout v1.0.0  # Replace with version you want to verify
   ```

2. **Use exact build environment:**
   ```bash
   # Install Node.js 20.19.5 (use nvm for version management)
   nvm install 20.19.5
   nvm use 20.19.5

   # Verify versions match the release
   node --version  # Should output: v20.19.5
   npm --version   # Should output: 10.8.2
   ```

3. **Install exact dependencies:**
   ```bash
   # Use npm ci to install exact versions from package-lock.json
   npm ci
   ```

4. **Build the extension:**
   ```bash
   npm run build
   ```

5. **Generate and compare checksums:**
   ```bash
   cd build/chrome-mv3-prod
   find . -type f -exec sha256sum {} \; | sort -k 2 > MY_SHA256SUMS

   # Download official SHA256SUMS from GitHub release
   # Compare:
   diff MY_SHA256SUMS /path/to/downloaded/SHA256SUMS
   ```

### Understanding Build Determinism

**What should match:**
- ✅ `manifest.json` - Extension configuration
- ✅ Core JavaScript files (`background.js`, `popup.js`, etc.)
- ✅ HTML and CSS files
- ✅ Locale files (`_locales/*`)
- ✅ Asset files (icons, images)

**What might differ:**
- ⚠️ Source maps (if included) - May contain absolute paths
- ⚠️ Build metadata - Timestamps, build IDs
- ⚠️ `.parcel-cache/` - Build cache (not included in final extension)

**Note:** Plasmo may inject some build-time metadata. Focus on verifying the core functional files listed above.

### Automated Builds

All official releases are built using GitHub Actions in a controlled, reproducible environment:

- **Build workflow:** [`.github/workflows/release.yml`](.github/workflows/release.yml)
- **Build logs:** Public and auditable on [GitHub Actions](https://github.com/slmnsrf/inboxkey/actions)
- **Build artifacts:** Automatically attached to each release

Each release includes:
1. `SHA256SUMS` - Checksums for all built files
2. `BUILD_INFO.txt` - Detailed build environment info
3. `inboxkey-vX.X.X.zip` - Complete extension package
4. GitHub Actions build logs (public)

### Security & Trust

**Why open source matters for InboxKey:**
- 🔍 **Auditable:** Anyone can review the code for security issues
- 🔒 **Privacy:** Verify that emails stay local (no external servers)
- 🛡️ **Transparent:** See exactly what permissions are used and why
- 🤝 **Community:** Security researchers can contribute improvements

**Additional verification:**
- ✅ Apache 2.0 License (permissive open source)
- ✅ No obfuscation or minification tricks
- ✅ All dependencies listed in `package.json`
- ✅ Build process fully documented

### Report Security Issues

Found a security vulnerability? Please report it responsibly:
- **Email:** [Create a security contact in your repo settings]
- **GitHub Security:** Use [GitHub Security Advisories](https://github.com/slmnsrf/inboxkey/security/advisories)

**Do not** open public issues for security vulnerabilities.

## Submit to the webstores

The easiest way to deploy your Plasmo extension is to use the built-in [bpp](https://bpp.browser.market) GitHub action. Prior to using this action however, make sure to build your extension and upload the first version to the store to establish the basic credentials. Then, simply follow [this setup instruction](https://docs.plasmo.com/framework/workflows/submit) and you should be on your way for automated submission!

## Development Workflow

### Testing After Rebuilding

**Important**: When testing changes after rebuilding the extension:

1. Build the extension:
   ```bash
   npm run build
   ```

2. Reload the extension in Chrome:
   - Navigate to `chrome://extensions/`
   - Find "InboxKey" extension
   - Click the circular reload icon (⟳)

3. **Hard refresh the test page**: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
   - **Why**: This clears old content scripts from memory
   - **Skip this**: You'll get "Extension context invalidated" errors

### Why Hard Refresh is Required

Chrome extensions inject content scripts into web pages. When you reload the extension:
- The old content scripts remain active on already-loaded pages
- These scripts have a **stale runtime context** (pointing to the old extension)
- Attempting to communicate with the background script will fail with: `Error: Extension context invalidated`

**Solution**: Hard refresh forces the page to reload, injecting fresh content scripts with the current extension context.

### Testing Checklist

After making code changes:

- [ ] Run `npm run build`
- [ ] Reload extension at `chrome://extensions/`
- [ ] **Hard refresh test page** (Ctrl+Shift+R)
- [ ] Test the feature
- [ ] Check console for errors

### Common Development Errors

**Error**: `Uncaught Error: Extension context invalidated`
- **Cause**: Old content script trying to connect to new extension context
- **Fix**: Hard refresh the page (Ctrl+Shift+R)

**Error**: Changes not appearing
- **Cause**: Browser cached old files
- **Fix**: Hard refresh the page (Ctrl+Shift+R)

## Documentation

- See `CHANGELOG.md` for recent changes and bug fixes
- See `TESTING_STRATEGY.md` for testing approach
- See `TESTING-QUICKSTART.md` for quick testing guide
