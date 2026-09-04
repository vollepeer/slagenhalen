# KaartBuddy

Score- en rangschikkingsapp voor wekelijkse kaartavonden (Nederlandse UI), draaiend op Netlify (frontend + Functions) met Supabase (Postgres + Auth) als backend.

## Lokale ontwikkeling

Vereisten: Node.js, de Supabase CLI, en de Netlify CLI.

1) Start Supabase lokaal:

```bash
supabase start
```

2) Zet de omgevingsvariabelen klaar in `netlify/.env` en `client/.env` (zie `docs/superpowers/specs/2026-07-02-cloud-backend-migration-design.md` §1 voor welke variabelen nodig zijn).

3) Start de volledige stack (frontend + Functions) in één keer:

```bash
netlify dev
```

De app draait op `http://localhost:8888`.

## Testen

```bash
cd netlify && npm test
cd client && npm test
```

## Back-ups en herstel

Nog niet geïmplementeerd (gepland, zie Task 11b in het migratieplan) — er is momenteel geen
off-platform back-up. Databeheer's export-knop (`/api/data/export`) kan wel gebruikt worden voor
een handmatige export.

## Specificaties

Lees `docs/specs.md` voor alle bedrijfsregels, data model en acceptatietests.
