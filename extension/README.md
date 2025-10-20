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
