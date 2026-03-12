#!/bin/bash
# snapshot.sh - Create a snapshot of current extraction-core state before changes
# Usage: npm run snapshot

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"

echo "📸 Creating snapshot of extraction-core..."

cd "$PACKAGE_DIR"

# Check if in git repo
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "❌ Error: Not in a git repository"
  exit 1
fi

# Stash any uncommitted changes with a timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
STASH_MSG="extraction-core-snapshot-$TIMESTAMP"

# Check if there are changes to stash
if ! git diff-index --quiet HEAD --; then
  echo "Stashing changes with message: $STASH_MSG"
  git stash push -u -m "$STASH_MSG" -- src/ tests/ package.json tsconfig.json vitest.config.ts
  echo "✅ Snapshot created: $STASH_MSG"
  echo ""
  echo "To restore this snapshot later, run:"
  echo "  npm run rollback"
  echo ""
  echo "Or manually:"
  echo "  git stash list  # find the stash"
  echo "  git stash apply stash@{N}  # where N is the stash number"
else
  echo "ℹ️  No changes to snapshot (working directory is clean)"
fi
