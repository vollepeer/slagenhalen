import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { apiGet, apiSend } from "../api";
import { Season } from "../types";

export function SeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadSeasons = async () => {
    try {
      const data = await apiGet<Season[]>(
        `/api/seasons?includeArchived=${includeArchived}`
      );
      setSeasons(data);
      setError(null);
    } catch (err) {
      setError("Kon seizoenen niet laden.");
    }
  };

  useEffect(() => {
    void loadSeasons();
  }, [includeArchived]);

  const addSeason = async () => {
    if (!name.trim()) {
      setError("Vul een seizoensnaam in.");
      return;
    }
    try {
      await apiSend("/api/seasons", "POST", { name });
      setName("");
      await loadSeasons();
    } catch (err) {
      setError("Seizoen toevoegen mislukt.");
    }
  };

  const toggleArchive = async (season: Season) => {
    try {
      await apiSend(`/api/seasons/${season.id}`, "PATCH", {
        isArchived: !season.isArchived
      });
      await loadSeasons();
    } catch (err) {
      setError("Archiveren mislukt.");
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          Seizoenen
        </Typography>
        <Typography variant="body1">
          Maak seizoenen aan en beheer archivering.
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <FormControlLabel
            control={
              <Checkbox
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
              />
            }
            label="Toon gearchiveerde seizoenen"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2} direction={{ xs: "column", md: "row" }}>
            <TextField
              label="Nieuw seizoen"
              value={name}
              onChange={(event) => setName(event.target.value)}
              fullWidth
            />
            <Button variant="contained" onClick={addSeason}>
              Seizoen toevoegen
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      <Stack spacing={2}>
        {seasons.map((season) => (
          <Card key={season.id} variant="outlined">
            <CardContent
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2
              }}
            >
              <Box>
                <Typography variant="h6">{season.name}</Typography>
                {season.isArchived && (
                  <Typography variant="body2" color="text.secondary">
                    Gearchiveerd
                  </Typography>
                )}
              </Box>
              <Button
                variant="outlined"
                color={season.isArchived ? "secondary" : "primary"}
                onClick={() => toggleArchive(season)}
              >
                {season.isArchived ? "Herstellen" : "Archiveren"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
