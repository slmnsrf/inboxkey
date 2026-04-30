#!/bin/bash
# rollback.sh - Rollback extraction-core to the most recent snapshot
# Usage: npm run rollback

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"

echo "⏪ Rolling back extraction-core..."

cd "$PACKAGE_DIR"

# Check if in git repo
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "❌ Error: Not in a git repository"
  exit 1
fi

# Find the most recent extraction-core snapshot stash
LATEST_STASH=$(git stash list | grep "extraction-core-snapshot" | head -n 1 | cut -d: -f1)

if [ -z "$LATEST_STASH" ]; then
  echo "❌ Error: No extraction-core snapshot found"
  echo ""
  echo "Available stashes:"
  git stash list
  echo ""
  echo "To create a snapshot, run:"
  echo "  npm run snapshot"
  exit 1
fi

echo "Found snapshot: $LATEST_STASH"
git stash show "$LATEST_STASH"
echo ""

# Prompt for confirmation
read -p "⚠️  This will discard current changes. Continue? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Rollback cancelled"
  exit 1
fi

# Reset any uncommitted changes in extraction-core files
echo "Resetting uncommitted changes..."
git checkout -- src/ tests/ package.json tsconfig.json vitest.config.ts 2>/dev/null || true

# Apply the stash
echo "Applying snapshot..."
git stash apply "$LATEST_STASH"

echo "✅ Rollback complete"
echo ""
echo "Snapshot has been restored. The stash entry is preserved."
echo "To remove the stash entry:"
echo "  git stash drop $LATEST_STASH"
