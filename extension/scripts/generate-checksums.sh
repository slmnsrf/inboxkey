#!/bin/bash

# Generate checksums for build verification
# Usage: ./scripts/generate-checksums.sh [build-directory]

set -e

BUILD_DIR="${1:-build/chrome-mv3-prod}"

if [ ! -d "$BUILD_DIR" ]; then
  echo "❌ Error: Build directory not found: $BUILD_DIR"
  echo "   Run 'npm run build' first"
  exit 1
fi

echo "🔒 Generating checksums for: $BUILD_DIR"
echo ""

cd "$BUILD_DIR"

# Generate SHA256 checksums for all files
find . -type f \
  ! -name 'SHA256SUMS' \
  ! -name 'BUILD_INFO.txt' \
  ! -path '*/.parcel-cache/*' \
  -exec sha256sum {} \; | sort -k 2 > SHA256SUMS

echo "✅ Generated SHA256SUMS with $(wc -l < SHA256SUMS) file checksums"
echo ""

# Display checksums for key files
echo "📋 Key file checksums:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
grep -E '(manifest\.json|background\..*\.js|popup\.html|popup\..*\.js|contents\..*\.js)$' SHA256SUMS || echo "No key files found"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Generate build info
cat > BUILD_INFO.txt <<EOF
InboxKey Build Information
==========================

Build Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Git Commit: $(git rev-parse HEAD 2>/dev/null || echo "unknown")
Git Branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
Git Tag: $(git describe --tags --exact-match 2>/dev/null || echo "none")

Build Environment:
- Node.js: $(node --version)
- npm: $(npm --version)
- OS: $(uname -s) $(uname -r)

Build Command: npm ci && npm run build

Verification Instructions:
1. Clone repo: git clone https://github.com/slmnsrf/inboxkey.git
2. Checkout commit: git checkout $(git rev-parse HEAD 2>/dev/null || echo "HEAD")
3. Install deps: npm ci
4. Build: npm run build
5. Compare: diff SHA256SUMS $BUILD_DIR/SHA256SUMS

For detailed verification guide, see:
https://github.com/slmnsrf/inboxkey/blob/main/README.md#-build-verification
EOF

echo "✅ Generated BUILD_INFO.txt"
echo ""

# Show summary
echo "📦 Build Summary:"
echo "   Total files: $(find . -type f ! -path '*/.parcel-cache/*' | wc -l)"
echo "   Checksums: $(wc -l < SHA256SUMS)"
echo "   Build directory: $BUILD_DIR"
echo ""
echo "📄 Files created:"
echo "   - SHA256SUMS"
echo "   - BUILD_INFO.txt"
echo ""
echo "✨ Done! Checksums generated successfully."
