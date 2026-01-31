#!/bin/bash
#
# sf.sh - Static Files CLI (curl-based)
# A shell wrapper for the Static Files API using only curl.
# Alternative to the Bun CLI for systems without Bun.
#
# Usage: sf.sh <command> [args]
#
# Environment:
#   SF_API_URL  API endpoint (required)
#   SF_API_KEY  API key (required)
#   SF_DOMAIN   Domain for URL display (optional, default: 498as.com)
#
set -e

# === Configuration ===
API_URL="${SF_API_URL:-}"
API_KEY="${SF_API_KEY:-}"
DOMAIN="${SF_DOMAIN:-498as.com}"

# === Output Helpers ===
err() { echo "Error: $1" >&2; exit 1; }
info() { echo "$1"; }

# === JSON Parsing (no jq) ===
# Extract a simple string field from JSON
# Usage: json_field '{"name":"foo"}' name -> foo
json_field() {
    echo "$1" | grep -oE "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed 's/.*:[ ]*"\([^"]*\)".*/\1/'
}

# Extract a simple number field from JSON
json_number() {
    echo "$1" | grep -oE "\"$2\"[[:space:]]*:[[:space:]]*[0-9]+" | head -1 | sed 's/.*:[ ]*//'
}

# Extract all values of a field from JSON array
# Usage: json_array_field '[{"name":"a"},{"name":"b"}]' name -> a\nb
json_array_field() {
    echo "$1" | grep -oE "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | sed 's/.*:[ ]*"\([^"]*\)".*/\1/'
}

# Check if response contains error
json_has_error() {
    echo "$1" | grep -q '"error"'
}

# Extract error message
json_error() {
    json_field "$1" "error"
}

# === URL Encoding ===
urlencode() {
    local string="$1"
    local encoded=""
    local i c

    for (( i=0; i<${#string}; i++ )); do
        c="${string:$i:1}"
        case "$c" in
            [a-zA-Z0-9.~_-/]) encoded+="$c" ;;
            ' ') encoded+="%20" ;;
            *) encoded+=$(printf '%%%02X' "'$c") ;;
        esac
    done
    echo "$encoded"
}

# === Validate Environment ===
check_env() {
    [ -z "$API_URL" ] && err "SF_API_URL environment variable is required"
    [ -z "$API_KEY" ] && err "SF_API_KEY environment variable is required"
}

# === API Requests ===
# GET request
api_get() {
    local path="$1"
    local response http_code

    response=$(curl -sS -w "\n%{http_code}" \
        -H "Authorization: Bearer $API_KEY" \
        "${API_URL}${path}" 2>&1) || err "Failed to connect to API"

    http_code=$(echo "$response" | tail -1)
    response=$(echo "$response" | sed '$d')

    if [ "$http_code" -ge 400 ]; then
        local error_msg
        error_msg=$(json_error "$response")
        [ -n "$error_msg" ] && err "$error_msg" || err "Request failed (HTTP $http_code)"
    fi

    echo "$response"
}

# POST with JSON body
api_post() {
    local path="$1"
    local data="$2"
    local response http_code

    response=$(curl -sS -w "\n%{http_code}" \
        -X POST \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d "$data" \
        "${API_URL}${path}" 2>&1) || err "Failed to connect to API"

    http_code=$(echo "$response" | tail -1)
    response=$(echo "$response" | sed '$d')

    if [ "$http_code" -ge 400 ]; then
        local error_msg
        error_msg=$(json_error "$response")
        [ -n "$error_msg" ] && err "$error_msg" || err "Request failed (HTTP $http_code)"
    fi

    echo "$response"
}

# DELETE request
api_delete() {
    local path="$1"
    local response http_code

    response=$(curl -sS -w "\n%{http_code}" \
        -X DELETE \
        -H "Authorization: Bearer $API_KEY" \
        "${API_URL}${path}" 2>&1) || err "Failed to connect to API"

    http_code=$(echo "$response" | tail -1)
    response=$(echo "$response" | sed '$d')

    if [ "$http_code" -ge 400 ]; then
        local error_msg
        error_msg=$(json_error "$response")
        [ -n "$error_msg" ] && err "$error_msg" || err "Request failed (HTTP $http_code)"
    fi

    echo "$response"
}

# PATCH with JSON body
api_patch() {
    local path="$1"
    local data="$2"
    local response http_code

    response=$(curl -sS -w "\n%{http_code}" \
        -X PATCH \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d "$data" \
        "${API_URL}${path}" 2>&1) || err "Failed to connect to API"

    http_code=$(echo "$response" | tail -1)
    response=$(echo "$response" | sed '$d')

    if [ "$http_code" -ge 400 ]; then
        local error_msg
        error_msg=$(json_error "$response")
        [ -n "$error_msg" ] && err "$error_msg" || err "Request failed (HTTP $http_code)"
    fi

    echo "$response"
}

# POST multipart file upload
api_upload() {
    local path="$1"
    local file="$2"
    local response http_code

    response=$(curl -sS -w "\n%{http_code}" \
        -X POST \
        -H "Authorization: Bearer $API_KEY" \
        -F "file=@$file" \
        "${API_URL}${path}" 2>&1) || err "Failed to connect to API"

    http_code=$(echo "$response" | tail -1)
    response=$(echo "$response" | sed '$d')

    if [ "$http_code" -ge 400 ]; then
        local error_msg
        error_msg=$(json_error "$response")
        [ -n "$error_msg" ] && err "$error_msg" || err "Upload failed (HTTP $http_code)"
    fi

    echo "$response"
}

# === Commands ===

# sf.sh sites list [--json]
cmd_sites_list() {
    local json_output=false
    [ "$1" = "--json" ] && json_output=true

    local response
    response=$(api_get "/sites")

    if $json_output; then
        echo "$response"
        return
    fi

    # Check if empty array
    if [ "$response" = "[]" ]; then
        info "No sites found. Create one with: sf.sh sites create <name>"
        return
    fi

    info "Sites:"
    echo ""

    # Parse each site - extract name and auth_user
    local names auth_users created_dates
    names=$(json_array_field "$response" "name")
    auth_users=$(json_array_field "$response" "auth_user")

    # Simple iteration - just show names with domain
    echo "$names" | while read -r name; do
        [ -z "$name" ] && continue
        echo "  ${name}.${DOMAIN}"
    done
}

# sf.sh sites create <name>
cmd_sites_create() {
    local name="$1"
    [ -z "$name" ] && err "Usage: sf.sh sites create <name>"

    local response
    response=$(api_post "/sites" "{\"name\":\"$name\"}")

    local site_name
    site_name=$(json_field "$response" "name")

    info "Created site: ${site_name}.${DOMAIN}"
    info ""
    info "Upload files with: sf.sh upload <file> ${site_name}"
}

# sf.sh sites delete <name>
cmd_sites_delete() {
    local name="$1"
    [ -z "$name" ] && err "Usage: sf.sh sites delete <name>"

    api_delete "/sites/$name" >/dev/null
    info "Deleted site: $name"
}

# sf.sh sites auth <name> <user:pass> | --remove
cmd_sites_auth() {
    local name="$1"
    local auth="$2"

    [ -z "$name" ] && err "Usage: sf.sh sites auth <name> <user:pass> | --remove"

    if [ "$auth" = "--remove" ]; then
        api_patch "/sites/$name" '{"auth":null}' >/dev/null
        info "Removed authentication from: ${name}.${DOMAIN}"
        return
    fi

    [ -z "$auth" ] && err "Usage: sf.sh sites auth <name> <user:pass>"

    # Split user:pass
    local user pass
    user="${auth%%:*}"
    pass="${auth#*:}"

    [ "$user" = "$auth" ] && err "Invalid format. Use: user:password"
    [ -z "$user" ] && err "Username cannot be empty"
    [ -z "$pass" ] && err "Password cannot be empty"

    # Escape quotes in password for JSON
    pass=$(echo "$pass" | sed 's/"/\\"/g')

    api_patch "/sites/$name" "{\"auth\":{\"user\":\"$user\",\"pass\":\"$pass\"}}" >/dev/null
    info "Set authentication on: ${name}.${DOMAIN} (user: $user)"
}

# sf.sh upload <path> <site> [subdir] [--overwrite]
cmd_upload() {
    local path=""
    local site=""
    local subdir=""
    local overwrite=""

    # Parse arguments
    for arg in "$@"; do
        case "$arg" in
            --overwrite) overwrite="true" ;;
            --json) ;; # Ignore --json for upload
            *)
                if [ -z "$path" ]; then
                    path="$arg"
                elif [ -z "$site" ]; then
                    site="$arg"
                elif [ -z "$subdir" ]; then
                    subdir="$arg"
                fi
                ;;
        esac
    done

    [ -z "$path" ] || [ -z "$site" ] && err "Usage: sf.sh upload <path> <site> [subdir] [--overwrite]"
    [ ! -e "$path" ] && err "Path not found: $path"

    if [ -f "$path" ]; then
        upload_single_file "$path" "$site" "$subdir" "$overwrite"
    else
        upload_directory "$path" "$site" "$subdir" "$overwrite"
    fi
}

# Upload a single file
upload_single_file() {
    local file="$1"
    local site="$2"
    local subdir="$3"
    local overwrite="$4"

    local url="/sites/${site}/files"
    local query=""

    if [ -n "$subdir" ]; then
        local encoded_path
        encoded_path=$(urlencode "$subdir")
        query="?path=${encoded_path}"
    fi

    if [ -n "$overwrite" ]; then
        if [ -n "$query" ]; then
            query="${query}&overwrite=true"
        else
            query="?overwrite=true"
        fi
    fi

    local response
    response=$(api_upload "${url}${query}" "$file")

    local result_url
    result_url=$(json_field "$response" "url")

    info "Uploaded: $result_url"
}

# Upload a directory recursively
upload_directory() {
    local base_path="$1"
    local site="$2"
    local target_prefix="$3"
    local overwrite="$4"

    # Remove trailing slash from base_path
    base_path="${base_path%/}"

    local count=0
    local failed=0

    # Use a temp file to track counts (subshell issues)
    local tmpfile
    tmpfile=$(mktemp)
    echo "0 0" > "$tmpfile"

    # Find all files and upload
    find "$base_path" -type f | while IFS= read -r file; do
        # Calculate relative path
        local rel_path="${file#$base_path/}"

        # Calculate target directory
        local target_dir=""
        local file_dir
        file_dir=$(dirname "$rel_path")

        if [ "$file_dir" != "." ]; then
            if [ -n "$target_prefix" ]; then
                target_dir="${target_prefix}/${file_dir}"
            else
                target_dir="$file_dir"
            fi
        else
            target_dir="$target_prefix"
        fi

        # Build URL
        local url="/sites/${site}/files"
        local query=""

        if [ -n "$target_dir" ]; then
            local encoded_path
            encoded_path=$(urlencode "$target_dir")
            query="?path=${encoded_path}"
        fi

        if [ -n "$overwrite" ]; then
            if [ -n "$query" ]; then
                query="${query}&overwrite=true"
            else
                query="?overwrite=true"
            fi
        fi

        # Upload
        local response
        if response=$(api_upload "${url}${query}" "$file" 2>&1); then
            local result_url
            result_url=$(json_field "$response" "url")
            info "Uploaded: $rel_path -> $result_url"

            # Increment success count
            read -r c f < "$tmpfile"
            echo "$((c + 1)) $f" > "$tmpfile"
        else
            echo "Failed: $rel_path ($response)" >&2

            # Increment failed count
            read -r c f < "$tmpfile"
            echo "$c $((f + 1))" > "$tmpfile"
        fi
    done

    # Read final counts
    read -r count failed < "$tmpfile"
    rm -f "$tmpfile"

    info ""
    if [ "$failed" -gt 0 ]; then
        info "Upload complete: $count succeeded, $failed failed"
    else
        info "Upload complete: $count files"
    fi
}

# sf.sh files <site> [delete <path>]
cmd_files() {
    local site="$1"
    local action="$2"
    local path="$3"
    local json_output=false

    # Check for --json in any position
    for arg in "$@"; do
        [ "$arg" = "--json" ] && json_output=true
    done

    [ -z "$site" ] && err "Usage: sf.sh files <site> [delete <path>]"

    if [ "$action" = "delete" ]; then
        [ -z "$path" ] && err "Usage: sf.sh files <site> delete <path>"

        local encoded_path
        encoded_path=$(urlencode "$path")

        api_delete "/sites/$site/files/$encoded_path" >/dev/null
        info "Deleted: $path"
        return
    fi

    # List files
    local response
    response=$(api_get "/sites/$site/files")

    if $json_output; then
        echo "$response"
        return
    fi

    # Check if empty
    if [ "$response" = "[]" ]; then
        info "No files in $site. Upload with: sf.sh upload <file> $site"
        return
    fi

    info "Files in ${site}.${DOMAIN}:"
    info ""

    # Parse paths and sizes
    local paths sizes
    paths=$(json_array_field "$response" "path")

    # Format output
    echo "$paths" | while read -r p; do
        [ -z "$p" ] && continue
        echo "  $p"
    done

    # Count files
    local file_count
    file_count=$(echo "$paths" | grep -c . || echo 0)
    info ""
    info "Total: $file_count files"
}

# sf.sh stats [site]
cmd_stats() {
    local site="$1"
    local json_output=false

    # Check for --json
    for arg in "$@"; do
        [ "$arg" = "--json" ] && json_output=true
    done

    if [ -n "$site" ] && [ "$site" != "--json" ]; then
        # Site-specific stats
        local response
        response=$(api_get "/stats/$site")

        if $json_output; then
            echo "$response"
            return
        fi

        local files size requests
        files=$(json_number "$response" "files")
        size=$(json_number "$response" "size")
        requests=$(json_number "$response" "requests")

        # Format size
        local size_fmt
        if [ "$size" -ge 1073741824 ]; then
            size_fmt="$(echo "scale=1; $size / 1073741824" | bc)GB"
        elif [ "$size" -ge 1048576 ]; then
            size_fmt="$(echo "scale=1; $size / 1048576" | bc)MB"
        elif [ "$size" -ge 1024 ]; then
            size_fmt="$(echo "scale=1; $size / 1024" | bc)KB"
        else
            size_fmt="${size}B"
        fi

        info "Stats for ${site}.${DOMAIN}:"
        info ""
        info "  Files:    $files"
        info "  Size:     $size_fmt"
        info "  Requests: $requests"
    else
        # Global stats
        local response
        response=$(api_get "/stats")

        if $json_output; then
            echo "$response"
            return
        fi

        local total_sites total_files total_size total_requests
        total_sites=$(json_number "$response" "total_sites")
        total_files=$(json_number "$response" "total_files")
        total_size=$(json_number "$response" "total_size")
        total_requests=$(json_number "$response" "total_requests")

        # Format size
        local size_fmt
        if [ "${total_size:-0}" -ge 1073741824 ]; then
            size_fmt="$(echo "scale=1; $total_size / 1073741824" | bc)GB"
        elif [ "${total_size:-0}" -ge 1048576 ]; then
            size_fmt="$(echo "scale=1; $total_size / 1048576" | bc)MB"
        elif [ "${total_size:-0}" -ge 1024 ]; then
            size_fmt="$(echo "scale=1; $total_size / 1024" | bc)KB"
        else
            size_fmt="${total_size:-0}B"
        fi

        info "Global Stats:"
        info ""
        info "  Sites:    ${total_sites:-0}"
        info "  Files:    ${total_files:-0}"
        info "  Size:     $size_fmt"
        info "  Requests: ${total_requests:-0}"
    fi
}

# sf.sh help
cmd_help() {
    cat << 'EOF'
sf.sh - Static Files CLI (curl-based)

Commands:
  sites list [--json]              List all sites
  sites create <name>              Create a new site
  sites delete <name>              Delete a site and all files
  sites auth <name> <user:pass>    Set basic auth
  sites auth <name> --remove       Remove basic auth

  upload <path> <site> [subdir] [--overwrite]
                                   Upload file or directory
  files <site> [--json]            List files in site
  files <site> delete <path>       Delete a file

  stats [--json]                   Global stats
  stats <site> [--json]            Site stats

  help                             Show this help

Environment:
  SF_API_URL    API endpoint (required)
  SF_API_KEY    API key (required)
  SF_DOMAIN     Domain for URLs (default: 498as.com)

Examples:
  # Create and deploy a site
  sf.sh sites create mysite
  sf.sh upload ./dist mysite
  # Result: https://mysite.498as.com

  # Protected site
  sf.sh sites create private
  sf.sh sites auth private admin:secret123
  sf.sh upload ./files private

  # Clean deploy
  sf.sh sites delete mysite
  sf.sh sites create mysite
  sf.sh upload ./new-build mysite

  # Upload to subdirectory
  sf.sh upload ./images mysite assets/img

  # Overwrite existing files
  sf.sh upload ./dist mysite --overwrite
EOF
}

# === Main ===
main() {
    local cmd="${1:-help}"
    shift 2>/dev/null || true

    # Help doesn't need env check
    if [ "$cmd" = "help" ] || [ "$cmd" = "--help" ] || [ "$cmd" = "-h" ]; then
        cmd_help
        exit 0
    fi

    check_env

    case "$cmd" in
        sites)
            local subcmd="${1:-list}"
            shift 2>/dev/null || true
            case "$subcmd" in
                list)   cmd_sites_list "$@" ;;
                create) cmd_sites_create "$@" ;;
                delete) cmd_sites_delete "$@" ;;
                auth)   cmd_sites_auth "$@" ;;
                *)      err "Unknown sites command: $subcmd. Use 'sf.sh help' for usage." ;;
            esac
            ;;
        upload)
            cmd_upload "$@"
            ;;
        files)
            cmd_files "$@"
            ;;
        stats)
            cmd_stats "$@"
            ;;
        *)
            err "Unknown command: $cmd. Use 'sf.sh help' for usage."
            ;;
    esac
}

main "$@"
