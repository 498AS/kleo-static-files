# Plan 002: Bugfixes and Improvements

**Date:** 2026-01-31  
**Author:** Kleo  
**Status:** Draft

## Overview

During the installation on dantse.cc, several bugs and improvement opportunities were identified. This plan documents all issues and proposes fixes.

---

## 🐛 Bugs

### Bug 1: CLI Upload "Invalid path" Error (FIXED ✅)

**Severity:** High  
**Component:** `cli/commands.ts`, `cli/client.ts`

**Problem:**  
When using `sf upload /path/to/file site`, the CLI throws "Invalid path" error even though the file exists and is readable.

**Reproduction:**
```bash
export SF_API_URL=http://localhost:3000 SF_API_KEY=sk_xxx
echo "test" > /tmp/test.html
sf upload /tmp/test.html mysite  # Error: Invalid path
```

**Workaround:**  
Using curl directly works:
```bash
curl -X POST -H "Authorization: Bearer $SF_API_KEY" -F "file=@/tmp/test.html" "$SF_API_URL/sites/mysite/files"
```

**Root Cause Analysis:**  
The error comes from the server's `safePath()` function, not the CLI path parsing. Need to investigate:
1. How `Bun.file()` handles paths
2. What filename is being sent in the FormData
3. If there's an encoding issue with the path

**Proposed Fix:**
1. Add debug logging to trace the actual path being sent
2. Check if `Bun.file(absolutePath)` preserves the filename correctly
3. Potentially use `basename()` explicitly when creating the File object

**Files to modify:**
- `cli/commands.ts` - `uploadSingleFile()` function
- `cli/client.ts` - `uploadFile()` function

---

### Bug 2: Installer Adds Duplicate Caddy Imports (FIXED ✅)

**Severity:** Medium  
**Component:** `install.sh`

**Problem:**  
The installer adds `import /etc/caddy/sites.d/*.caddy` to Caddyfile without properly checking if it already exists, causing multiple duplicate lines.

**Current code (line ~258):**
```bash
if ! grep -q "import $CADDY_SITES_DIR" /etc/caddy/Caddyfile 2>/dev/null; then
  # ... adds import
fi
```

**Issue:**  
The grep pattern doesn't match correctly, or runs multiple times during install/upgrade cycles.

**Proposed Fix:**
```bash
# Remove any existing imports first, then add one at the end
sed -i '\|^import /etc/caddy/sites.d/|d' /etc/caddy/Caddyfile
echo "import $CADDY_SITES_DIR/*.caddy" >> /etc/caddy/Caddyfile
```

**Files to modify:**
- `install.sh`

---

### Bug 3: SF_BIND_IPS Not Quoted (FIXED ✅)

**Severity:** High  
**Component:** `install.sh`

**Problem:**  
When the server has both IPv4 and IPv6, the .env file had:
```
SF_BIND_IPS=46.224.196.72 2a01:4f8:1c1f:ab28::1
```
This caused shell errors when sourcing the file.

**Fix Applied:**  
Changed to `SF_BIND_IPS="$BIND_IPS"` (commit 55adef2)

---

### Bug 4: Database Permissions (FIXED ✅)

**Severity:** Medium  
**Component:** `install.sh`, `scripts/create-key.ts`

**Problem:**  
After installation, the SQLite database is owned by root with restrictive permissions. The `create-key.ts` script fails with "attempt to write a readonly database".

**Proposed Fix:**
1. Create a dedicated system user for the service
2. Set proper ownership on data directories during install
3. Run the service as that user

**Files to modify:**
- `install.sh`

---

## 🔧 Improvements

### Improvement 1: Run Service as Dedicated User

**Priority:** High  
**Component:** `install.sh`, systemd service

**Current state:**  
Service runs as root.

**Proposed change:**
```bash
# In install.sh
useradd -r -s /bin/false kleo-sf

# Ownership
chown -R kleo-sf:kleo-sf $DATA_DIR
chown -R kleo-sf:kleo-sf $INSTALL_DIR

# In systemd service
[Service]
User=kleo-sf
Group=kleo-sf
```

---

### Improvement 2: Update ClawdHub Skill Package

**Priority:** Medium  
**Component:** `static-files/SKILL.md`

**Problem:**  
The skill package published to ClawdHub has hardcoded 498as.com references in examples.

**Proposed change:**  
Update `static-files/SKILL.md` to use generic placeholders like `yourdomain.com` or note that the domain is configurable via `SF_DOMAIN`.

---

### Improvement 3: Include Shell Wrapper in Repo

**Priority:** Medium  
**Component:** `cli/sf.sh` (new file)

**Problem:**  
The bun CLI has bugs. A shell wrapper using curl works reliably but isn't in the repo.

**Proposed change:**  
1. Add `cli/sf.sh` as alternative CLI
2. Installer creates symlink to sf.sh instead of bun CLI
3. Or fix the bun CLI properly (preferred)

---

### Improvement 4: Better Error Messages

**Priority:** Low  
**Component:** `cli/client.ts`

**Proposed changes:**
1. Show which file failed when uploading directories
2. Include the actual path in "Invalid path" errors
3. Add `--verbose` flag for debugging

---

## 📋 Implementation Order

### Phase 1: Critical Fixes
1. [x] Fix CLI upload bug (Bug 1) — commit 35abf58
2. [x] Fix duplicate Caddy imports (Bug 2) — commit bd3562f
3. [x] Fix database permissions (Bug 4) — commit 88d0160

### Phase 2: Security
4. [ ] Run service as dedicated user (Improvement 1)

### Phase 3: Polish
5. [ ] Update ClawdHub skill (Improvement 2)
6. [ ] Better error messages (Improvement 4)
7. [ ] Add shell wrapper as fallback (Improvement 3)

---

## 🧪 Testing Checklist

After implementing fixes:

- [ ] Fresh install on clean Ubuntu 24.04
- [ ] Install with `--domain custom.com`
- [ ] Upgrade existing installation
- [ ] Create site via CLI
- [ ] Upload single file via CLI
- [ ] Upload directory via CLI
- [ ] Set/remove auth
- [ ] Delete site
- [ ] Service restart survives reboot
- [ ] Caddy serves HTTPS correctly
- [ ] Rate limiting works
- [ ] Quota enforcement works

---

## 📝 Notes

### Workaround for CLI Bug

Until Bug 1 is fixed, use the curl-based wrapper:

```bash
# Create sf.sh wrapper
cat > /usr/local/bin/sf << 'EOF'
#!/bin/bash
# Wrapper that uses curl instead of buggy bun CLI
# ... (full implementation in skills/static-files/scripts/sf.sh)
EOF
chmod +x /usr/local/bin/sf
```

### Environment Setup

Required environment variables:
```bash
export SF_API_URL=http://localhost:3000
export SF_API_KEY=sk_xxxxx
export SF_DOMAIN=yourdomain.com  # optional, defaults to 498as.com
```
