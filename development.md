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
Creates production build and copies locale files to `build/chrome-mv3-prod/`.

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

## Agent Notes

- Always run commands from `/extension` directory
- Use `cd extension &&` prefix when running commands from project root
- Build command includes locale copying step automatically
- Tests use Vitest (unit) and Playwright (E2E)
