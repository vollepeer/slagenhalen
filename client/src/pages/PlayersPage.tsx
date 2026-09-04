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
import { Player } from "../types";
import { formatPlayerId } from "../utils/playerId";

export function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingPlayerId, setEditingPlayerId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const loadPlayers = async () => {
    try {
      const data = await apiGet<Player[]>(
        `/api/players?query=${encodeURIComponent(query)}&includeArchived=${includeArchived}`
      );
      setPlayers(data);
      setError(null);
    } catch (err) {
      setError("Kon spelers niet laden.");
    }
  };

  useEffect(() => {
    void loadPlayers();
  }, [query, includeArchived]);

  const addPlayer = async () => {
    if (!name.trim()) {
      setError("Vul een naam in.");
      return;
    }
    try {
      const created = await apiSend<{ id: number; name: string }>("/api/players", "POST", { name });
      setName("");
      setError(null);
      // Insert locally instead of re-fetching the whole list — the response already has
      // everything needed, and a new player is never archived so it always belongs in view.
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery || created.name.toLowerCase().includes(normalizedQuery)) {
        setPlayers((current) =>
          [...current, { id: created.id, name: created.name, isArchived: false }].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        );
      }
    } catch (err) {
      setError("Toevoegen mislukt. Controleer of de naam uniek is.");
    }
  };

  const toggleArchive = async (player: Player) => {
    try {
      await apiSend(`/api/players/${player.id}`, "PATCH", {
        isArchived: !player.isArchived
      });
      await loadPlayers();
    } catch (err) {
      setError("Archiveren mislukt.");
    }
  };

  const startEdit = (player: Player) => {
    setEditingPlayerId(player.id);
    setEditingName(player.name);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingPlayerId(null);
    setEditingName("");
  };

  const saveEdit = async (player: Player) => {
    if (!editingName.trim()) {
      setError("Vul een naam in.");
      return;
    }
    try {
      await apiSend(`/api/players/${player.id}`, "PATCH", { name: editingName });
      await loadPlayers();
      cancelEdit();
    } catch (err) {
      setError("Bewerken mislukt. Controleer of de naam uniek is.");
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          Spelers
        </Typography>
        <Typography variant="body1">
          Beheer spelers en zorg dat namen uniek blijven.
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Stack spacing={2} direction={{ xs: "column", md: "row" }}>
            <TextField
              label="Zoeken"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              fullWidth
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={includeArchived}
                  onChange={(event) => setIncludeArchived(event.target.checked)}
                />
              }
              label="Toon gearchiveerde spelers"
            />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2} direction={{ xs: "column", md: "row" }}>
            <TextField
              label="Nieuwe speler"
              value={name}
              onChange={(event) => setName(event.target.value)}
              fullWidth
            />
            <Button variant="contained" onClick={addPlayer}>
              Speler toevoegen
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      <Stack spacing={2}>
        {players.map((player) => (
          <Card key={player.id} variant="outlined">
            <CardContent
              sx={{
                display: "flex",
                justifyContent: "space-between",
                gap: 2,
                flexDirection: { xs: "column", md: "row" },
                alignItems: { xs: "stretch", md: "center" }
              }}
            >
              <Box>
                {editingPlayerId === player.id ? (
                  <TextField
                    label="Spelernaam"
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    fullWidth
                  />
                ) : (
                  <Typography variant="h6">{player.name}</Typography>
                )}
                <Typography variant="body2" color="text.secondary">
                  Speler-ID: {formatPlayerId(player.id)}
                </Typography>
                {player.isArchived && (
                  <Typography variant="body2" color="text.secondary">
                    Gearchiveerd
                  </Typography>
                )}
              </Box>
              <Stack direction="row" spacing={1}>
                {editingPlayerId === player.id ? (
                  <>
                    <Button
                      variant="contained"
                      onClick={() => saveEdit(player)}
                      disabled={editingName.trim() === ""}
                    >
                      Opslaan
                    </Button>
                    <Button variant="outlined" onClick={cancelEdit}>
                      Annuleren
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outlined" onClick={() => startEdit(player)}>
                      Bewerken
                    </Button>
                    <Button
                      variant="outlined"
                      color={player.isArchived ? "secondary" : "primary"}
                      onClick={() => toggleArchive(player)}
                    >
                      {player.isArchived ? "Herstellen" : "Archiveren"}
                    </Button>
                  </>
                )}
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
