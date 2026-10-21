#!/usr/bin/env bash
# Build the Stratat desktop installers on a real machine and (optionally) publish them.
#
# CI is not used for releases: the signed macOS build needs the Developer ID certificate from
# the release Mac's keychain, and the Windows installer is signed on the Windows station. Run
# this on whichever host you are on; it builds the platform it is running on.
#
#   scripts/build-release.sh              # build for the current OS
#   scripts/build-release.sh --verify     # no build: report version, hash and signature of dist/release
#   scripts/build-release.sh --publish    # build, then upload to the tag's GitHub release
#   scripts/build-release.sh --target aarch64-apple-darwin --publish
#
# Environment:
#   APPLE_SIGNING_IDENTITY   identity to sign with (default: discovered from the keychain or p12)
#   APPLE_SIGNING_P12        path to a .p12 holding the signing certificate and its key
#   APPLE_SIGNING_P12_PASSWORD   password for that p12
#   TAURI_SIGNING_PRIVATE_KEY[_PASSWORD]   updater key; without it no latest.json is produced
#   GH_TOKEN / gh auth       required only with --publish
#
# Signing tiers, in the order the script tries them:
#   1. Developer ID Application — Gatekeeper accepts a downloaded app with no user steps.
#   2. Apple Distribution       — signature verifies (`codesign --verify`), but the certificate is
#                                 meant for App Store delivery, so Gatekeeper still asks the user
#                                 to open it once via right-click. Never presented as tier 1.
#   3. none                     — unsigned bundle; `--verify` reports it as such.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP="$(cd "$HERE/../apps/client-upstream/desktop" && pwd)"
CONF="$DESKTOP/src-tauri/tauri.conf.json"
VERSION="$(grep -m1 '^version = ' "$DESKTOP/src-tauri/Cargo.toml" | cut -d'"' -f2)"
PRODUCT="$(node -e "console.log(require('$CONF').productName)")"
OUT="$HERE/../dist/release"

PUBLISH=0
VERIFY=0
TARGET=""
while [ $# -gt 0 ]; do
  case "$1" in
    --publish) PUBLISH=1; shift ;;
    --verify) VERIFY=1; shift ;;
    --target) TARGET="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

# `--verify` inspects what is already in dist/release and changes nothing, so a release can be
# checked on a machine that does not hold the certificate.
if [ "$VERIFY" -eq 1 ]; then
  [ -d "$OUT" ] || { echo "error: $OUT does not exist; run the build first" >&2; exit 1; }
  echo "→ $PRODUCT $VERSION"
  fail=0

  # `for f in "$OUT"/*` iterates once over the literal `*` when the directory is empty, and the
  # `[ -f ]` guard then skips it — which would report an empty directory as a passing release.
  shopt -s nullglob
  files=("$OUT"/*)
  shopt -u nullglob
  if [ "${#files[@]}" -eq 0 ]; then
    echo "error: $OUT is empty — nothing was built" >&2
    exit 1
  fi

  if [ "${#files[@]}" -eq 1 ] && [ "$(basename "${files[0]}")" = "*" ]; then
    echo "error: $OUT contains only the literal '*'" >&2
    exit 1
  fi

  # Verify the app inside a dmg, not the dmg. A dmg carries an optional signature of its own;
  # a Developer ID signed app shipped in an unsigned dmg would otherwise read as "none".
  check_dmg_app() {
    dmg="$1"
    mnt="$(mktemp -d)"
    if ! hdiutil attach "$dmg" -nobrowse -readonly -mountpoint "$mnt" >/dev/null 2>&1; then
      echo "      signature: could not mount dmg"; return 1
    fi
    app="$(find "$mnt" -maxdepth 1 -name '*.app' -print -quit)"
    status=1
    if [ -z "$app" ]; then
      echo "      signature: dmg contains no .app"
    elif codesign --verify --deep --strict "$app" >/dev/null 2>&1; then
      auth="$(codesign -dv --verbose=4 "$app" 2>&1 | sed -n 's/^Authority=//p' | head -1)"
      if spctl -a -t exec "$app" >/dev/null 2>&1; then
        echo "      signature: notarized / Gatekeeper-accepted — $auth"
      elif printf '%s' "$auth" | grep -q 'Developer ID Application'; then
        echo "      signature: Developer ID (verifies, not notarized) — $auth"
      else
        echo "      signature: $auth (verifies; Gatekeeper needs one right-click to open)"
      fi
      status=0
    else
      echo "      signature: app inside dmg is unsigned or invalid"
    fi
    hdiutil detach "$mnt" >/dev/null 2>&1 || true
    rmdir "$mnt" 2>/dev/null || true
    return $status
  }

  for f in "${files[@]}"; do
    [ -f "$f" ] || continue
    name="$(basename "$f")"
    printf '  %-42s %10s  sha256=%s\n' "$name" \
      "$(du -h "$f" | cut -f1)" "$(shasum -a 256 "$f" | cut -c1-16)"
    case "$name" in
      *.dmg)
        check_dmg_app "$f" || fail=1 ;;
      *.exe|*.msi)
        echo "      signature: Windows installer (run on a Windows host to inspect Authenticode)" ;;
      *.AppImage|*.deb) echo "      signature: n/a on Linux" ;;
      *.sig) echo "      signature: updater signature (verified by the app, not here)" ;;
    esac
  done
  # A macOS app bundle inside a dmg is what actually gets signed; check it standalone too.
  app="$DESKTOP/src-tauri/target/$TARGET/release/bundle/macos/$PRODUCT.app"
  if [ -d "$app" ]; then
    echo "→ $PRODUCT.app"
    if codesign --verify --deep --strict "$app" >/dev/null 2>&1; then
      auth="$(codesign -dv --verbose=4 "$app" 2>&1 | sed -n 's/^Authority=//p' | head -1)"
      echo "      signature: valid — $auth"
    else
      echo "      signature: invalid or absent"
    fi
    echo "      identifier: $(codesign -dv "$app" 2>&1 | sed -n 's/^Identifier=//p' | head -1)"
  fi
  [ "$fail" -eq 0 ] || { echo "✗ verification failed" >&2; exit 1; }
  echo "✓ verification passed"
  exit 0
fi

# Default to the host architecture so a plain run does what the person expects.
if [ -z "$TARGET" ]; then
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64)  TARGET="aarch64-apple-darwin" ;;
    Darwin-x86_64) TARGET="x86_64-apple-darwin" ;;
    MINGW*|MSYS*|CYGWIN*) TARGET="x86_64-pc-windows-msvc" ;;
    Linux-x86_64)  TARGET="x86_64-unknown-linux-gnu" ;;
    *) echo "unsupported host: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
  esac
fi

echo "→ $PRODUCT $VERSION for $TARGET"

# The bundle ships a private Node runtime; it is not committed.
NODE_TARGET=""
case "$TARGET" in
  *windows*) NODE_TARGET="win-x64" ;;
  aarch64-apple-darwin) NODE_TARGET="darwin-arm64" ;;
  x86_64-apple-darwin)  NODE_TARGET="darwin-x64" ;;
  *linux*) NODE_TARGET="linux-x64" ;;
esac
( cd "$DESKTOP" && bash scripts/fetch-node.sh --target "$NODE_TARGET" )
for d in harness control engine-bundle; do
  mkdir -p "$DESKTOP/src-tauri/resources/$d"
  [ -f "$DESKTOP/src-tauri/resources/$d/.gitignore" ] || printf '*\n!.gitignore\n' > "$DESKTOP/src-tauri/resources/$d/.gitignore"
done

# The host UI is what the shell renders; build it before the shell.
( cd "$DESKTOP" && npm run build:ui )

# Signing identity discovery. Tier 1 is Developer ID; tier 2 is Apple Distribution from a p12.
# The script never claims a higher tier than it found, because the difference decides whether a
# downloaded app opens on a double-click or needs a right-click.
SIGN_IDENTITY=""
SIGN_TIER="none"
P12_KEYCHAIN=""

if [ "$(uname -s)" = "Darwin" ]; then
  # An explicitly supplied p12 wins: it is the only material we know the password for, and a
  # keychain identity we cannot unlock would fail codesign after a full compile.
  if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
    SIGN_IDENTITY="$APPLE_SIGNING_IDENTITY"
    case "$SIGN_IDENTITY" in
      "Developer ID Application"*) SIGN_TIER="developer-id" ;;
      *) SIGN_TIER="apple-distribution" ;;
    esac
  elif [ -z "${APPLE_SIGNING_P12:-}" ]; then
    # Nothing supplied: use whatever Developer ID the machine already trusts.
    for kc in $(security list-keychains -d user | tr -d '"') \
              "$HOME/Library/Keychains/login.keychain-db"; do
      [ -f "$kc" ] || continue
      id="$(security find-identity -v -p codesigning "$kc" 2>/dev/null \
            | sed -n 's/.*"\(Developer ID Application: [^"]*\)"/\1/p' | head -1)"
      if [ -n "$id" ]; then
        SIGN_IDENTITY="$id"; SIGN_TIER="developer-id"; break
      fi
    done
  fi

  # Import the supplied p12 into a throwaway keychain and sign with its certificate.
  if [ -z "$SIGN_IDENTITY" ] && [ -n "${APPLE_SIGNING_P12:-}" ] && [ -f "$APPLE_SIGNING_P12" ]; then
    P12_KEYCHAIN="$(mktemp -d)/stratat-sign.keychain-db"
    security create-keychain -p stratat "$P12_KEYCHAIN"
    security set-keychain-settings -lut 21600 "$P12_KEYCHAIN"
    security unlock-keychain -p stratat "$P12_KEYCHAIN"
    security import "$APPLE_SIGNING_P12" -k "$P12_KEYCHAIN" \
      -P "${APPLE_SIGNING_P12_PASSWORD:-}" -T /usr/bin/codesign -A >/dev/null
    security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k stratat "$P12_KEYCHAIN" >/dev/null
    # Keep the user's existing keychains, this one is added in front for this run only.
    security list-keychains -d user -s "$P12_KEYCHAIN" $(security list-keychains -d user | tr -d '"')
    SIGN_IDENTITY="$(security find-identity -v -p codesigning "$P12_KEYCHAIN" \
                     | sed -n 's/.*"\([^"]*\)"/\1/p' | head -1)"
    [ -n "$SIGN_IDENTITY" ] && SIGN_TIER="apple-distribution"
  fi
fi

case "$SIGN_TIER" in
  developer-id)
    echo "→ signing with Developer ID: $SIGN_IDENTITY" ;;
  apple-distribution)
    echo "→ signing with Apple Distribution: $SIGN_IDENTITY"
    echo "! this certificate is for App Store delivery; the dmg will verify but Gatekeeper"
    echo "! still needs one right-click (Open) the first time a user launches it" ;;
  *)
    echo "! no signing certificate found — the macOS build will be unsigned" ;;
esac

# tauri.conf.json names a Developer ID identity that only exists on the machine that created it,
# so the bundle step must be told which identity this run actually has — including "none".
if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  echo "! TAURI_SIGNING_PRIVATE_KEY not set — no updater manifest will be produced"
fi

CONFIG_OVERRIDE="$(node -e '
  const identity = process.argv[1];
  const updater = process.argv[2] === "1";
  const out = { bundle: {} };
  if (process.platform === "darwin") {
    out.bundle.macOS = { signingIdentity: identity || null };
  }
  if (!updater) out.bundle.createUpdaterArtifacts = false;
  console.log(JSON.stringify(out));
' "$SIGN_IDENTITY" "$([ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && echo 1 || echo 0)")"
echo "→ bundle config override: $CONFIG_OVERRIDE"

cleanup_keychain() {
  if [ -n "$P12_KEYCHAIN" ] && [ -f "$P12_KEYCHAIN" ]; then
    security delete-keychain "$P12_KEYCHAIN" 2>/dev/null || true
    rm -rf "$(dirname "$P12_KEYCHAIN")" 2>/dev/null || true
  fi
}
trap cleanup_keychain EXIT

build() {
  ( cd "$DESKTOP" && \
    npx tauri build --target "$TARGET" ${CONFIG_OVERRIDE:+--config "$CONFIG_OVERRIDE"} "$@" )
}
build

mkdir -p "$OUT"
BUNDLE="$DESKTOP/src-tauri/target/$TARGET/release/bundle"
found=0
for f in "$BUNDLE"/dmg/*.dmg "$BUNDLE"/nsis/*-setup.exe "$BUNDLE"/msi/*.msi "$BUNDLE"/appimage/*.AppImage "$BUNDLE"/deb/*.deb; do
  [ -f "$f" ] || continue
  cp -f "$f" "$OUT/"
  found=$((found + 1))
  echo "  + $(basename "$f")"
done
for f in "$BUNDLE"/macos/*.app.tar.gz "$BUNDLE"/macos/*.app.tar.gz.sig "$BUNDLE"/*/latest.json "$DESKTOP/src-tauri/target/$TARGET/release/latest.json"; do
  [ -f "$f" ] || continue
  cp -f "$f" "$OUT/"
done
[ "$found" -gt 0 ] || { echo "error: no installer produced under $BUNDLE" >&2; exit 1; }

if [ -f "$DESKTOP/src-tauri/target/$TARGET/release/latest.json" ]; then
  cp -f "$DESKTOP/src-tauri/target/$TARGET/release/latest.json" "$OUT/latest.json"
fi

echo "→ artifacts in $(cd "$OUT" && pwd)"
ls -lh "$OUT" | tail -n +2

if [ "$PUBLISH" -eq 1 ]; then
  TAG="desktop-v$VERSION"
  echo "→ publishing to $TAG"
  gh release view "$TAG" >/dev/null 2>&1 || gh release create "$TAG" --title "$PRODUCT $VERSION" --notes "$PRODUCT $VERSION"
  gh release upload "$TAG" "$OUT"/* --clobber
  echo "✓ published $TAG"
fi

# After publishing, refresh the site's download data so the new installers appear.
if [ "$PUBLISH" -eq 1 ]; then
  ( cd "$HERE/.." && node scripts/sync-downloads.mjs )
  echo "→ next: commit apps/www/src/data/downloads.json and deploy the site"
fi
