#!/bin/bash

# Configuration
PACKAGE_JSON="package.json"
CHANGELOG_JSON="${1:-changelogs/changelogs.json}"

# Check if required files exist
if [ ! -f "$PACKAGE_JSON" ]; then
    echo "Error: $PACKAGE_JSON not found!"
    exit 1
fi

if [ ! -f "$CHANGELOG_JSON" ]; then
    echo "Error: $CHANGELOG_JSON not found!"
    exit 1
fi

# Get current version from package.json
CURRENT_VERSION=$(jq -r '.version' "$PACKAGE_JSON")

# Get latest version from changelogs.json (first entry)
NEW_VERSION=$(jq -r '.[0].version' "$CHANGELOG_JSON")

# Function to convert version string to a comparable number (1.2.3 -> 001002003)
# Note: This handles up to 3 digits per segment (0-999)
version_to_int() {
    echo "$1" | awk -F. '{ printf("%03d%03d%03d\n", $1,$2,$3); }'
}

CURRENT_INT=$(version_to_int "$CURRENT_VERSION")
NEW_INT=$(version_to_int "$NEW_VERSION")

echo "Current version: $CURRENT_VERSION ($CURRENT_INT)"
echo "New version:     $NEW_VERSION ($NEW_INT)"

# Compare versions
if [ "$NEW_INT" -lt "$CURRENT_INT" ]; then
    echo "Error: New version ($NEW_VERSION) is less than current version ($CURRENT_VERSION)."
    echo "Please update $CHANGELOG_JSON with a version >= $CURRENT_VERSION."
    exit 1
fi

# If valid, output the new version for the CI
echo "Version validation successful."
echo "$NEW_VERSION"
