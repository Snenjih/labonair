#!/bin/bash

# Nexum Version Bump Script
# Updates version in all three locations: package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get current version from package.json (using grep instead of jq)
CURRENT_VERSION=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' package.json | head -1)
if [ -z "$CURRENT_VERSION" ]; then
  echo -e "${RED}Error: Could not read version from package.json${NC}"
  exit 1
fi

if [ $# -eq 0 ]; then
  echo -e "${YELLOW}Current version: ${CURRENT_VERSION}${NC}"
  echo "Usage: $0 <new-version> [-y]"
  echo "Example: $0 0.6.0"
  echo "         $0 0.6.0 -y  (auto-commit, tag and push)"
  exit 1
fi

NEW_VERSION=$1
AUTO_CONFIRM=false
if [[ "$2" == "-y" ]]; then
  AUTO_CONFIRM=true
fi

# Validate version format (simple check for X.Y.Z)
if ! [[ $NEW_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo -e "${RED}Error: Invalid version format. Use X.Y.Z (e.g., 0.6.0)${NC}"
  exit 1
fi

echo -e "${YELLOW}Bumping version from ${CURRENT_VERSION} → ${NEW_VERSION}${NC}"

# Update package.json
echo "📦 Updating package.json..."
sed -i.bak "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${NEW_VERSION}\"/" package.json
rm package.json.bak

# Update src-tauri/Cargo.toml
echo "🦀 Updating src-tauri/Cargo.toml..."
sed -i.bak "s/version = \"${CURRENT_VERSION}\"/version = \"${NEW_VERSION}\"/" src-tauri/Cargo.toml
rm src-tauri/Cargo.toml.bak

# Update src-tauri/tauri.conf.json
echo "🎛️  Updating src-tauri/tauri.conf.json..."
sed -i.bak "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${NEW_VERSION}\"/" src-tauri/tauri.conf.json
rm src-tauri/tauri.conf.json.bak

echo -e "${GREEN}✅ Version updated successfully!${NC}"
echo ""
echo "Files updated:"
echo "  - package.json"
echo "  - src-tauri/Cargo.toml"
echo "  - src-tauri/tauri.conf.json"
echo ""
if [ "$AUTO_CONFIRM" = true ]; then
  echo -e "${YELLOW}Auto-committing changes...${NC}"
  git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
  git commit -m "chore: bump version to ${NEW_VERSION}"
  git tag "v${NEW_VERSION}"
  git push origin main --tags
  echo -e "${GREEN}🚀 Committed, tagged and pushed v${NEW_VERSION}${NC}"
else
  echo -e "${YELLOW}Next steps:${NC}"
  echo "  git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json"
  echo "  git commit -m \"chore: bump version to ${NEW_VERSION}\""
  echo "  git tag v${NEW_VERSION}"
  echo "  git push origin main --tags"
fi
