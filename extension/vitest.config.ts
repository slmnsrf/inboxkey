import { defineConfig } from "vitest/config"
import type { Plugin } from "vite"
import path from "path"

/**
 * Vitest plugin to stub Plasmo-specific import schemes (data-base64:, url:~)
 * that only work in the Plasmo build pipeline.
 */
function plasmoAssetStub(): Plugin {
  return {
    name: 'plasmo-asset-stub',
    enforce: 'pre',
    resolveId(source) {
      if (source.startsWith('data-base64:') || source.startsWith('url:~') || source.startsWith('url:~')) {
        return '\0plasmo-asset-stub'
      }
    },
    load(id) {
      if (id === '\0plasmo-asset-stub') {
        return 'export default ""'
      }
    },
  }
}

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "tests/",
        "*.config.ts",
        "**/*.d.ts",
      ],
    },
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
      "tests/integration/**/*.test.tsx",
      "src/**/__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.tsx",
    ],
  },
  plugins: [plasmoAssetStub()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "~": path.resolve(__dirname, "."),
      "@inboxkey/extraction-core": path.resolve(__dirname, "../packages/extraction-core/src/index.ts"),
    },
  },
})
