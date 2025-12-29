import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Typography
} from "@mui/material";
import { exportStore, importStore, resetStore } from "../localStore";

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
    </Stack>
  );
}
