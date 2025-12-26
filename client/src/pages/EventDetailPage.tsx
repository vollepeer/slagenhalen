import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";
import { apiGet, apiSend } from "../api";
import { EventDetail, EventParticipant, Player } from "../types";

export function EventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const eventId = Number(id);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadEvent = async () => {
    try {
      const data = await apiGet<EventDetail>(`/api/events/${eventId}`);
      setEvent(data);
      setError(null);
    } catch (err) {
      setError("Kon kaartavond niet laden.");
    }
  };

  const loadPlayers = async () => {
    try {
      const data = await apiGet<Player[]>(
        "/api/players?query=&includeArchived=false"
      );
      setPlayers(data.filter((player) => !player.isArchived));
      if (data.length > 0 && playerId === "") {
        setPlayerId(data[0].id);
      }
    } catch (err) {
      setError("Kon spelers niet laden.");
    }
  };

  useEffect(() => {
    if (!Number.isFinite(eventId)) {
      navigate("/events");
      return;
    }
    void loadEvent();
    void loadPlayers();
  }, [eventId]);

  const availablePlayers = useMemo(() => {
    if (!event) return players;
    const existing = new Set(event.participants.map((p) => p.playerId));
    return players.filter((player) => !existing.has(player.id));
  }, [players, event]);

  const addParticipant = async () => {
    if (playerId === "") {
      setError("Kies een speler.");
      return;
    }
    try {
      await apiSend(`/api/events/${eventId}/participants`, "POST", {
        playerId
      });
      setSuccess("Deelnemer toegevoegd.");
      await loadEvent();
    } catch (err) {
      setError("Deelnemer toevoegen mislukt.");
    }
  };

  const updateScore = async (
    participant: EventParticipant,
    field: "pointsR1" | "pointsR2" | "pointsR3",
    value: string
  ) => {
    const payloadValue = value === "" ? null : Number(value);
    if (value !== "" && Number.isNaN(payloadValue)) return;

    try {
      await apiSend(
        `/api/events/${eventId}/participants/${participant.id}`,
        "PATCH",
        { [field]: payloadValue }
      );
      await loadEvent();
    } catch (err) {
      setError("Punten opslaan mislukt.");
    }
  };

  const lockEvent = async () => {
    try {
      await apiSend(`/api/events/${eventId}/lock`, "POST");
      setSuccess("Kaartavond vergrendeld.");
      await loadEvent();
    } catch (err) {
      setError("Vergrendelen mislukt. Controleer de voorwaarden.");
    }
  };

  if (!event) {
    return (
      <Box>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography>Kaartavond laden...</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          {event.title || "Kaartavond"}
        </Typography>
        <Typography variant="body1">
          Datum: {event.eventDate} · Status: {event.status === "LOCKED" ? "Vergrendeld" : "Open"}
        </Typography>
      </Box>

      {event.status === "LOCKED" && (
        <Alert severity="info">
          Deze kaartavond is vergrendeld en kan niet meer worden aangepast.
        </Alert>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={2} direction={{ xs: "column", md: "row" }}>
            <TextField
              select
              label="Deelnemer toevoegen"
              value={playerId}
              onChange={(event) => setPlayerId(Number(event.target.value))}
              fullWidth
              disabled={event.status === "LOCKED"}
            >
              {availablePlayers.map((player) => (
                <MenuItem key={player.id} value={player.id}>
                  {player.name}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              onClick={addParticipant}
              disabled={event.status === "LOCKED" || availablePlayers.length === 0}
            >
              Deelnemer toevoegen
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Scores en rangschikking
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Speler</TableCell>
                <TableCell>Punten ronde 1</TableCell>
                <TableCell>Rang na ronde 1</TableCell>
                <TableCell>Punten ronde 2</TableCell>
                <TableCell>Rang na ronde 2</TableCell>
                <TableCell>Punten ronde 3</TableCell>
                <TableCell>Rang na ronde 3</TableCell>
                <TableCell>Totaal punten</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {event.participants.map((participant) => (
                <TableRow key={participant.id}>
                  <TableCell>{participant.playerName}</TableCell>
                  <TableCell>
                    <TextField
                      value={participant.pointsR1 ?? ""}
                      onChange={(event) =>
                        updateScore(participant, "pointsR1", event.target.value)
                      }
                      type="number"
                      size="small"
                      inputProps={{ min: 0 }}
                      disabled={event.status === "LOCKED"}
                    />
                  </TableCell>
                  <TableCell>{participant.rankR1 ?? ""}</TableCell>
                  <TableCell>
                    <TextField
                      value={participant.pointsR2 ?? ""}
                      onChange={(event) =>
                        updateScore(participant, "pointsR2", event.target.value)
                      }
                      type="number"
                      size="small"
                      inputProps={{ min: 0 }}
                      disabled={event.status === "LOCKED"}
                    />
                  </TableCell>
                  <TableCell>{participant.rankR2 ?? ""}</TableCell>
                  <TableCell>
                    <TextField
                      value={participant.pointsR3 ?? ""}
                      onChange={(event) =>
                        updateScore(participant, "pointsR3", event.target.value)
                      }
                      type="number"
                      size="small"
                      inputProps={{ min: 0 }}
                      disabled={event.status === "LOCKED"}
                    />
                  </TableCell>
                  <TableCell>{participant.rankR3 ?? ""}</TableCell>
                  <TableCell>{participant.totalPoints ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2} direction={{ xs: "column", md: "row" }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6">Prijswinnaars</Typography>
              {event.winners.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Nog geen prijswinnaars beschikbaar.
                </Typography>
              ) : (
                event.winners.map((winner) => (
                  <Typography key={winner.rank}>
                    Rang {winner.rank}: {winner.playerName}
                  </Typography>
                ))
              )}
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6">Vergrendelen</Typography>
              {event.canLock ? (
                <Typography variant="body2">Alle voorwaarden zijn in orde.</Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Voorwaarden niet voldaan: {event.lockReasons.join(", ")}
                </Typography>
              )}
              <Button
                variant="contained"
                sx={{ mt: 1 }}
                onClick={lockEvent}
                disabled={!event.canLock || event.status === "LOCKED"}
              >
                Kaartavond vergrendelen
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {event.tieErrors.length > 0 && (
        <Alert severity="warning">
          Gelijke scores zijn niet toegestaan. Pas de punten aan.
        </Alert>
      )}
    </Stack>
  );
}
