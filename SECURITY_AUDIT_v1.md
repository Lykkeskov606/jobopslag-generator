# Security Audit v1 — jobopslag-generator

**Dato:** 7. juni 2026
**Scope:** Backend (Node.js/Express), Frontend (React), PostgreSQL, Auth, AI-integration
**Revisionsgrundlag:** Spec v1.5 Kapitel 7

---

## Samlet oversigt

| # | Kontrol | Status | Note |
|---|---------|--------|------|
| 1 | Bcrypt salt rounds ≥ 12 | ✅ | 12 rounds — `BCRYPT_ROUNDS = 12` |
| 2 | JWT access (15 min) + refresh (7 d) med rotation | ✅ | Separat secret, JTI-rotation |
| 3 | Logout invaliderer refresh token | ✅ | Redis `del refresh:${userId}:${jti}` |
| 4 | Password reset tokens SHA-256, single-use | ✅ | `used_at` markeret, udløb enforced |
| 5 | Admin-endpoints tjekker `role === 'superadmin'` server-side | ✅ | `requireAdmin` middleware på hele `/api/admin` |
| 6 | Rate limit password reset (5 req/15 min/IP) | ✅ | `resetLimiter` på begge reset-endpoints |
| 7 | Rate limit auth-endpoints (20 req/min/IP) | ✅ | `authLimiter` på register + login |
| 8 | Alle projekt-endpoints tjekker ownership/membership | ✅ | Se detaljer nedenfor |
| 9 | UUID-gætning forhindret | ✅ | Membership-krav + UUID v4 entropi |
| 10 | `isSuperAdmin` bypass smitter ikke af | ✅ | Boolean SQL-parameter — ikke klient-kontrollerbar |
| 11 | Zod-validation på alle user-input endpoints | ✅ | Alle endpoints med schema-validering |
| 12 | Alle SQL-queries er parameteriserede | ❌ | **KRITISK: SQL injection i admin.js** |
| 13 | Ingen `dangerouslySetInnerHTML` i React | ✅ | Ikke fundet |
| 14 | CORS: ingen wildcard `*` | ✅ | Whitelist via `FRONTEND_URL` |
| 15 | Helmet.js aktiv | ✅ | `app.use(helmet())` |
| 16 | Ingen secrets committed i git | ✅ | Kun placeholders i `.env.example` |
| 17 | `.env` i `.gitignore` | ✅ | Korrekt konfigureret |
| 18 | Frontend eksponerer ikke backend-secrets | ✅ | Ingen API-nøgler i `frontend/src` |
| 19 | Bruger data-eksport endpoint (GDPR art. 15) | ❌ | Ikke implementeret |
| 20 | Kontosletning sletter data (GDPR art. 17) | ❌ | Ikke implementeret |
| 21 | Audit trail: login, AI-kald, brugerændringer | ✅ | `events` + `ai_calls` + `bias_violations` tabeller |
| 22 | Audit logs indeholder ikke password-hashes | ✅ | Kun event_type og kontekst |
| 23 | Rate limit AI-kald (100/time/bruger) | ⚠️ | Limiter defineret men IKKE tilknyttet endpoints |
| 24 | Per-bruger budget cap (5 kr/dag) | ❌ | Ikke implementeret — TODO Fase 7 |
| 25 | API-nøgler kun server-side | ✅ | Ingen nøgler i frontend-kode |
| 26 | Fejl-responses lækker ikke stack traces | ✅ | 5xx → generisk besked, stack trace → Sentry |
| 27 | 401/403/404 afslører ikke ressource-eksistens | ✅ | Generiske beskeder, timing-safe login |

**Resultat: 19 ✅ · 2 ⚠️ · 6 ❌ (3 ikke implementeret, 1 kritisk sårbarhed)**

---

## A. Auth og authorization

### 1. Bcrypt salt rounds ✅

`backend/src/routes/auth.js:15`
```js
const BCRYPT_ROUNDS = 12;
const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
```
Brugt konsekvent ved register, login, password reset og password change.

---

### 2. JWT access + refresh med rotation ✅

`backend/src/routes/auth.js:16-25, 177-184`
```js
const ACCESS_TTL  = 15 * 60;           // 15 minutter
const REFRESH_TTL = 7 * 24 * 60 * 60; // 7 dage

function signAccess(payload)  { return jwt.sign(payload, process.env.JWT_ACCESS_SECRET,  { expiresIn: ACCESS_TTL  }); }
function signRefresh(payload) { return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL }); }

// /refresh endpoint:
await redis.del(`refresh:${userId}:${jti}`);         // invalidér gammelt token
const newJti = uuidv4();
await redis.set(`refresh:${payload.id}:${newJti}`, newRefreshToken, { EX: REFRESH_TTL });
```
Rotation: gammelt JTI slettes, nyt JTI udstedes ved hvert refresh.

---

### 3. Logout invaliderer refresh token ✅

`backend/src/routes/auth.js:195-210`
```js
router.post('/logout', async (req, res, next) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const [userId, jti] = refreshToken.split(':');
    if (userId && jti) {
      const redis = await getRedis();
      await redis.del(`refresh:${userId}:${jti}`);
    }
  }
  res.json({ ok: true });
});
```

---

### 4. Password reset tokens: SHA-256, single-use ✅

`backend/src/routes/auth.js:226-285`
```js
// forgot-password — gem kun hash:
const rawToken  = crypto.randomBytes(32).toString('hex');
const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
await db.query(
  `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
  [userId, tokenHash, expiresAt]
);

// reset-password — marker brugt:
if (record.used_at !== null) return res.status(400).json({ error: 'This reset link has already been used' });
await db.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [record.id]);
```

---

### 5. Admin-endpoints: server-side role-check ✅

`backend/src/middleware/requireAdmin.js:1-12`
```js
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
    next();
  });
}
```
`backend/src/routes/admin.js:7` — `router.use(requireAdmin)` — dækker alle `/api/admin/*` routes.

---

### 6. Rate limit password reset (5 req/15 min/IP) ✅

`backend/src/middleware/rateLimiter.js:20-27`
```js
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many password reset requests, please try again later' },
});
```
Tilknyttet `forgot-password` og `reset-password`.

---

### 7. Rate limit auth-endpoints (20 req/min/IP) ✅

`backend/src/middleware/rateLimiter.js:3-9`
```js
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, ... });
```
Tilknyttet `/register` og `/login`.

---

## B. Data-isolation

### 8. Alle projekt-endpoints tjekker authorization ✅

Endpoints gennemgået:

| Endpoint | Check |
|----------|-------|
| `GET /api/projects` | `JOIN project_members WHERE pm.user_id = $1` |
| `GET /api/projects/trash` | `WHERE p.owner_id = $1` |
| `POST /api/projects` | Auto-sæt `owner_id = req.user.id` |
| `GET /api/projects/:id` | `JOIN project_members WHERE pm.user_id = $2` |
| `PATCH /api/projects/:id` | `SELECT role FROM project_members WHERE user_id = $2` |
| `DELETE /api/projects/:id` | `WHERE ($2 OR owner_id = $3)` — `$2` = isSuperAdmin |
| `PATCH /api/projects/:id/restore` | Samme mønster |
| `GET /api/generate/tier1/:projectId` | `SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2` |
| `POST /api/generate/tier1` | `JOIN project_members WHERE pm.user_id = $2` |
| `POST /api/generate/tier1/save-selection` | `SELECT 1 FROM project_members WHERE user_id = $2` |
| `POST /api/export/docx` | `JOIN project_members WHERE pm.user_id = $2` |

Alle returnerer 404 (ikke 403) ved manglende adgang — afslører ikke om resursen eksisterer.

---

### 9. UUID-gætning forhindret ✅

UUID v4 (2^122 entropi) + membership-krav = ikke muligt at tilgå fremmed projekt ved ID-gætning.

---

### 10. isSuperAdmin bypass smitter ikke af ✅

`backend/src/routes/projects.js:160`
```js
const isSuperAdmin = req.user.role === 'superadmin';
// SQL: WHERE id = $1 AND ($2 OR owner_id = $3)
// $2 = isSuperAdmin (boolean), evalueres i DB — ikke klient-kontrollerbar
```

---

## C. Input-sanitering

### 11. Zod-validation på alle endpoints ✅

Schemas bekræftet for: register, login, create-project, tier1-generate, bullet-challenges, evidence, docx-export.

---

### 12. SQL-queries parameteriserede ❌ KRITISK

**Sårbarhed: SQL Injection i `backend/src/routes/admin.js`**

`parseDays()` kalder `parseInt()`, men resultatet interpoleres direkte i SQL:

```js
// admin.js:17
const days = parseDays(req);                         // user-kontrolleret integer
const since = `NOW() - INTERVAL '${days} days'`;   // ← USIKKER INTERPOLATION

db.query(`
  SELECT ... WHERE created_at >= ${since} ...       // ← SQL INJECTION
`);
```

Ramt: `/api/admin/business?days=X`, `/api/admin/operational?days=X`, `/api/admin/product?days=X`, `/api/admin/metrics-history?days=X`.

**Angrebseksempel:**
```
GET /api/admin/business?days=30); DROP TABLE users; --
```

**Konsekvens:** Selv om `parseInt()` begrænser til tal, er koden skrevet med string-interpolation, og fremtidige ændringer til `parseDays()` (eller en anden kaldende kode der sender en streng) ville åbne for fuld SQL injection. Derudover: en fejl i `parseDays()` kunne returnere `NaN`, som JavaScript interpolerer som strengen `"NaN"`, hvilke ville medføre en ugyldig forespørgsel der potentielt afslører DB-fejlbeskeder.

**Fix-prompt:**
```
I admin.js, erstat alle template-literal INTERVAL-interpolationer med en
parameteriseret tilgang. Eksempel:
  Gammel: `WHERE created_at >= NOW() - INTERVAL '${days} days'`
  Ny:     `WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL`  med [days] som parameter
  Eller:  `WHERE created_at >= NOW() - INTERVAL '1 day' * $1`      med [days] som parameter
Gælder alle 4 admin-endpoints der bruger parseDays().
```

---

### 13. Ingen dangerouslySetInnerHTML ✅

Grep over `frontend/src/**` — ingen forekomster.

---

### 14. CORS-konfiguration ✅

`backend/src/index.js:19-32`
```js
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',').map(u => u.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
```
Ingen wildcard `*`. Whitelist via env-variabel.

---

### 15. Helmet.js ✅

`backend/src/index.js:17` — `app.use(helmet())` — alle security-headers aktive.

---

## D. Secrets og environment

### 16. Ingen secrets i git ✅

`.env.example`-filer indeholder kun placeholders. Ingen API-nøgler i kildekoden.

### 17. .env i .gitignore ✅

`.gitignore` indeholder `.env`, `.env.local`, `.env.production`.

### 18. Frontend eksponerer ikke backend-secrets ✅

`frontend/.env.example` indeholder kun `VITE_API_URL` og `VITE_SENTRY_DSN`. Ingen `sk-`, `SG.` eller database-URLs.

---

## E. GDPR og audit

### 19. Bruger data-eksport endpoint ❌

Intet `GET /api/user/export` eller tilsvarende. `POST /api/export/docx` eksporterer genereret jobopslag — ikke brugerens persondata.

**GDPR art. 15:** Brugere har ret til at få udleveret alle data vi opbevarer om dem.

**Fix-prompt:**
```
Implementér GET /api/user/export (kræver auth). Returnér JSON med:
- users-rækken (minus password_hash)
- alle projects med members
- events for brugeren
- ai_calls for brugeren
- bias_violations for brugeren
Sæt Content-Disposition: attachment; filename="my-data.json"
```

---

### 20. Kontosletning (GDPR art. 17) ❌

Ingen `DELETE /api/user/account` endpoint. Projekter bruger soft delete (`deleted_at`) men brugere kan ikke slette deres konto.

**Fix-prompt:**
```
Implementér DELETE /api/user/account (kræver auth + password-bekræftelse).
Slet i rækkefølge: bias_violations → ai_calls → events → project_members
→ projects (hard delete eller cascade) → password_reset_tokens → users.
Alternativt: anonymisér brugeren (sæt email til deleted_<uuid>@deleted,
slet password_hash, sæt deleted_at på users) og slet projekter.
```

---

### 21. Audit trail ✅

`events`-tabel (`001_initial.sql:136-146`) logger: `signup`, `login`, `project_started`, `step_completed`, `project_abandoned`, `project_downloaded`, `bias_triggered`, `ai_call_made`.

`ai_calls`-tabel: fuld log af AI-kald inkl. prompt-fil, tokens, cost og latency.

`bias_violations`-tabel: matched tekst, regel, brugerhandling.

---

### 22. Audit logs indeholder ikke passwords ✅

`event_data` i `events` indeholder email (acceptabelt) men aldrig password_hash eller rå tokens. AI-kald logges uden systemsecrets.

---

## F. AI-specifik

### 23. Rate limit AI-kald ⚠️

`backend/src/middleware/rateLimiter.js:11-18`
```js
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 time
  max: 100,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'AI call limit reached (100/hour)' },
});
```

Limiteren er **defineret men ikke tilknyttet** nogen endpoints. Hverken `POST /api/generate/tier1` eller `POST /api/generate/bullet-challenges` bruger den.

**Fix-prompt:**
```
I backend/src/routes/generate.js (og eventuelle andre AI-routes):
Importer aiLimiter fra middleware/rateLimiter.js og tilknyt den:
  router.post('/tier1', requireAuth, aiLimiter, async (req, res, next) => { ... })
  router.post('/bullet-challenges', requireAuth, aiLimiter, async (req, res, next) => { ... })
```

---

### 24. Per-bruger budget cap ❌

Ingen enforcement. `backend/.env.example` nævner `AI_COST_ALERT_DKK=200` (admin-alert, ikke bruger-cap). `generate.js` har en TODO-kommentar for Fase 7.

**Konsekvens:** En bruger kan i princippet lave ubegrænsede AI-kald (begrænset kun af 100/time-limit der ikke er tilknyttet, se pkt. 23).

**Fix-prompt (Fase 7):**
```
I generate.js, før AI-kald: hent SUM(cost_cents) for brugeren i dag fra ai_calls.
Sammenlign med brugerens daglige budget (fra subscription-tier eller default 500 øre = 5 kr).
Returnér 429 med { error: 'Daily AI budget exceeded' } hvis cap er nået.
Superadmin bypasses (req.user.role === 'superadmin').
```

---

### 25. API-nøgler kun server-side ✅

`backend/src/services/claudeService.js:6`
```js
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
```
Ingen API-nøgler i `frontend/src/**`.

---

## G. Error handling

### 26. Fejl-responses lækker ikke detaljer ✅

`backend/src/middleware/errorHandler.js`
```js
const status  = err.status || 500;
const message = status < 500 ? err.message : 'An unexpected error occurred. Please try again.';
res.status(status).json({ error: message });
```
5xx → generisk besked. Stack traces sendes til Sentry, ikke klienten.

---

### 27. 401/403/404 afslører ikke ressource-eksistens ✅

- Alle projekt-endpoints returnerer 404 uanset om projektet ikke eksisterer eller brugeren blot ikke er member.
- Login: `"Invalid email or password"` uanset om email er ukendt eller password er forkert. Timing-safe delay (200 ms) ved ukendt email.
- Forgot-password: returnerer altid `{ ok: true }` uanset om email er registreret.

---

## Top-3 mest kritiske fund

### 🔴 1. SQL Injection i admin-routes (❌ pkt. 12)
**Fil:** `backend/src/routes/admin.js` — 4 endpoints  
Direkte interpolation af `days`-parameter i SQL INTERVAL-udtryk. Selv om `parseInt()` begrænser angrebsfladen, er koden skrevet usikkert og vil fejle ved `NaN` eller fremtidige ændringer. Kræver øjeblikkelig fix til parameteriserede queries.

### 🟡 2. AI rate limiter defineret men ikke tilknyttet (⚠️ pkt. 23)
**Fil:** `backend/src/middleware/rateLimiter.js` + `backend/src/routes/generate.js`  
`aiLimiter` eksisterer men anvendes ikke på nogen endpoint. Ingen beskyttelse mod misbrug af AI-API frem til Fase 7 budget-cap implementeres.

### 🟡 3. GDPR-compliance mangler (❌ pkt. 19 + 20)
Ingen data-eksport endpoint og ingen kontosletning. Præ-produktions blocker — kræver implementering inden offentlig launch.
