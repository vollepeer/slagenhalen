import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { exportStore, importStore, nextId, readStore, resetStore, writeStore } from "../localStore";

function downloadFile(contents: string, filename: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildExportFilename() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
  return `filip-card-backup-${stamp}.json`;
}

export function DataPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [playerImportText, setPlayerImportText] = useState("");

  const handleExport = () => {
    try {
      const payload = exportStore();
      downloadFile(payload, buildExportFilename(), "application/json");
      setSuccess("Back-up opgeslagen.");
      setError(null);
    } catch (err) {
      setError("Exporteren mislukt.");
      setSuccess(null);
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      importStore(text);
      setSuccess("Back-up geimporteerd.");
      setError(null);
    } catch (err) {
      setError("Importeren mislukt. Controleer het bestand.");
      setSuccess(null);
    }
  };

  const handleReset = () => {
    const confirmed = window.confirm(
      "Weet je zeker dat je alle data wilt wissen? Dit kan niet ongedaan worden gemaakt."
    );
    if (!confirmed) return;
    try {
      resetStore();
      setSuccess("Alle data is gewist.");
      setError(null);
    } catch (err) {
      setError("Wissen mislukt.");
      setSuccess(null);
    }
  };

  const handleImportPlayers = () => {
    const lines = playerImportText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      setError("Plak minimaal één spelersnaam.");
      setSuccess(null);
      return;
    }

    const normalized = new Set<string>();
    const uniqueNames: string[] = [];
    lines.forEach((name) => {
      const key = name.toLowerCase();
      if (!normalized.has(key)) {
        normalized.add(key);
        uniqueNames.push(name);
      }
    });

    const before = readStore().players.length;
    writeStore((store) => {
      const existing = new Set(store.players.map((player) => player.name.toLowerCase()));
      const now = new Date().toISOString();
      uniqueNames.forEach((name) => {
        const key = name.toLowerCase();
        if (existing.has(key)) {
          return;
        }
        store.players.push({
          id: nextId(store, "players"),
          name,
          isArchived: false,
          createdAt: now,
          updatedAt: now
        });
        existing.add(key);
      });
    });
    const added = readStore().players.length - before;

    if (added === 0) {
      setError("Geen nieuwe spelers toegevoegd.");
      setSuccess(null);
      return;
    }

    setSuccess(`${added} spelers toegevoegd.`);
    setError(null);
    setPlayerImportText("");
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          Databeheer
        </Typography>
        <Typography variant="body1">
          Maak een back-up, importeer data of wis de lokale opslag.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Importeren vervangt de huidige data.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={2} direction={{ xs: "column", md: "row" }}>
            <Button variant="contained" onClick={handleExport}>
              Exporteer back-up
            </Button>
            <Button
              variant="outlined"
              onClick={() => inputRef.current?.click()}
            >
              Importeer back-up
            </Button>
            <Button variant="outlined" color="error" onClick={handleReset}>
              Wis alle data
            </Button>
          </Stack>
          <input
            ref={inputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleImport(file);
              }
              if (inputRef.current) {
                inputRef.current.value = "";
              }
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Spelers importeren</Typography>
            <Typography variant="body2" color="text.secondary">
              Plak spelersnamen, één naam per regel.
            </Typography>
            <TextField
              multiline
              minRows={6}
              placeholder="Jan Jansen&#10;Piet de Vries&#10;..."
              value={playerImportText}
              onChange={(event) => setPlayerImportText(event.target.value)}
              fullWidth
            />
            <Divider />
            <Button variant="contained" onClick={handleImportPlayers}>
              Importeer spelers
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
