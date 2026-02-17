import { DOMAIN } from "./client";

export const MAIN_HELP = `
Static Files - Host static files on subdomains

USAGE
  sf <command> [options]

COMMANDS
  sites     Manage hosted sites (subdomains)
  upload    Upload files to a site
  files     List or delete files from a site
  stats     View access statistics
  doctor    Diagnose env, API connectivity, and auth

EXAMPLES
  sf sites create docs              # Create docs.${DOMAIN}
  sf upload ./api.pdf docs          # Upload to docs site
  sf upload ./img.png docs assets/  # Upload to docs/assets/

CONFIG
  SF_API_URL    API endpoint (default: http://localhost:3000)
  SF_API_KEY    API key for authentication
  SF_DOMAIN     Domain for sites (default: ${DOMAIN})
`.trim();

export const SITES_HELP = `
Manage hosted sites (subdomains)

USAGE
  sf sites <action> [options]

ACTIONS
  list                    List all sites
  create <name>           Create new site at <name>.${DOMAIN}
  delete <name>           Delete site and all its files
  auth <name> <user:pass> Set basic auth for site
  auth <name> --remove    Remove basic auth

OPTIONS
  --json                  Output as JSON (for scripting)

EXAMPLES
  sf sites list
  sf sites create myproject
  sf sites delete oldsite
  sf sites auth private admin:secret123
  sf sites auth private --remove

TAGS: sites, subdomains, hosting
`.trim();

export const UPLOAD_HELP = `
Upload files to a site

USAGE
  sf upload <file> <site> [path/]

ARGUMENTS
  file    Local file or directory to upload
  site    Target site name (without .${DOMAIN})
  path    Optional subdirectory on the site

OPTIONS
  --overwrite    Replace existing files (default: error if exists)
  --json         Output result as JSON

EXAMPLES
  sf upload index.html mysite           # Upload to root
  sf upload style.css mysite css/       # Upload to css/
  sf upload ./dist/ mysite              # Upload entire directory

TAGS: upload, files, hosting
`.trim();

export const FILES_HELP = `
List or delete files from a site

USAGE
  sf files <site> [action] [path]

ACTIONS
  list              List all files (default)
  delete <path>     Delete a specific file

OPTIONS
  --json            Output as JSON

EXAMPLES
  sf files mysite                       # List all files
  sf files mysite delete old.txt        # Delete a file

TAGS: files, list, delete
`.trim();

export const STATS_HELP = `
View access statistics

USAGE
  sf stats [site]

ARGUMENTS
  site    Optional site name for site-specific stats

OPTIONS
  --json            Output as JSON

EXAMPLES
  sf stats                              # Global stats
  sf stats mysite                       # Stats for mysite

TAGS: stats, analytics, monitoring
`.trim();

export const DOCTOR_HELP = `
Diagnose configuration and connectivity

USAGE
  sf doctor [--json]

CHECKS
  env       Validate SF_API_URL/SF_API_KEY/SF_DOMAIN presence
  health    Check API /health reachability
  auth      Check authenticated request to /sites

OPTIONS
  --json            Output machine-readable diagnostics

EXAMPLES
  sf doctor
  sf doctor --json

TAGS: diagnostics, troubleshooting, health
`.trim();
