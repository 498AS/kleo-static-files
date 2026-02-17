# Kleo Static Files

> Part of [Kleo](https://kleo.498as.com) — your digital fox

Host static files on subdomains with automatic SSL, authentication, and quota management.

```bash
sf sites create docs
sf upload ./build docs
# → https://docs.498as.com
```

## Installation

### Quick Install (Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/498AS/kleo-static-files/main/install.sh | sudo bash
```

This installs the server, configures Caddy, creates a systemd service, and generates your first API key.

### Download Binary

Pre-built binaries for the CLI:

```bash
# Linux x64
curl -fsSL https://github.com/498AS/kleo-static-files/releases/latest/download/sf-linux-x64 -o sf
chmod +x sf && sudo mv sf /usr/local/bin/

# macOS (Apple Silicon)
curl -fsSL https://github.com/498AS/kleo-static-files/releases/latest/download/sf-darwin-arm64 -o sf
chmod +x sf && sudo mv sf /usr/local/bin/

# macOS (Intel)
curl -fsSL https://github.com/498AS/kleo-static-files/releases/latest/download/sf-darwin-x64 -o sf
chmod +x sf && sudo mv sf /usr/local/bin/
```

### From Source

```bash
git clone https://github.com/498AS/kleo-static-files.git
cd kleo-static-files
bun install
```

## Configuration

```bash
export SF_API_URL=http://localhost:3000
export SF_API_KEY=sk_xxxxx
```

### Bootstrap + Smoke Test

```bash
# Generate exports from key + defaults
eval "$(scripts/bootstrap-env.sh --api-key 'sk_xxxxx' --emit-exports)"

# Validate health + authenticated CLI path
scripts/smoke-cli.sh
```

Alternative (write snippet file with restricted permissions):

```bash
scripts/bootstrap-env.sh --api-key 'sk_xxxxx' --write-file ~/.config/kleo/static-files.env
source ~/.config/kleo/static-files.env
scripts/smoke-cli.sh
```

## Usage

### Sites

```bash
sf sites list                     # List all sites
sf sites create <name>            # Create site
sf sites delete <name>            # Delete site and files
sf sites auth <name> <user:pass>  # Set basic auth
sf sites auth <name> --remove     # Remove auth
```

### Files

```bash
sf upload <path> <site>           # Upload file or directory
sf upload <path> <site> --overwrite
sf files <site>                   # List files
sf files <site> delete <path>     # Delete file
```

### Stats

```bash
sf stats                          # Global stats
sf stats <site>                   # Site stats
```

## For AI Agents

This tool is designed to be used by AI agents.

### Install Skill from ClawHub

```bash
clawhub install kleo-static-files
```

Or download manually: [releases.498as.com/static-files.zip](https://releases.498as.com/static-files.zip)

See the [static-files skill](./static-files/) for integration with OpenClaw and other agent frameworks.

### Quick Reference for Agents

```bash
# Deploy a static website
sf sites create mysite
sf upload ./dist mysite
# Result: https://mysite.DOMAIN

# Protected file sharing
sf sites create private
sf sites auth private user:pass
sf upload ./sensitive.pdf private
# Result: https://private.DOMAIN (requires auth)

# Clean deploy (delete all, upload fresh)
sf sites delete mysite
sf sites create mysite
sf upload ./new-build mysite
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SF_API_URL` | - | API endpoint (required) |
| `SF_API_KEY` | - | API key (required) |
| `SF_DOMAIN` | 498as.com | Base domain for sites |

## API

All endpoints require `Authorization: Bearer <api-key>`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/sites` | List sites |
| POST | `/sites` | Create site |
| DELETE | `/sites/{name}` | Delete site |
| PATCH | `/sites/{name}` | Update auth |
| POST | `/sites/{name}/files` | Upload file |
| GET | `/sites/{name}/files` | List files |
| DELETE | `/sites/{name}/files/{path}` | Delete file |
| GET | `/stats` | Global stats |

OpenAPI spec: `GET /openapi.json`

## Architecture

```
┌─────────┐     ┌──────────┐     ┌────────┐
│ sf CLI  │────▶│  Server  │────▶│ SQLite │
└─────────┘     └──────────┘     └────────┘
                     │
                     ▼
               ┌──────────┐
               │  Caddy   │ ← serves files with SSL
               └──────────┘
```

- **Server**: Hono-based API (port 3000)
- **Storage**: SQLite for metadata, filesystem for files
- **SSL**: Automatic via Caddy wildcard
- **Auth**: bcrypt hashes, Caddy basic_auth compatible

## Server Configuration

Environment variables for the server:

| Variable | Default | Description |
|----------|---------|-------------|
| `SF_PORT` | 3000 | API port |
| `SF_DOMAIN` | 498as.com | Base domain |
| `SF_SITES_ROOT` | ./sites | Sites directory |
| `SF_DB_PATH` | ./data/static-files.db | Database path |
| `SF_MAX_FILE_MB` | 50 | Max file size |
| `SF_RATE_LIMIT_MAX` | 100 | Requests per minute |

## Development

```bash
bun install
bun run dev          # Start server with watch
bun run build        # Build binaries
bun run create-key   # Generate API key
bun run sync-caddy   # Regenerate Caddy config
scripts/bootstrap-env.sh --help
scripts/smoke-cli.sh --help
```

## License

MIT
