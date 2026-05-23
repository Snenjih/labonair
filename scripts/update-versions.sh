#!/bin/bash

# Nexum Lock Update Script
# Updates pnpm-lock.yaml and Cargo.lock to match their respective manifest files.

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Updating pnpm-lock.yaml..."
cd "$REPO_ROOT"
pnpm update
echo "    pnpm-lock.yaml updated."

echo ""
echo "==> Updating Cargo.lock..."
cd "$REPO_ROOT/src-tauri"
cargo update
echo "    Cargo.lock updated."

echo ""
echo "==> Verifying TypeScript..."
cd "$REPO_ROOT"
pnpm exec tsc --noEmit
echo "    TypeScript OK."

echo ""
echo "==> Verifying Rust..."
cd "$REPO_ROOT/src-tauri"
cargo check
echo "    Rust OK."

echo ""
echo "All lock files updated and build verified."
