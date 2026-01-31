# Plan 001: Production Ready

**Objetivo:** Llevar kleo-static-files a producción con seguridad, estabilidad y observabilidad.

**Estimación:** 4-6 horas de trabajo

---

## Fase 1: Seguridad (Crítico)

### 1.1 Path Traversal Protection
**Archivo:** `server/index.ts`

**Problema:** Los endpoints de upload y delete no validan que el path esté dentro del directorio del site.

**Solución:**
```typescript
function safePath(base: string, userPath: string): string | null {
  const resolved = path.resolve(base, userPath);
  if (!resolved.startsWith(path.resolve(base) + path.sep)) {
    return null; // Path traversal attempt
  }
  return resolved;
}
```

**Aplicar en:**
- `POST /sites/:name/files` — validar `subPath`
- `DELETE /sites/:name/files/:path` — validar `filePath`

**Tests:**
- [ ] `../etc/passwd` → 400 Bad Request
- [ ] `foo/../../../etc/passwd` → 400 Bad Request
- [ ] `subdir/file.txt` → 201 OK

---

### 1.2 API Key Management
**Archivos nuevos:** `server/keys.ts`, `cli/commands.ts`

**Problema:** No hay forma de crear/listar/revocar API keys.

**Solución:**

**Nuevo endpoint (admin):**
```
POST /keys          — Crear key (requiere master key)
GET /keys           — Listar keys (sin mostrar hash)
DELETE /keys/:id    — Revocar key
```

**Nuevo comando CLI:**
```bash
sf keys create "mi-app"     # Genera sk_xxxx, muestra UNA vez
sf keys list                # Lista keys (id, name, created_at)
sf keys revoke <id>         # Revoca key
```

**Env var nueva:**
```bash
SF_MASTER_KEY=mk_xxxxx      # Para crear otras keys
```

**Alternativa simple (v1):**
Script standalone para generar keys:
```bash
bun run scripts/create-key.ts "nombre-key"
# Output: sk_xxxxxxx (guardar, no se puede recuperar)
```

---

### 1.3 Request Size Limit
**Archivo:** `server/index.ts`

**Problema:** Sin límite de tamaño, se puede subir archivos enormes.

**Solución:**
```typescript
const MAX_FILE_SIZE = parseInt(process.env.SF_MAX_FILE_MB || "50") * 1024 * 1024;

// En el handler de upload:
if (file.size > MAX_FILE_SIZE) {
  return c.json({ error: `File too large. Max: ${MAX_FILE_SIZE / 1024 / 1024}MB` }, 413);
}
```

---

## Fase 2: Caddy Integration (Crítico)

### 2.1 Estrategia de Persistencia

**Problema:** Las rutas creadas via Admin API se pierden si Caddy reinicia.

**Opciones:**

| Opción | Pros | Contras |
|--------|------|---------|
| A) Wildcard estático | Simple, persistente | Menos control por site |
| B) Regenerar al iniciar | Control total | Complejidad, race conditions |
| C) Caddy config file | Persistente, control | Hay que escribir/recargar |

**Recomendación:** Opción A (Wildcard) + Basic Auth via middleware propio

**Caddyfile:**
```caddy
*.498as.com {
    bind 116.203.74.64 2a01:4f8:1c1b:8985::1
    
    # Auth y file serving manejado por nuestra app
    reverse_proxy localhost:3001
    
    log {
        output file /var/log/caddy/sites.log
    }
}
```

**Nuevo server (port 3001):** File server con auth check contra SQLite.

**O más simple:** Usar `file_server` de Caddy con un script que regenera el Caddyfile.

### 2.2 Decisión Arquitectónica Necesaria

**Pregunta clave:** ¿Quién sirve los archivos estáticos?

| Opción | Descripción |
|--------|-------------|
| **A) Caddy directo** | Caddy sirve files, app solo gestiona metadata |
| **B) App sirve todo** | App sirve files + gestiona (más control, más carga) |

**Recomendación:** Opción A — Caddy es mejor sirviendo estáticos.

**Implementación:**
1. Caddyfile con wildcard + `file_server`
2. Script `scripts/sync-caddy.ts` que:
   - Lee sites de SQLite
   - Genera Caddyfile dinámico
   - Ejecuta `caddy reload`
3. Llamar al script después de create/delete site

---

## Fase 3: Observabilidad

### 3.1 Health Check
**Archivo:** `server/index.ts`

```typescript
app.get("/health", (c) => {
  // Check DB connection
  try {
    db.getSites.all();
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (e) {
    return c.json({ status: "error", error: e.message }, 500);
  }
});
```

### 3.2 Access Logging
**Archivo:** `server/index.ts`

**Problema:** Tabla `access_log` existe pero no se usa.

**Solución:** Middleware para loggear requests:
```typescript
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  
  // Log to stdout (para journald)
  console.log(JSON.stringify({
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration,
    timestamp: new Date().toISOString(),
  }));
});
```

### 3.3 Structured Logging
**Dependencia nueva:** Ninguna (JSON a stdout, journald lo captura)

**Format:**
```json
{"level":"info","method":"POST","path":"/sites","status":201,"duration":45,"timestamp":"..."}
```

---

## Fase 4: Rate Limiting & Quotas

### 4.1 Rate Limiting
**Archivo nuevo:** `server/middleware/rate-limit.ts`

**Implementación simple (in-memory):**
```typescript
const requests = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

export function rateLimit() {
  return async (c: Context, next: Next) => {
    const key = c.req.header("Authorization") || c.req.header("x-forwarded-for");
    const now = Date.now();
    const timestamps = requests.get(key) || [];
    const recent = timestamps.filter(t => now - t < WINDOW_MS);
    
    if (recent.length >= MAX_REQUESTS) {
      return c.json({ error: "Rate limit exceeded" }, 429);
    }
    
    recent.push(now);
    requests.set(key, recent);
    await next();
  };
}
```

**Env vars:**
```bash
SF_RATE_LIMIT_WINDOW=60000   # 1 minuto
SF_RATE_LIMIT_MAX=100        # 100 requests/minuto
```

### 4.2 Storage Quotas
**Schema update:** `server/db.ts`

```sql
ALTER TABLE sites ADD COLUMN quota_bytes INTEGER DEFAULT 104857600; -- 100MB default
ALTER TABLE sites ADD COLUMN used_bytes INTEGER DEFAULT 0;
```

**Check en upload:**
```typescript
const site = db.getSite.get(name);
const newSize = site.used_bytes + file.size;
if (newSize > site.quota_bytes) {
  return c.json({ error: `Quota exceeded. Used: ${site.used_bytes}, Quota: ${site.quota_bytes}` }, 413);
}
```

---

## Fase 5: CLI Improvements

### 5.1 Config Validation
**Archivo:** `cli/index.ts`

```typescript
if (!process.env.SF_API_KEY) {
  console.error("Error: SF_API_KEY environment variable is required");
  console.error("Set it with: export SF_API_KEY=sk_xxxxx");
  process.exit(1);
}

if (!process.env.SF_API_URL) {
  console.error("Warning: SF_API_URL not set, using default: http://localhost:3000");
}
```

### 5.2 Better Error Messages
**Archivo:** `cli/client.ts`

```typescript
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    const res = await fetch(`${API_URL}${path}`, { ... });
    // ...
  } catch (e: any) {
    if (e.code === "ECONNREFUSED") {
      throw new Error(`Cannot connect to ${API_URL}. Is the server running?`);
    }
    throw e;
  }
}
```

### 5.3 Config File Support
**Archivo nuevo:** `cli/config.ts`

Buscar config en:
1. `$SF_API_KEY` / `$SF_API_URL` (env vars)
2. `~/.config/sf/config.json`
3. `./.sfrc`

```json
{
  "apiUrl": "https://kleo.498as.com/sf",
  "apiKey": "sk_xxxxx"
}
```

---

## Fase 6: SKILL.md Update

### 6.1 Actualizar documentación
- Añadir sección de configuración inicial
- Documentar nuevos comandos (`sf keys`)
- Añadir ejemplos de error handling
- Documentar env vars

### 6.2 Añadir troubleshooting
```markdown
## Troubleshooting

### "Cannot connect to API"
- Verificar que el server está corriendo: `systemctl status kleo-static-files`
- Verificar SF_API_URL apunta al endpoint correcto

### "Invalid API key"
- Verificar SF_API_KEY está configurado
- Verificar que la key no ha sido revocada
```

---

## Checklist de Implementación

### Fase 1: Seguridad
- [x] Implementar `safePath()` helper
- [x] Aplicar validación en upload endpoint
- [x] Aplicar validación en delete endpoint
- [x] Crear `scripts/create-key.ts`
- [x] Añadir límite de tamaño de archivo
- [x] Tests de path traversal

### Fase 2: Caddy
- [x] Decidir arquitectura (wildcard vs dinámico) → sync-caddy.ts genera Caddyfile
- [x] Implementar script de sync o file server → scripts/sync-caddy.ts
- [x] Actualizar server para llamar sync después de cambios
- [ ] Test de persistencia tras reinicio

### Fase 3: Observabilidad
- [x] Añadir `/health` endpoint
- [x] Implementar logging middleware
- [x] Documentar formato de logs

### Fase 4: Rate Limiting
- [x] Implementar rate limit middleware
- [x] Añadir quotas a schema
- [x] Implementar check de quota en upload

### Fase 5: CLI
- [x] Validar env vars al inicio
- [x] Mejorar mensajes de error
- [ ] (Opcional) Config file support

### Fase 6: Docs
- [x] Actualizar SKILL.md → movido a static-files/SKILL.md
- [x] Añadir troubleshooting
- [x] Documentar env vars completas
- [x] Crear install.sh automatizado
- [x] Crear AI agent skill con referencias y scripts

---

## Env Vars Finales

```bash
# Server
SF_PORT=3000
SF_SITES_ROOT=/var/lib/kleo-static-files/sites
SF_DB_PATH=/var/lib/kleo-static-files/data/static-files.db
SF_DOMAIN=498as.com
SF_MAX_FILE_MB=50
SF_RATE_LIMIT_WINDOW=60000
SF_RATE_LIMIT_MAX=100

# Caddy
CADDY_ADMIN_URL=http://localhost:2019

# CLI
SF_API_URL=https://kleo.498as.com/sf
SF_API_KEY=sk_xxxxx
```

---

## Estructura Final

```
kleo-static-files/
├── cli/
│   ├── client.ts
│   ├── commands.ts
│   ├── config.ts        # NEW
│   ├── help.ts
│   └── index.ts
├── server/
│   ├── caddy.ts
│   ├── db.ts
│   ├── index.ts
│   ├── keys.ts          # NEW
│   ├── middleware/      # NEW
│   │   └── rate-limit.ts
│   └── schema.ts
├── scripts/
│   ├── create-key.ts    # NEW
│   ├── gen-types.ts
│   └── sync-caddy.ts    # NEW (si opción A)
├── docs/
│   └── plans/
│       └── 001-production-ready.md
├── SKILL.md
├── package.json
└── README.md            # NEW - setup instructions
```

---

## Orden de Ejecución Recomendado

1. **Seguridad primero** — Path traversal y API keys
2. **Caddy** — Definir e implementar estrategia
3. **Observabilidad** — Health check y logging
4. **Rate limiting** — Protección contra abuso
5. **CLI** — Mejoras de UX
6. **Docs** — Actualizar todo

---

*Plan creado: 2026-01-31*
*Autor: Ops*
