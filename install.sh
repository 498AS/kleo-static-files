#!/bin/bash
#
# Kleo Static Files — Installation Script
# 
# Installs and configures the static files hosting service.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/498AS/kleo-static-files/main/install.sh | sudo bash
#
# Options:
#   --domain DOMAIN     Base domain (default: 498as.com)
#   --port PORT         API port (default: 3000)
#   --uninstall         Remove the service
#   --upgrade           Upgrade existing installation
#   --status            Check installation status
#

set -e

# === Configuration ===
REPO_URL="https://github.com/498AS/kleo-static-files.git"
INSTALL_DIR="/opt/kleo-static-files"
DATA_DIR="/var/lib/kleo-static-files"
LOG_DIR="/var/log/caddy"
CADDY_SITES_DIR="/etc/caddy/sites.d"
SERVICE_NAME="kleo-static-files"
VERSION="1.0.0"

# Defaults
DOMAIN="${SF_DOMAIN:-498as.com}"
PORT="${SF_PORT:-3000}"
BIND_IPS="${SF_BIND_IPS:-}"

# === Output ===
log()   { echo "[kleo] $1"; }
ok()    { echo "[kleo] OK: $1"; }
err()   { echo "[kleo] ERROR: $1" >&2; exit 1; }
warn()  { echo "[kleo] WARN: $1" >&2; }

# === Parse arguments ===
ACTION="install"
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain) DOMAIN="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --bind) BIND_IPS="$2"; shift 2 ;;
    --uninstall) ACTION="uninstall"; shift ;;
    --upgrade) ACTION="upgrade"; shift ;;
    --status) ACTION="status"; shift ;;
    --help|-h) ACTION="help"; shift ;;
    *) err "Unknown option: $1. Use --help for usage." ;;
  esac
done

# === Help ===
show_help() {
  cat << 'EOF'
Kleo Static Files — Installation Script

USAGE:
  install.sh [OPTIONS]

OPTIONS:
  --domain DOMAIN   Base domain for subdomains (default: 498as.com)
  --port PORT       API server port (default: 3000)
  --bind IPS        IP addresses to bind (auto-detected if not set)
  --upgrade         Upgrade existing installation
  --uninstall       Remove the service (preserves data)
  --status          Check installation status
  --help            Show this help

EXAMPLES:
  # Fresh install
  curl -fsSL https://raw.githubusercontent.com/498AS/kleo-static-files/main/install.sh | sudo bash

  # Install with custom domain
  curl -fsSL ... | sudo bash -s -- --domain example.com

  # Check status
  sudo ./install.sh --status

  # Upgrade
  sudo ./install.sh --upgrade

AFTER INSTALLATION:
  export SF_API_URL=http://localhost:3000
  export SF_API_KEY=<key-from-output>
  sf sites create mysite
  sf upload ./files mysite

FOR AI AGENTS:
  The installation outputs a JSON block with connection details.
  Parse the API_KEY and API_URL from the output.

EOF
}

# === Status ===
show_status() {
  log "Checking installation status..."
  echo ""
  
  # Service
  if systemctl is-active --quiet $SERVICE_NAME 2>/dev/null; then
    echo "Service:     RUNNING"
  elif systemctl is-enabled --quiet $SERVICE_NAME 2>/dev/null; then
    echo "Service:     STOPPED (enabled)"
  else
    echo "Service:     NOT INSTALLED"
  fi
  
  # Installation
  if [ -d "$INSTALL_DIR" ]; then
    echo "Install dir: $INSTALL_DIR"
  else
    echo "Install dir: NOT FOUND"
  fi
  
  # Data
  if [ -d "$DATA_DIR" ]; then
    local sites=$(ls -1 "$DATA_DIR/sites" 2>/dev/null | wc -l)
    echo "Data dir:    $DATA_DIR ($sites sites)"
  else
    echo "Data dir:    NOT FOUND"
  fi
  
  # Health check
  if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then
    echo "API:         OK (http://localhost:$PORT)"
  else
    echo "API:         NOT RESPONDING"
  fi
  
  # Caddy
  if grep -q "import.*sites.d" /etc/caddy/Caddyfile 2>/dev/null; then
    echo "Caddy:       CONFIGURED"
  else
    echo "Caddy:       NOT CONFIGURED"
  fi
  
  echo ""
}

# === Uninstall ===
do_uninstall() {
  log "Uninstalling kleo-static-files..."
  
  systemctl stop $SERVICE_NAME 2>/dev/null || true
  systemctl disable $SERVICE_NAME 2>/dev/null || true
  rm -f /etc/systemd/system/$SERVICE_NAME.service
  systemctl daemon-reload
  
  rm -rf "$INSTALL_DIR"
  rm -f "$CADDY_SITES_DIR/static-files.caddy"
  
  # Reload caddy if running
  systemctl reload caddy 2>/dev/null || true
  
  warn "Data preserved in $DATA_DIR (delete manually if needed)"
  ok "Uninstalled successfully"
}

# === Install/Upgrade ===
do_install() {
  local is_upgrade=false
  [ "$ACTION" = "upgrade" ] && is_upgrade=true
  
  # === Checks ===
  [ "$EUID" -eq 0 ] || err "Run as root or with sudo"
  
  if ! command -v bun >/dev/null; then
    log "Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
  fi
  
  command -v caddy >/dev/null || err "Caddy not found. Install: https://caddyserver.com/docs/install"
  command -v git >/dev/null || err "Git not found"
  
  # === Install ===
  if $is_upgrade; then
    log "Upgrading kleo-static-files..."
  else
    log "Installing kleo-static-files..."
  fi
  
  # Clone or update repo
  if [ -d "$INSTALL_DIR" ]; then
    log "Updating repository..."
    cd "$INSTALL_DIR"
    git fetch origin
    git reset --hard origin/main
  else
    log "Cloning repository..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
  fi
  
  # Install dependencies
  log "Installing dependencies..."
  bun install --frozen-lockfile 2>/dev/null || bun install
  
  # Create directories
  mkdir -p "$DATA_DIR/data"
  mkdir -p "$DATA_DIR/sites"
  mkdir -p "$LOG_DIR"
  mkdir -p "$CADDY_SITES_DIR"
  
  # Detect bind IPs if not set
  if [ -z "$BIND_IPS" ]; then
    local ipv4=$(ip -4 addr show scope global | grep inet | head -1 | awk '{print $2}' | cut -d/ -f1 2>/dev/null || echo "")
    local ipv6=$(ip -6 addr show scope global | grep inet6 | head -1 | awk '{print $2}' | cut -d/ -f1 2>/dev/null || echo "")
    BIND_IPS="${ipv4:-0.0.0.0}"
    [ -n "$ipv6" ] && BIND_IPS="$BIND_IPS $ipv6"
  fi
  
  # Create environment file
  log "Writing configuration..."
  cat > "$INSTALL_DIR/.env" << EOF
# Kleo Static Files configuration
SF_PORT=$PORT
SF_DOMAIN=$DOMAIN
SF_SITES_ROOT=$DATA_DIR/sites
SF_DB_PATH=$DATA_DIR/data/static-files.db
SF_CADDY_SNIPPET=$CADDY_SITES_DIR/static-files.caddy
SF_BIND_IPS="$BIND_IPS"
SF_RATE_LIMIT_WINDOW=60000
SF_RATE_LIMIT_MAX=100
SF_MAX_FILE_MB=50
EOF
  
  # Create systemd service
  log "Creating systemd service..."
  cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=Kleo Static Files API
After=network.target caddy.service

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$(which bun) run server/index.ts
ExecStartPost=$(which bun) run $INSTALL_DIR/scripts/sync-caddy.ts --reload
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  
  # Make scripts executable
  chmod +x "$INSTALL_DIR/scripts/"*.ts
  
  # Update Caddyfile to import sites (remove duplicates first, then ensure exactly one)
  log "Configuring Caddy..."
  if [ -f /etc/caddy/Caddyfile ]; then
    # Remove any existing import lines for our sites dir (prevents duplicates)
    sed -i "\|^import $CADDY_SITES_DIR|d" /etc/caddy/Caddyfile
    # Add import at end of file
    echo "import $CADDY_SITES_DIR/*.caddy" >> /etc/caddy/Caddyfile
  else
    warn "Caddyfile not found at /etc/caddy/Caddyfile - skipping import configuration"
  fi
  
  # Initialize empty caddy snippet
  touch "$CADDY_SITES_DIR/static-files.caddy"
  
  # Enable and start service
  log "Starting service..."
  systemctl daemon-reload
  systemctl enable $SERVICE_NAME
  systemctl restart $SERVICE_NAME
  
  # Wait for service
  sleep 2
  
  # Create API key if new install
  local api_key=""
  if ! $is_upgrade; then
    log "Creating API key..."
    cd "$INSTALL_DIR"
    source .env
    export SF_DB_PATH
    api_key=$(bun run scripts/create-key.ts "admin" 2>&1 | grep "API Key:" | awk '{print $3}' || echo "")
  fi
  
  # Fix database permissions (DB is created by root during install)
  # Make data directory and DB accessible for the service
  if [ -f "$DATA_DIR/data/static-files.db" ]; then
    chmod 664 "$DATA_DIR/data/static-files.db" 2>/dev/null || true
    chmod 664 "$DATA_DIR/data/static-files.db-shm" 2>/dev/null || true
    chmod 664 "$DATA_DIR/data/static-files.db-wal" 2>/dev/null || true
  fi
  chmod 775 "$DATA_DIR/data" 2>/dev/null || true
  chmod 775 "$DATA_DIR/sites" 2>/dev/null || true
  
  # === Output ===
  echo ""
  echo "========================================"
  echo "Kleo Static Files — Installation Complete"
  echo "========================================"
  echo ""
  echo "Version:     $VERSION"
  echo "API URL:     http://localhost:$PORT"
  echo "Domain:      *.$DOMAIN"
  echo "Data:        $DATA_DIR"
  echo ""
  
  if [ -n "$api_key" ]; then
    echo "API Key:     $api_key"
    echo ""
    echo "Save this key! It cannot be recovered."
    echo ""
  fi
  
  # JSON output for AI agents
  echo "# FOR AI AGENTS (parse this JSON):"
  echo "KLEO_SF_CONFIG_BEGIN"
  cat << EOF
{
  "status": "installed",
  "version": "$VERSION",
  "api_url": "http://localhost:$PORT",
  "api_key": "$api_key",
  "domain": "$DOMAIN",
  "data_dir": "$DATA_DIR",
  "service": "$SERVICE_NAME",
  "skill_clawhub": "kleo-static-files",
  "skill_download": "https://releases.498as.com/static-files.zip"
}
EOF
  echo "KLEO_SF_CONFIG_END"
  echo ""
  
  echo "Usage:"
  echo "  export SF_API_URL=http://localhost:$PORT"
  [ -n "$api_key" ] && echo "  export SF_API_KEY=$api_key"
  echo "  sf sites create mysite"
  echo "  sf upload ./files mysite"
  echo ""
  echo "Service commands:"
  echo "  systemctl status $SERVICE_NAME"
  echo "  journalctl -u $SERVICE_NAME -f"
  echo ""
  echo "AI Agent Skill:"
  echo "  clawhub install kleo-static-files"
  echo "  # or: https://releases.498as.com/static-files.zip"
  echo ""
}

# === Main ===
case "$ACTION" in
  install|upgrade) do_install ;;
  uninstall) do_uninstall ;;
  status) show_status ;;
  help) show_help ;;
esac
