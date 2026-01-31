# Static Files API

A simple API for managing static file hosting on subdomains. Create sites, upload files, and serve them via Caddy.

## Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Create an API Key

```bash
bun run create-key "my-app"
# Save the output key - it cannot be recovered!
```

### 3. Start the Server

```bash
# Development (with hot reload)
bun run dev

# Production
bun run start
```

### 4. Use the CLI

```bash
export SF_API_KEY=sk_xxxxx
export SF_API_URL=http://localhost:3000

# Create a site
sf sites create mysite

# Upload files
sf upload ./index.html mysite
sf upload ./styles.css mysite css/

# List files
sf files mysite
```

## Configuration

### Server Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SF_PORT` | `3000` | Server port |
| `SF_SITES_ROOT` | `./sites` | Directory for site files |
| `SF_DB_PATH` | `./data/static-files.db` | SQLite database path |
| `SF_DOMAIN` | `498as.com` | Base domain for sites |
| `SF_MAX_FILE_MB` | `50` | Maximum file size in MB |
| `SF_RATE_LIMIT_WINDOW` | `60000` | Rate limit window (ms) |
| `SF_RATE_LIMIT_MAX` | `100` | Max requests per window |
| `CADDY_ADMIN_URL` | `http://localhost:2019` | Caddy admin API URL |

### CLI Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SF_API_URL` | `http://localhost:3000` | API server URL |
| `SF_API_KEY` | (required) | API key for authentication |

## API Endpoints

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (no auth) |
| `GET` | `/openapi.json` | OpenAPI spec (no auth) |

### Sites

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sites` | List all sites |
| `POST` | `/sites` | Create a site |
| `DELETE` | `/sites/:name` | Delete a site |
| `PATCH` | `/sites/:name` | Update site auth |

### Files

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sites/:name/files` | List files |
| `POST` | `/sites/:name/files` | Upload file |
| `DELETE` | `/sites/:name/files/:path` | Delete file |

### Stats

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/stats` | Global statistics |
| `GET` | `/stats/:name` | Site statistics |

## CLI Commands

```bash
# Sites
sf sites list                    # List all sites
sf sites create docs             # Create docs.498as.com
sf sites delete oldsite          # Delete site + files
sf sites auth private user:pass  # Add basic auth
sf sites auth private --remove   # Remove auth

# Upload
sf upload index.html mysite           # Upload to root
sf upload style.css mysite css/       # Upload to css/
sf upload ./dist/ mysite              # Upload directory
sf upload file.pdf mysite --overwrite # Replace existing

# Files
sf files mysite                  # List files
sf files mysite delete old.txt   # Delete file

# Stats
sf stats                         # Global stats
sf stats mysite                  # Site stats
```

## Security Features

### Path Traversal Protection

All file paths are validated to prevent directory traversal attacks. Attempts to access files outside the site directory (e.g., `../etc/passwd`) are rejected.

### Rate Limiting

API requests are rate-limited per API key (or IP if no key). Default: 100 requests per minute.

Response headers include:
- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Seconds until window resets

### Storage Quotas

Each site has a storage quota (default 100MB). Uploads that exceed the quota are rejected with a 413 error.

### File Size Limits

Individual file uploads are limited to 50MB by default. Configure via `SF_MAX_FILE_MB`.

## Monitoring

### Health Check

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"2026-01-31T12:00:00.000Z"}
```

### Logs

The server outputs JSON logs to stdout, suitable for journald:

```json
{"level":"info","method":"POST","path":"/sites","status":201,"duration":45,"timestamp":"..."}
```

## Development

### Run Tests

```bash
bun test
```

### Generate OpenAPI Types

```bash
bun run gen-types
```

## Troubleshooting

### "Cannot connect to API"

- Check the server is running: `systemctl status static-files` (if using systemd)
- Verify `SF_API_URL` points to the correct endpoint
- Check firewall rules allow the connection

### "Invalid API key"

- Ensure `SF_API_KEY` is set in your environment
- Verify the key hasn't been revoked
- Keys start with `sk_` - don't include quotes in the env var

### "Rate limit exceeded"

- Wait for the window to reset (check `Retry-After` header)
- Consider requesting a higher limit for your API key

### "Quota exceeded"

- Delete unused files to free space
- Request a quota increase from the administrator

### "File too large"

- Compress the file or split into smaller parts
- Contact administrator if you need higher limits

## Architecture

```
kleo-static-files/
├── cli/                 # CLI tool source
│   ├── client.ts        # API client
│   ├── commands.ts      # Command implementations
│   └── index.ts         # CLI entry point
├── server/              # API server source
│   ├── index.ts         # Main server
│   ├── db.ts            # SQLite database
│   ├── schema.ts        # Zod schemas
│   ├── caddy.ts         # Caddy integration
│   ├── middleware/      # Express middleware
│   │   ├── logging.ts   # JSON logging
│   │   └── rate-limit.ts# Rate limiting
│   └── utils/           # Utilities
│       └── safe-path.ts # Path traversal protection
├── scripts/             # Utility scripts
│   └── create-key.ts    # API key generator
├── __tests__/           # Test files
├── docs/plans/          # Implementation plans
└── SKILL.md             # Quick reference
```

## License

MIT
