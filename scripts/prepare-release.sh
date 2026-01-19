#!/bin/bash
# Prepare browser-ai for Git release (public or full)
# Usage: ./prepare-release.sh [full|public] [output-dir]

set -e

TYPE="${1:-public}"
OUTPUT_DIR="${2:-./release-$TYPE}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE_ROOT="$(cd "$REPO_ROOT/.." && pwd)"
LIBRARY_ROOT="$REPO_ROOT"

echo "🚀 Preparing $TYPE release..."
echo "   Workspace root: $WORKSPACE_ROOT"
echo "   Library root: $LIBRARY_ROOT"
echo "   Output dir: $OUTPUT_DIR"

# Clean output directory
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

if [ "$TYPE" = "full" ]; then
    echo "📦 Copying full project (with CDC)..."
    
    # Copy CDC files
    mkdir -p "$OUTPUT_DIR/cdc"
    for file in "$WORKSPACE_ROOT"/cdc_*.md "$WORKSPACE_ROOT"/analyse_*.md "$WORKSPACE_ROOT"/compl*cdc*.md; do
      if [ -f "$file" ]; then
        cp "$file" "$OUTPUT_DIR/cdc/"
        echo "   ✓ CDC: $(basename "$file")"
      fi
    done

    # Copy internal readme (kept outside public repo)
    if [ -f "$WORKSPACE_ROOT/README-INTERNAL.md" ]; then
      cp "$WORKSPACE_ROOT/README-INTERNAL.md" "$OUTPUT_DIR/"
      echo "   ✓ README-INTERNAL.md"
    fi
    
    # Copy library (excluding node_modules, .git, dist, etc.)
    rsync -av --exclude='node_modules' --exclude='.git' --exclude='dist' \
          --exclude='*.log' --exclude='test-results' --exclude='playwright-report' \
          "$LIBRARY_ROOT/" "$OUTPUT_DIR/"
    
    echo "   ✓ Library copied"
    
elif [ "$TYPE" = "public" ]; then
    echo "📦 Copying public release (lib + docs)..."
    
    # Copy library only (no CDC from parent)
    rsync -av --exclude='node_modules' --exclude='.git' --exclude='dist' \
          --exclude='*.log' --exclude='test-results' --exclude='playwright-report' \
          "$LIBRARY_ROOT/" "$OUTPUT_DIR/"
    
    echo "   ✓ Library copied (without CDC)"
else
    echo "❌ Invalid type: $TYPE (use 'full' or 'public')"
    exit 1
fi

# Initialize git repo
echo "🔧 Initializing Git repository..."
cd "$OUTPUT_DIR"
git init
git add .

if [ "$TYPE" = "full" ]; then
    git commit -m "Initial commit (full project with CDC)"
else
    git commit -m "Initial commit (public release)"
fi

echo ""
echo "✅ Release prepared at: $OUTPUT_DIR"
echo ""
echo "Next steps:"
echo "   cd $OUTPUT_DIR"
echo "   git remote add origin <your-repo-url>"
echo "   git push -u origin main"
