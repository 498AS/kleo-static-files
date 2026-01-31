# Static Files Skill

Host static files on subdomains via `sf` CLI.

## Quick Start

```bash
# Set API credentials
export SF_API_KEY=sk_xxxxx
export SF_API_URL=https://api.498as.com

# Create and populate a site
sf sites create docs
sf upload ./README.md docs
# => https://docs.498as.com/README.md
```

## CLI Reference

### Sites

```bash
sf sites list                    # List all sites
sf sites create docs             # Create docs.498as.com
sf sites delete oldsite          # Delete site + files
sf sites auth private user:pass  # Add basic auth
sf sites auth private --remove   # Remove auth
```

### Upload

```bash
sf upload index.html mysite           # Upload to root
sf upload style.css mysite css/       # Upload to css/
sf upload ./dist/ mysite              # Upload directory
sf upload file.pdf mysite --overwrite # Replace existing
```

### Files

```bash
sf files mysite                  # List files
sf files mysite delete old.txt   # Delete file
```

### Stats

```bash
sf stats                         # Global stats
sf stats mysite                  # Site stats
```

## Environment Variables

### Required

```bash
SF_API_KEY=sk_xxxxx           # API authentication key
```

### Optional

```bash
SF_API_URL=http://localhost:3000  # API endpoint (default)
```

## API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /health | Health check | No |
| GET | /openapi.json | OpenAPI spec | No |
| GET | /sites | List sites | Yes |
| POST | /sites | Create site | Yes |
| DELETE | /sites/:name | Delete site | Yes |
| PATCH | /sites/:name | Update auth | Yes |
| POST | /sites/:name/files | Upload file | Yes |
| GET | /sites/:name/files | List files | Yes |
| DELETE | /sites/:name/files/:path | Delete file | Yes |
| GET | /stats | Global stats | Yes |
| GET | /stats/:name | Site stats | Yes |

## JSON Output

Add `--json` for machine-readable output:

```bash
sf sites list --json
sf upload file.txt mysite --json
sf stats --json
```

## Limits

| Limit | Default | Config |
|-------|---------|--------|
| File size | 50MB | `SF_MAX_FILE_MB` |
| Site quota | 100MB | Per-site in DB |
| Rate limit | 100/min | `SF_RATE_LIMIT_MAX` |

## Examples

### Create site with auth

```bash
sf sites create private
sf sites auth private admin:secretpass123
sf upload ./secret.pdf private
# => https://private.498as.com/secret.pdf (requires auth)
```

### Upload entire directory

```bash
sf sites create app
sf upload ./dist/ app
# Uploads all files preserving structure
```

### Check quota

```bash
sf stats mysite --json | jq '.size'
# Returns used bytes
```

## Troubleshooting

### "SF_API_KEY environment variable is required"

Set your API key:
```bash
export SF_API_KEY=sk_xxxxx
```

### "Cannot connect to API"

- Check server is running
- Verify `SF_API_URL` is correct
- Check network/firewall

### "Invalid API key"

- Verify key is correct (starts with `sk_`)
- Key may have been revoked

### "Rate limit exceeded"

Wait for the rate limit window to reset. Check `Retry-After` header.

### "Quota exceeded"

Site storage quota reached. Delete files or request quota increase.

### "File too large"

File exceeds max upload size. Compress or split the file.

## Server Admin

### Generate API key

```bash
bun run scripts/create-key.ts "key-name"
# Outputs: sk_xxxxx (save this!)
```

### Health check

```bash
curl http://localhost:3000/health
```

### Monitor logs

Logs output as JSON to stdout:
```json
{"level":"info","method":"POST","path":"/sites","status":201,"duration":45,"timestamp":"..."}
```
