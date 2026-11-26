#!/usr/bin/env bash
# Pull the upstream Strata client (Tauri shell + React host UI) at a pinned tag.
#
#   ./scripts/fetch-upstream.sh            # use UPSTREAM_TAG from this file
#   ./scripts/fetch-upstream.sh v0.2.22
#
# Only app/desktop and app/host (or apps/desktop and apps/host on <= v0.2.15)
# are imported: they are the shippable client. The engine, cmake tree and
# Python host stay upstream — we consume signed release binaries at stage time.
set -euo pipefail

UPSTREAM_REPO="Niko1221/Strata"
UPSTREAM_TAG="${1:-v0.2.22}"
DEST="apps/client-upstream"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "→ ${UPSTREAM_REPO} @ ${UPSTREAM_TAG}"
curl -fsSL -o "$WORK/src.tar.gz" \
  "https://codeload.github.com/${UPSTREAM_REPO}/tar.gz/refs/tags/${UPSTREAM_TAG}"

ROOT_DIR="Strata-${UPSTREAM_TAG#v}"
mkdir -p "$WORK/x"

# v0.2.16+ moved apps/{desktop,host} to app/{desktop,host}. Detect which layout the tag uses.
if tar -tzf "$WORK/src.tar.gz" "${ROOT_DIR}/app/desktop/package.json" >/dev/null 2>&1; then
  SRC_BASE="app"
else
  SRC_BASE="apps"
fi

tar xzf "$WORK/src.tar.gz" -C "$WORK/x" --strip-components=1 \
  "${ROOT_DIR}/${SRC_BASE}/desktop" \
  "${ROOT_DIR}/${SRC_BASE}/host"

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$WORK/x/${SRC_BASE}/desktop" "$DEST/desktop"
cp -R "$WORK/x/${SRC_BASE}/host" "$DEST/host"

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

echo "✓ imported into ${DEST} (${SRC_BASE}/desktop + ${SRC_BASE}/host)"
sed -n '1,5p' "$DEST/UPSTREAM"
