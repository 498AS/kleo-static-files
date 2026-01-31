#!/bin/bash
#
# sf.sh - Static Files CLI (curl-based fallback)
#
# A shell wrapper for the Static Files API that uses curl.
# Use this as an alternative to the Bun CLI if needed.
#
# Usage: sf.sh <command> [args]
#
# Environment:
#   SF_API_URL   API endpoint (required)
#   SF_API_KEY   API key (required)
#   SF_DOMAIN    Domain for URL display (optional)
#

set -e

# === Configuration ===
API_URL="${SF_API_URL:-}"
API_KEY="${SF_API_KEY:-}"
DOMAIN="${SF_DOMAIN:-yourdomain.com}"

# === Output Helpers ===
err() { echo "Error: $1" >&2; exit 1; }
info() { echo "$1"; }
json_value() { echo "$1" | grep -o "\"$2\":[^,}]*" | head -1 | sed 's/.*:\s*"\?\([^",}]*\)"\?.*/\1/'; }

# === Validate Environment ===
check_env() {
  [ -z "$API_URL" ] && err "SF_API_URL environment variable is required"
  [ -z "$API_KEY" ] && err "SF_API_KEY environment variable is required"
}

# === API Request ===
api() {
  local method="$1"
  local path="$2"
  shift 2
  
  curl -sf -X "$method" \
    -H "Authorization: Bearer $API_KEY" \
    "$@" \
    "${API_URL}${path}"
}

api_json() {
  local method="$1"
  local path="$2"
  local data="$3"
  
  curl -sf -X "$method" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$data" \
    "${API_URL}${path}"
}

# === Commands ===

# sf.sh sites list
cmd_sites_list() {
  local json_output=false
  [ "$1" = "--json" ] && json_output=true
  
  local response
  response=$(api GET "/sites") || err "Failed to list sites"
  
  if $json_output; then
    echo "$response"
  else
    echo "Sites:"
    echo "$response" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | while read -r site; do
      echo "  - $site (https://$site.$DOMAIN)"
    done
  fi
}

# sf.sh sites create <name>
cmd_sites_create() {
  local name="$1"
  [ -z "$name" ] && err "Usage: sf.sh sites create <name>"
  
  local response
  response=$(api_json POST "/sites" "{\"name\":\"$name\"}") || err "Failed to create site"
  
  info "Created site: $name"
  info "URL: https://$name.$DOMAIN"
}

# sf.sh sites delete <name>
cmd_sites_delete() {
  local name="$1"
  [ -z "$name" ] && err "Usage: sf.sh sites delete <name>"
  
  api DELETE "/sites/$name" >/dev/null || err "Failed to delete site"
  info "Deleted site: $name"
}

# sf.sh sites auth <name> <user:pass|--remove>
cmd_sites_auth() {
  local name="$1"
  local auth="$2"
  
  [ -z "$name" ] && err "Usage: sf.sh sites auth <name> <user:pass|--remove>"
  
  if [ "$auth" = "--remove" ]; then
    api_json PATCH "/sites/$name" '{"auth":null}' >/dev/null || err "Failed to remove auth"
    info "Removed authentication from: $name"
  else
    [ -z "$auth" ] && err "Usage: sf.sh sites auth <name> <user:pass>"
    local user="${auth%%:*}"
    local pass="${auth#*:}"
    api_json PATCH "/sites/$name" "{\"auth\":{\"user\":\"$user\",\"pass\":\"$pass\"}}" >/dev/null || err "Failed to set auth"
    info "Set authentication on: $name"
  fi
}

# sf.sh upload <path> <site> [subdir] [--overwrite]
cmd_upload() {
  local path=""
  local site=""
  local subdir=""
  local overwrite=""
  
  while [ $# -gt 0 ]; do
    case "$1" in
      --overwrite) overwrite="true"; shift ;;
      *)
        if [ -z "$path" ]; then path="$1"
        elif [ -z "$site" ]; then site="$1"
        else subdir="$1"
        fi
        shift ;;
    esac
  done
  
  [ -z "$path" ] || [ -z "$site" ] && err "Usage: sf.sh upload <path> <site> [subdir] [--overwrite]"
  [ ! -e "$path" ] && err "Path not found: $path"
  
  local query=""
  [ -n "$subdir" ] && query="?path=$subdir"
  [ -n "$overwrite" ] && query="${query:+$query&}${query:-?}overwrite=true"
  
  if [ -f "$path" ]; then
    # Single file upload
    local response
    response=$(curl -sf -X POST \
      -H "Authorization: Bearer $API_KEY" \
      -F "file=@$path" \
      "${API_URL}/sites/${site}/files${query}") || err "Failed to upload file"
    
    local filename
    filename=$(basename "$path")
    info "Uploaded: $filename → https://$site.$DOMAIN/${subdir:+$subdir/}$filename"
  else
    # Directory upload
    local count=0
    find "$path" -type f | while read -r file; do
      local relpath="${file#$path/}"
      local target_path="${subdir:+$subdir/}$relpath"
      local dir_part
      dir_part=$(dirname "$target_path")
      
      local file_query="?path=$dir_part"
      [ -n "$overwrite" ] && file_query="$file_query&overwrite=true"
      
      curl -sf -X POST \
        -H "Authorization: Bearer $API_KEY" \
        -F "file=@$file" \
        "${API_URL}/sites/${site}/files${file_query}" >/dev/null || echo "Failed: $relpath" >&2
      
      echo "Uploaded: $relpath"
      count=$((count + 1))
    done
    info "Upload complete"
  fi
}

# sf.sh files <site> [delete <path>]
cmd_files() {
  local site="$1"
  local action="$2"
  local path="$3"
  
  [ -z "$site" ] && err "Usage: sf.sh files <site> [delete <path>]"
  
  if [ "$action" = "delete" ]; then
    [ -z "$path" ] && err "Usage: sf.sh files <site> delete <path>"
    api DELETE "/sites/$site/files/$path" >/dev/null || err "Failed to delete file"
    info "Deleted: $path"
  else
    local response
    response=$(api GET "/sites/$site/files") || err "Failed to list files"
    
    echo "Files in $site:"
    echo "$response" | grep -o '"path":"[^"]*"' | cut -d'"' -f4 | while read -r f; do
      echo "  $f"
    done
  fi
}

# sf.sh stats [site]
cmd_stats() {
  local site="$1"
  local response
  
  if [ -n "$site" ]; then
    response=$(api GET "/stats/$site") || err "Failed to get stats"
  else
    response=$(api GET "/stats") || err "Failed to get stats"
  fi
  
  echo "$response"
}

# sf.sh help
cmd_help() {
  cat << 'EOF'
sf.sh - Static Files CLI (curl-based)

Commands:
  sites list [--json]              List all sites
  sites create <name>              Create a new site
  sites delete <name>              Delete a site
  sites auth <name> <user:pass>    Set basic auth
  sites auth <name> --remove       Remove basic auth

  upload <path> <site> [subdir] [--overwrite]
                                   Upload file or directory
  files <site>                     List files in site
  files <site> delete <path>       Delete a file

  stats                            Global stats
  stats <site>                     Site stats

  help                             Show this help

Environment:
  SF_API_URL   API endpoint (required)
  SF_API_KEY   API key (required)
  SF_DOMAIN    Domain for URLs (optional)

Examples:
  sf.sh sites create mysite
  sf.sh upload ./index.html mysite
  sf.sh upload ./dist mysite --overwrite
  sf.sh sites auth mysite admin:secret123
  sf.sh files mysite
EOF
}

# === Main ===
check_env

case "${1:-help}" in
  sites)
    shift
    case "${1:-list}" in
      list) shift; cmd_sites_list "$@" ;;
      create) shift; cmd_sites_create "$@" ;;
      delete) shift; cmd_sites_delete "$@" ;;
      auth) shift; cmd_sites_auth "$@" ;;
      *) err "Unknown sites command: $1" ;;
    esac
    ;;
  upload) shift; cmd_upload "$@" ;;
  files) shift; cmd_files "$@" ;;
  stats) shift; cmd_stats "$@" ;;
  help|--help|-h) cmd_help ;;
  *) err "Unknown command: $1. Use 'sf.sh help' for usage." ;;
esac
