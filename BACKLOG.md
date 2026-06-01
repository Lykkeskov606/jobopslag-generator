# Backlog

Opdateres løbende efterhånden som nye idéer fra pilotbrugere og tryktest indkommer.
Ingen af disse skal bygges nu — de noteres her så de ikke glemmes, og medtages i spec v1.5.

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
