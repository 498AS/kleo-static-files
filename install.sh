#!/bin/bash
#
# kleo-static-files installer
# 
# Installs and configures the static files hosting service.
# Run as root or with sudo.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/498AS/kleo-static-files/main/install.sh | bash
#   # or
#   ./install.sh
#
# Options:
#   --domain DOMAIN     Base domain (default: 498as.com)
#   --port PORT         API port (default: 3000)
#   --uninstall         Remove the service
#

set -e

# === Configuration ===
REPO_URL="https://github.com/498AS/kleo-static-files.git"
INSTALL_DIR="/opt/kleo-static-files"
DATA_DIR="/var/lib/kleo-static-files"
LOG_DIR="/var/log/caddy"
CADDY_SITES_DIR="/etc/caddy/sites.d"
SERVICE_NAME="kleo-static-files"

# Defaults (can be overridden)
DOMAIN="${SF_DOMAIN:-498as.com}"
PORT="${SF_PORT:-3000}"
BIND_IPS="${SF_BIND_IPS:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# === Parse arguments ===
UNINSTALL=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain) DOMAIN="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --bind) BIND_IPS="$2"; shift 2 ;;
    --uninstall) UNINSTALL=true; shift ;;
    *) error "Unknown option: $1" ;;
  esac
done

# === Uninstall ===
if [ "$UNINSTALL" = true ]; then
  log "Uninstalling kleo-static-files..."
  
  systemctl stop $SERVICE_NAME 2>/dev/null || true
  systemctl disable $SERVICE_NAME 2>/dev/null || true
  rm -f /etc/systemd/system/$SERVICE_NAME.service
  systemctl daemon-reload
  
  rm -rf "$INSTALL_DIR"
  rm -f "$CADDY_SITES_DIR/static-files.caddy"
  
  warn "Data preserved in $DATA_DIR (delete manually if needed)"
  log "Uninstalled successfully"
  exit 0
fi

# === Checks ===
[ "$EUID" -eq 0 ] || error "Run as root or with sudo"

command -v bun >/dev/null || error "Bun not found. Install: curl -fsSL https://bun.sh/install | bash"
command -v caddy >/dev/null || error "Caddy not found. Install: https://caddyserver.com/docs/install"
command -v git >/dev/null || error "Git not found"

# === Install ===
log "Installing kleo-static-files..."

# Clone or update repo
if [ -d "$INSTALL_DIR" ]; then
  log "Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull --ff-only
else
  log "Cloning repository..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install dependencies
log "Installing dependencies..."
bun install --frozen-lockfile 2>/dev/null || bun install

# Create directories
log "Creating directories..."
mkdir -p "$DATA_DIR/data"
mkdir -p "$DATA_DIR/sites"
mkdir -p "$LOG_DIR"
mkdir -p "$CADDY_SITES_DIR"

# Detect bind IPs if not set
if [ -z "$BIND_IPS" ]; then
  # Try to get public IPv4 and IPv6
  IPV4=$(ip -4 addr show scope global | grep inet | head -1 | awk '{print $2}' | cut -d/ -f1 || echo "")
  IPV6=$(ip -6 addr show scope global | grep inet6 | head -1 | awk '{print $2}' | cut -d/ -f1 || echo "")
  BIND_IPS="${IPV4:-0.0.0.0}"
  [ -n "$IPV6" ] && BIND_IPS="$BIND_IPS $IPV6"
fi

# Create environment file
log "Creating environment file..."
cat > "$INSTALL_DIR/.env" << EOF
# kleo-static-files configuration
SF_PORT=$PORT
SF_DOMAIN=$DOMAIN
SF_SITES_ROOT=$DATA_DIR/sites
SF_DB_PATH=$DATA_DIR/data/static-files.db
SF_CADDY_SNIPPET=$CADDY_SITES_DIR/static-files.caddy
SF_BIND_IPS=$BIND_IPS

# Rate limiting
SF_RATE_LIMIT_WINDOW=60000
SF_RATE_LIMIT_MAX=100

# File size limit (MB)
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
ExecStart=/root/.bun/bin/bun run server/index.ts
ExecStartPost=$INSTALL_DIR/scripts/sync-caddy.ts --reload
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Make scripts executable
chmod +x "$INSTALL_DIR/scripts/"*.ts

# Update Caddyfile to import sites
if ! grep -q "import $CADDY_SITES_DIR" /etc/caddy/Caddyfile 2>/dev/null; then
  log "Updating Caddyfile..."
  
  # Add import at the end of the global block or at the top
  if grep -q "^{" /etc/caddy/Caddyfile; then
    # Has global block, add import after it
    sed -i "/^}/a\\\\nimport $CADDY_SITES_DIR/*.caddy" /etc/caddy/Caddyfile
  else
    # No global block, add at top
    sed -i "1i import $CADDY_SITES_DIR/*.caddy\\n" /etc/caddy/Caddyfile
  fi
fi

# Initialize empty caddy snippet
touch "$CADDY_SITES_DIR/static-files.caddy"

# Enable and start service
log "Starting service..."
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl start $SERVICE_NAME

# Wait for service to be ready
sleep 2

# Create initial API key
log "Creating initial API key..."
cd "$INSTALL_DIR"
source .env
export SF_DB_PATH
API_KEY=$(bun run scripts/create-key.ts "admin" 2>&1 | grep "API Key:" | awk '{print $3}')

# Summary
echo ""
echo "=============================================="
echo -e "${GREEN}Installation complete!${NC}"
echo "=============================================="
echo ""
echo "API URL:     http://localhost:$PORT"
echo "Domain:      *.$DOMAIN"
echo "Data:        $DATA_DIR"
echo ""
if [ -n "$API_KEY" ]; then
  echo -e "${YELLOW}API Key:     $API_KEY${NC}"
  echo ""
  echo "Save this key! It cannot be recovered."
  echo ""
fi
echo "CLI usage:"
echo "  export SF_API_URL=http://localhost:$PORT"
echo "  export SF_API_KEY=$API_KEY"
echo "  sf sites create mysite"
echo "  sf upload ./file.txt mysite"
echo ""
echo "Service management:"
echo "  systemctl status $SERVICE_NAME"
echo "  journalctl -u $SERVICE_NAME -f"
echo ""
