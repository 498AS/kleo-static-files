# Static Files Skill

Host static files on subdomains via `sf` CLI.

## Quick Reference

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

## Config

Set via environment:
```bash
SF_API_URL=https://api.498as.com
SF_API_KEY=sk_xxxxx
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /sites | List sites |
| POST | /sites | Create site |
| DELETE | /sites/:name | Delete site |
| PATCH | /sites/:name | Update auth |
| POST | /sites/:name/files | Upload file |
| GET | /sites/:name/files | List files |
| DELETE | /sites/:name/files/:path | Delete file |
| GET | /stats | Global stats |
| GET | /stats/:name | Site stats |
| GET | /openapi.json | OpenAPI spec |

## Examples

### Create site and upload

```bash
sf sites create docs
sf upload ./README.md docs
# => https://docs.498as.com/README.md
```

### Protected site

```bash
sf sites create private
sf sites auth private admin:secretpass123
sf upload ./secret.pdf private
# => https://private.498as.com/secret.pdf (requires auth)
```

### Upload directory

```bash
sf sites create app
sf upload ./dist/ app
# Uploads all files preserving structure
```

## JSON Output

Add `--json` for machine-readable output:

```bash
sf sites list --json
sf upload file.txt mysite --json
sf stats --json
```
