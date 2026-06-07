# Backlog

Opdateres løbende efterhånden som nye idéer fra pilotbrugere og tryktest indkommer.
Ingen af disse skal bygges nu — de noteres her så de ikke glemmes, og medtages i spec v1.5.

---

## 🚨 PRE-LAUNCH BLOCKERS

Disse SKAL være implementeret før første betalende kunde får adgang. Reference: SECURITY_AUDIT_v1.md.

### GDPR art. 15 — Data-eksport (audit pkt. 19)
Implementér `GET /api/user/export` (kræver auth).
Returnér JSON med users-rækken (minus password_hash), alle projects med members, events, ai_calls, bias_violations for brugeren.
`Content-Disposition: attachment; filename="my-data.json"`

### GDPR art. 17 — Kontosletning (audit pkt. 20)
Implementér `DELETE /api/user/account` (kræver auth + password-bekræftelse).
Anonymisér brugeren: email → `deleted_<uuid>@deleted`, slet password_hash, sæt deleted_at.
Slet projekter via cascade. Alternativt: hard delete i rækkefølge `bias_violations → ai_calls → events → project_members → projects → password_reset_tokens → users`.

### Per-bruger AI budget cap (audit pkt. 24)
I `generate.js`, `bulletChallenges.js`, `evidence.js` — før AI-kald: hent `SUM(cost_cents)` for brugeren i dag fra `ai_calls`. Sammenlign med daglig budget (default 500 øre = 5 kr). Returnér 429 hvis cap er nået. Superadmin bypasses (`req.user.role === 'superadmin'`).

---

## Features

### Favoritmarkerede opslag → few-shot-læring i prompten
Brugeren kan markere tidligere genererede jobopslag som favoritter.
Systemet injicerer markerede opslag som few-shot-eksempler i Claude-prompten, så AI'en over tid lærer hvad der virker for den specifikke organisation (tone, struktur, konkrethed).
Afhænger af: organisations-datamodel (bygget i Fase 6) + persistent template-arkiv (se nedenfor).

### Persistent template-arkiv per organisation
I dag er template-upload et engangs-valg per generering.
Byg et arkiv (organisation-niveau) hvor brugeren kan uploade og navngive tone-templates én gang og vælge dem fra en dropdown ved fremtidige genereringer.
Afhænger af: organisations-datamodel (bygget i Fase 6).

### Team-/multi-user UI oven på organisations-datamodellen
Invitér kolleger til en organisation, tildel roller (owner / admin / member), del projekter på tværs.
Selve datamodellen (`organizations` + `organization_members` tabeller) er allerede bygget — det er kun UI og adgangskontrol der mangler.
Afhænger af: organisation foundation (bygget i Fase 6).

---

*Disse punkter noteres i spec v1.5 ved næste konsolidering.*
