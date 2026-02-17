---
name: static-files
description: >
  Host static files on subdomains with optional authentication. Use when you need to
  serve HTML, images, CSS, JS, or any static content on a dedicated subdomain. Supports
  file upload, basic auth, quota management, and automatic SSL via Caddy. Commands
  include sf sites (create/list/delete), sf upload (files/directories), sf files (list/delete).
---

# Static Files Hosting

Host static content on `*.{domain}` subdomains with automatic SSL.

> **Note:** The domain is configured via `SF_DOMAIN` environment variable (set during installation).
> Examples below use `yourdomain.com` as placeholder.

## Preflight (Required)

Run this before any `sf ...` command:

```bash
# 1) Required env
API_URL="${SF_API_URL:-http://localhost:3000}"
echo "$API_URL"
echo "$SF_API_KEY"

# 2) API health
curl -i "$API_URL/health"

# 3) Doctor (if available in your sf version)
if sf help 2>/dev/null | grep -q "doctor"; then
  sf doctor
fi
```

Expected:
- API URL resolves to `http://localhost:3000` unless `SF_API_URL` is set
- `SF_API_KEY` is set
- `/health` returns `200`
- If available, `sf doctor` shows `health` and `auth` checks as PASS

If preflight fails, fix runtime/config first; do not proceed with uploads/site changes.

## Runtime Mode Detection

Choose the branch that matches your environment:

### A) Systemd Host (recommended production mode)

```bash
sudo /opt/kleo-static-files/install.sh --status
systemctl status kleo-static-files
```

Use this when systemd is available and managing the service.

### B) No-Systemd Session / Container / CI

```bash
cd /opt/kleo-static-files
set -a && source .env && set +a
bun run server/index.ts
```

In no-systemd environments, run the API process manually and keep it alive in your session/supervisor.

## Quick Reference

```bash
# Create site
sf sites create mysite
# → https://mysite.yourdomain.com (or your configured domain)

# Upload file
sf upload ./index.html mysite

# Upload directory  
sf upload ./dist mysite

# Add authentication
sf sites auth mysite admin:secretpass123

# List files
sf files mysite

# Delete file
sf files mysite delete path/to/file.txt

# Delete site
sf sites delete mysite
```

## Environment Setup

```bash
export SF_API_URL=http://localhost:3000   # API endpoint
export SF_API_KEY=sk_xxxxx                # Your API key
export SF_DOMAIN=yourdomain.com           # Your configured domain (optional, for URL display)
```

## Workflows

### Deploy a Static Website

```bash
# 1. Create the site
sf sites create docs

# 2. Upload the build directory
sf upload ./build docs

# 3. Verify (replace with your domain)
curl -I https://docs.yourdomain.com
```

### Protected File Sharing

```bash
# 1. Create site with auth
sf sites create private
sf sites auth private user:strongpassword

# 2. Upload sensitive files
sf upload ./reports private

# 3. Share URL + credentials
# https://private.yourdomain.com (user / strongpassword)
```

### Update Existing Files

```bash
# Overwrite existing file
sf upload ./new-version.pdf mysite --overwrite

# Or delete and re-upload
sf files mysite delete old-file.pdf
sf upload ./new-file.pdf mysite
```

## CLI Commands

### sites

| Command | Description |
|---------|-------------|
| `sf sites list` | List all sites |
| `sf sites create <name>` | Create new site |
| `sf sites delete <name>` | Delete site and all files |
| `sf sites auth <name> <user:pass>` | Set basic auth |
| `sf sites auth <name> --remove` | Remove auth |

### upload

```bash
sf upload <path> <site> [subdir] [--overwrite] [--json]
```

- `path`: File or directory to upload
- `site`: Target site name
- `subdir`: Optional subdirectory
- `--overwrite`: Replace existing files
- `--json`: Output JSON

### files

| Command | Description |
|---------|-------------|
| `sf files <site>` | List all files |
| `sf files <site> delete <path>` | Delete specific file |

### stats

```bash
sf stats              # Global stats
sf stats <site>       # Site-specific stats
```

## API Endpoints

Base: `$SF_API_URL` with `Authorization: Bearer $SF_API_KEY`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sites` | List sites |
| POST | `/sites` | Create site |
| DELETE | `/sites/{name}` | Delete site |
| PATCH | `/sites/{name}` | Update auth |
| GET | `/sites/{name}/files` | List files |
| POST | `/sites/{name}/files` | Upload file |
| DELETE | `/sites/{name}/files/{path}` | Delete file |
| GET | `/stats` | Global stats |
| GET | `/stats/{name}` | Site stats |
| GET | `/health` | Health check |

## Constraints

- **Site names**: lowercase, alphanumeric, hyphens only (max 63 chars)
- **File size**: 50MB default (configurable)
- **Quota**: 100MB per site default
- **Rate limit**: 100 requests/minute per API key

## Troubleshooting

### "Cannot connect to API"
```bash
# Fast diagnosis
sf doctor

# Manual health check
curl -i "$SF_API_URL/health"
```

If systemd host:

```bash
sudo /opt/kleo-static-files/install.sh --status
systemctl status kleo-static-files
journalctl -u kleo-static-files -n 100 --no-pager
```

If no-systemd runtime:

```bash
pgrep -af "bun run server/index.ts"
cd /opt/kleo-static-files
set -a && source .env && set +a
bun run server/index.ts

# In another shell
curl -i "$SF_API_URL/health"
```

### "Invalid API key"
```bash
# Verify key is set
echo $SF_API_KEY

# Validate auth path
sf doctor --json

# Create new key if needed
bun run /opt/kleo-static-files/scripts/create-key.ts "new-key"
```

### "Quota exceeded"
```bash
# Check current usage
sf stats mysite

# Delete unused files
sf files mysite delete large-file.zip
```

### Site not accessible via HTTPS
```bash
# Verify DNS points to server (use your domain)
dig mysite.yourdomain.com

# Check Caddy config
cat /etc/caddy/sites.d/static-files.caddy

# Resync Caddy
bun run /opt/kleo-static-files/scripts/sync-caddy.ts --reload
```

## Installation

### Server Installation (run once on host)

```bash
curl -fsSL https://raw.githubusercontent.com/498AS/kleo-static-files/main/install.sh | sudo bash
```

The installer outputs JSON with connection details between `KLEO_SF_CONFIG_BEGIN` and `KLEO_SF_CONFIG_END` markers. Parse this to get `api_url` and `api_key`.

### After Installation

```bash
export SF_API_URL=http://localhost:3000
export SF_API_KEY=sk_xxxxx  # from installer output
```

### Check Status

```bash
sudo /opt/kleo-static-files/install.sh --status
```

See [references/install.md](references/install.md) for manual installation.

## Alternative CLI (Shell Wrapper)

If you need a lightweight alternative to the Bun CLI, use the curl-based shell wrapper:

```bash
# Use directly
/opt/kleo-static-files/cli/sf.sh sites list

# Or create an alias
alias sf='/opt/kleo-static-files/cli/sf.sh'

# Works the same way
sf sites create mysite
sf upload ./files mysite
```

The shell wrapper requires only `bash` and `curl`, no Bun installation needed.
