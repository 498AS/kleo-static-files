#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

ENV_FILE="${REPO_ROOT}/.env"
PORT_DEFAULT="3000"
DOMAIN_DEFAULT="498as.com"

API_KEY="${SF_API_KEY:-}"
API_URL="${SF_API_URL:-}"
DOMAIN="${SF_DOMAIN:-}"
WRITE_FILE=""
EMIT_EXPORTS="false"

usage() {
  cat <<'EOF'
bootstrap-env.sh - Prepare SF_* environment variables safely

Usage:
  scripts/bootstrap-env.sh [options]

Options:
  --api-key <key>       API key (if omitted, uses SF_API_KEY or prompts interactively)
  --api-url <url>       API URL (default from .env SF_PORT or http://localhost:3000)
  --domain <domain>     Domain (default from .env SF_DOMAIN or 498as.com)
  --emit-exports        Print export commands to stdout
  --write-file <path>   Write shell exports to a file (chmod 600)
  -h, --help            Show this help

Examples:
  scripts/bootstrap-env.sh --api-key sk_xxxxx --emit-exports
  scripts/bootstrap-env.sh --api-key sk_xxxxx --write-file ~/.config/kleo/static-files.env
EOF
}

mask_key() {
  local key="$1"
  local len=${#key}
  if [ "$len" -le 8 ]; then
    echo "********"
    return
  fi
  echo "${key:0:4}...${key: -4}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-key) API_KEY="${2:-}"; shift 2 ;;
    --api-url) API_URL="${2:-}"; shift 2 ;;
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --emit-exports) EMIT_EXPORTS="true"; shift ;;
    --write-file) WRITE_FILE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Error: Unknown option '$1'" >&2; usage; exit 1 ;;
  esac
done

if [ -f "$ENV_FILE" ]; then
  if [ -z "$DOMAIN" ]; then
    env_domain="$(grep -E '^SF_DOMAIN=' "$ENV_FILE" | head -1 | cut -d'=' -f2- | tr -d '"' || true)"
    [ -n "$env_domain" ] && DOMAIN="$env_domain"
  fi
  if [ -z "$API_URL" ]; then
    env_port="$(grep -E '^SF_PORT=' "$ENV_FILE" | head -1 | cut -d'=' -f2- | tr -d '"' || true)"
    if [ -n "$env_port" ]; then
      API_URL="http://localhost:${env_port}"
    fi
  fi
fi

[ -n "$DOMAIN" ] || DOMAIN="$DOMAIN_DEFAULT"
[ -n "$API_URL" ] || API_URL="http://localhost:${PORT_DEFAULT}"

if [ -z "$API_KEY" ]; then
  if [ -t 0 ]; then
    read -r -s -p "Enter SF_API_KEY: " API_KEY
    echo ""
  else
    echo "Error: SF_API_KEY is required (use --api-key or set SF_API_KEY)." >&2
    exit 1
  fi
fi

if [ -z "$API_KEY" ]; then
  echo "Error: SF_API_KEY cannot be empty." >&2
  exit 1
fi

if [ -n "$WRITE_FILE" ]; then
  umask 077
  cat > "$WRITE_FILE" <<EOF
export SF_API_URL='${API_URL}'
export SF_API_KEY='${API_KEY}'
export SF_DOMAIN='${DOMAIN}'
EOF
  chmod 600 "$WRITE_FILE"
  echo "Wrote environment snippet to ${WRITE_FILE} (permissions: 600)."
fi

if [ "$EMIT_EXPORTS" = "true" ]; then
  cat <<EOF
export SF_API_URL='${API_URL}'
export SF_API_KEY='${API_KEY}'
export SF_DOMAIN='${DOMAIN}'
EOF
  exit 0
fi

echo "Environment prepared:"
echo "  SF_API_URL=${API_URL}"
echo "  SF_API_KEY=$(mask_key "$API_KEY")"
echo "  SF_DOMAIN=${DOMAIN}"
echo ""
echo "Next steps:"
echo "  1) eval \"\$(scripts/bootstrap-env.sh --api-key '<key>' --emit-exports)\""
echo "  2) scripts/smoke-cli.sh"
