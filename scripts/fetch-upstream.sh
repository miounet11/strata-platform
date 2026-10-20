#!/usr/bin/env bash
# Pull the upstream Strata client (Tauri shell + React host UI) at a pinned tag.
#
#   ./scripts/fetch-upstream.sh            # use UPSTREAM_TAG from this file
#   ./scripts/fetch-upstream.sh v0.2.1-beta
#
# Only apps/desktop and apps/host are imported: they are the shippable client.
# The engine, cmake tree and Python host stay upstream — we consume binaries.
set -euo pipefail

UPSTREAM_REPO="Niko1221/Strata"
UPSTREAM_TAG="${1:-v0.2.0-beta}"
DEST="apps/client-upstream"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "→ ${UPSTREAM_REPO} @ ${UPSTREAM_TAG}"
curl -fsSL -o "$WORK/src.tar.gz" \
  "https://codeload.github.com/${UPSTREAM_REPO}/tar.gz/refs/tags/${UPSTREAM_TAG}"

mkdir -p "$WORK/x"
tar xzf "$WORK/src.tar.gz" -C "$WORK/x" --strip-components=1 \
  "Strata-${UPSTREAM_TAG#v}/apps/desktop" \
  "Strata-${UPSTREAM_TAG#v}/apps/host"

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$WORK/x/apps/desktop" "$DEST/desktop"
cp -R "$WORK/x/apps/host" "$DEST/host"

# Drop build output and dependency trees so the fork stays a source tree.
find "$DEST" -type d \
  \( -name node_modules -o -name dist -o -name target -o -name .next \) \
  -prune -exec rm -rf {} +

cat > "$DEST/UPSTREAM" <<EOF
repo: ${UPSTREAM_REPO}
tag:  ${UPSTREAM_TAG}
license: MIT
fetched-by: scripts/fetch-upstream.sh
EOF

echo "✓ imported into ${DEST} (desktop + host)"
sed -n '1,5p' "$DEST/UPSTREAM"
