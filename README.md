# Filip Card

Offline score- en rangschikkingsapp voor wekelijkse kaartavonden (Nederlandse UI) met JSON-opslag op schijf.

## Lokale setup

1) Start de API:

```bash
cd server
npm install
npm run dev
```

2) Start de client:

```bash
cd client
npm install
npm run dev
```

De app draait op `http://localhost:5173` en de API op `http://localhost:3001`.

## Configuratie

- Server configuratie via `server/.env` (zie `server/.env.example`).
- De client gebruikt `VITE_API_BASE` indien nodig (anders `http://localhost:3001`).
- Data wordt lokaal opgeslagen in `db/data.json` (optioneel te verplaatsen via `DATA_PATH`).

## Specificaties

Lees `docs/specs.md` voor alle bedrijfsregels, data model en acceptatietests.
