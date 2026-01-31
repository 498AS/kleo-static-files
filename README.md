# kleo-static-files

Static file hosting on subdomains with automatic SSL, basic auth, and quota management.

```bash
sf sites create docs
sf upload ./build docs
# → https://docs.498as.com
```

## Features

- **Subdomain hosting**: Each site gets `{name}.{domain}`
- **Automatic SSL**: Via Caddy, zero config
- **Basic auth**: Optional password protection
- **Quotas**: Per-site storage limits
- **Rate limiting**: API protection built-in
- **CLI & API**: Full control via `sf` command or REST API

## Quick Start

### Install

```bash
curl -fsSL https://raw.githubusercontent.com/498AS/kleo-static-files/main/install.sh | sudo bash
```

### Configure

```bash
export SF_API_URL=http://localhost:3000
export SF_API_KEY=sk_xxxxx  # shown during install
```

### Use

```bash
# Create a site
sf sites create mysite

# Upload files
sf upload ./index.html mysite
sf upload ./images mysite

# Add auth (optional)
sf sites auth mysite admin:secretpass

# View files
sf files mysite

# Check stats
sf stats mysite
```

## CLI Reference

### Sites

```bash
sf sites list                     # List all sites
sf sites create <name>            # Create site
sf sites delete <name>            # Delete site + files
sf sites auth <name> <user:pass>  # Set basic auth
sf sites auth <name> --remove     # Remove auth
```

### Files

```bash
sf upload <path> <site> [subdir]  # Upload file/directory
sf upload <path> <site> --overwrite
sf files <site>                   # List files
sf files <site> delete <path>     # Delete file
```

### Stats

```bash
sf stats         # Global stats
sf stats <site>  # Site stats
```

## API

All endpoints require `Authorization: Bearer <api-key>`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/sites` | List sites |
| POST | `/sites` | Create site |
| DELETE | `/sites/{name}` | Delete site |
| PATCH | `/sites/{name}` | Update auth |
| GET | `/sites/{name}/files` | List files |
| POST | `/sites/{name}/files` | Upload file |
| DELETE | `/sites/{name}/files/{path}` | Delete file |
| GET | `/stats` | Global stats |
| GET | `/stats/{name}` | Site stats |

Full OpenAPI spec: `GET /openapi.json`

## Configuration

Environment variables (in `.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `SF_PORT` | 3000 | API port |
| `SF_DOMAIN` | 498as.com | Base domain |
| `SF_SITES_ROOT` | ./sites | Sites directory |
| `SF_DB_PATH` | ./data/static-files.db | Database path |
| `SF_MAX_FILE_MB` | 50 | Max file size |
| `SF_RATE_LIMIT_MAX` | 100 | Requests per minute |

## AI Agent Skill

This repo includes an OpenClaw skill for AI agents:

```
static-files/
├── SKILL.md           # Agent instructions
├── references/
│   └── install.md     # Installation guide
└── scripts/
    └── sf-helper.sh   # Helper commands
```

Install the skill in OpenClaw:
```bash
cp -r static-files /path/to/openclaw/skills/
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────┐
│   Client    │────▶│  sf CLI/API  │────▶│ SQLite  │
└─────────────┘     └──────────────┘     └─────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │    Caddy     │◀──── sync-caddy.ts
                    │ (file_server)│
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │    Files     │
                    │ /var/lib/... │
                    └──────────────┘
```

## Development

```bash
# Install deps
bun install

# Run server
bun run server/index.ts

# Run CLI
bun run cli/index.ts sites list

# Generate types from OpenAPI
bun run scripts/gen-types.ts
```

## License

MIT
