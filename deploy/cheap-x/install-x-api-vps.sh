#!/usr/bin/env bash
# Install w95/x-api on a VPS without Docker (Python 3.10+).
set -euo pipefail
INSTALL_ROOT="${X_API_ROOT:-/opt/x-api}"
REPO="${X_API_REPO:-https://github.com/w95/x-api.git}"

if ! command -v python3 >/dev/null; then
  echo "python3 required" >&2
  exit 1
fi

if [[ ! -d "$INSTALL_ROOT/.git" ]]; then
  git clone --depth 1 "$REPO" "$INSTALL_ROOT"
fi

cd "$INSTALL_ROOT"
python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -U pip wheel
pip install -r requirements.txt

echo ""
echo "Next: add X cookies (see docs/INTAKE-CHEAP.md):"
echo "  export TWS_DB=$INSTALL_ROOT/x-api.db"
echo "  twscrape add_accounts ...  # auth_token + ct0"
echo ""
echo "Run API:"
echo "  cd $INSTALL_ROOT && source .venv/bin/activate"
echo "  X_API_DB=$INSTALL_ROOT/x-api.db uvicorn app.main:app --host 127.0.0.1 --port 8080"
echo ""
echo "Then in /opt/stratat/.env.intake:"
echo "  INTAKE_X_API=off"
echo "  INTAKE_CHEAP_X_URL=http://127.0.0.1:8080"
