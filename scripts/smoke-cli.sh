#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

API_URL="${SF_API_URL:-http://localhost:3000}"
API_KEY="${SF_API_KEY:-}"

usage() {
  cat <<'EOF'
smoke-cli.sh - Quick health + auth smoke checks for Static Files CLI

Usage:
  scripts/smoke-cli.sh [--api-url <url>] [--api-key <key>]

Environment:
  SF_API_URL   API endpoint (default: http://localhost:3000)
  SF_API_KEY   API key (required)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-url) API_URL="${2:-}"; shift 2 ;;
    --api-key) API_KEY="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Error: Unknown option '$1'" >&2; usage; exit 1 ;;
  esac
done

if [ -z "$API_KEY" ]; then
  echo "Error: SF_API_KEY is required (set env or pass --api-key)." >&2
  exit 1
fi

if command -v sf >/dev/null 2>&1; then
  SF_CMD=(sf)
else
  SF_CMD=(bun run cli/index.ts)
fi

echo "[smoke] API URL: ${API_URL}"
echo "[smoke] Step 1/2: health check"
if curl -fsS "${API_URL}/health" >/tmp/sf-smoke-health.json 2>/tmp/sf-smoke-health.err; then
  echo "[smoke] OK: /health reachable"
else
  echo "[smoke] FAIL: /health unreachable"
  sed -n '1,3p' /tmp/sf-smoke-health.err || true
  exit 1
fi

echo "[smoke] Step 2/2: authenticated sf sites list"
set +e
SF_API_URL="${API_URL}" SF_API_KEY="${API_KEY}" "${SF_CMD[@]}" sites list --json >/tmp/sf-smoke-sites.out 2>/tmp/sf-smoke-sites.err
cmd_exit=$?
set -e

if [ "$cmd_exit" -eq 0 ]; then
  echo "[smoke] OK: authenticated CLI request succeeded"
  echo "[smoke] PASS"
  exit 0
fi

stderr_sample="$(sed -n '1,5p' /tmp/sf-smoke-sites.err || true)"
if echo "$stderr_sample" | grep -qiE "auth|invalid api key|401"; then
  echo "[smoke] FAIL: authentication rejected (check SF_API_KEY)"
elif echo "$stderr_sample" | grep -qiE "connect|refused|timed out|network"; then
  echo "[smoke] FAIL: connectivity error (check SF_API_URL/API service)"
else
  echo "[smoke] FAIL: CLI request failed"
fi

sed -n '1,8p' /tmp/sf-smoke-sites.err || true
exit 1
