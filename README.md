# Filip Card

Offline score- en rangschikkingsapp voor wekelijkse kaartavonden (Nederlandse UI) met lokale browseropslag (geen backend).

## Lokale setup

1) Start de client:

```bash
cd client
npm install
npm run dev
```

De app draait op `http://localhost:5173` zonder aparte API.

## Configuratie

- Data wordt lokaal opgeslagen in de browser (localStorage).

## Databeheer

- Gebruik de tab “Databeheer” om back-ups te exporteren, importeren of alle data te wissen.

## Lokale preview zonder Node

1) Build de client: `cd client && npm run build`
2) Start de lokale server: `./serve.sh` (of `./serve-spa.sh` voor SPA refresh)
3) Open `http://localhost:8000`

## Specificaties

Lees `docs/specs.md` voor alle bedrijfsregels, data model en acceptatietests.
