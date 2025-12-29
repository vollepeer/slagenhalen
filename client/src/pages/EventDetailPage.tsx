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
import { alpha, useTheme } from "@mui/material/styles";
import { useNavigate, useParams } from "react-router-dom";
import { apiGet, apiSend } from "../api";
import { EventDetail, EventParticipant, Player } from "../types";
import { formatEventDate } from "../utils/date";

export function EventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const eventId = Number(id);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeParticipantId, setActiveParticipantId] = useState<number | null>(null);
  const [prizeRanks, setPrizeRanks] = useState<[string, string, string]>([
    "1",
    "18",
    "25"
  ]);
  const theme = useTheme();

  const tieColors = useMemo(
    () => [
      alpha(theme.palette.secondary.main, 0.16),
      alpha(theme.palette.primary.main, 0.12),
      alpha(theme.palette.secondary.main, 0.1)
    ],
    [theme]
  );

  const rankingDisplay = useMemo(() => {
    if (!event) {
      return {
        rows: [] as EventParticipant[],
        activeById: new Map<number, { rank: number | null; score: number | null }>(),
        tieColorByScore: new Map<number, string>()
      };
    }

    const snapshots = event.participants.map((participant) => {
      if (participant.rankR3 !== null) {
        return {
          participant,
          rank: participant.rankR3,
          score: participant.totalPoints
        };
      }
      if (participant.rankR2 !== null) {
        const score = (participant.pointsR1 ?? 0) + (participant.pointsR2 ?? 0);
        return { participant, rank: participant.rankR2, score };
      }
      if (participant.rankR1 !== null) {
        return { participant, rank: participant.rankR1, score: participant.pointsR1 };
      }
      return { participant, rank: null, score: null };
    });

    const sorted = [...snapshots].sort((a, b) => {
      if (a.rank !== null && b.rank !== null) {
        return a.rank - b.rank;
      }
      if (a.rank !== null) return -1;
      if (b.rank !== null) return 1;
      return a.participant.playerName.localeCompare(b.participant.playerName);
    });

    const scoreCounts = new Map<number, number>();
    sorted.forEach((entry) => {
      if (entry.score !== null) {
        scoreCounts.set(entry.score, (scoreCounts.get(entry.score) ?? 0) + 1);
      }
    });

    const tieColorByScore = new Map<number, string>();
    let tieIndex = 0;
    sorted.forEach((entry) => {
      if (entry.score !== null && (scoreCounts.get(entry.score) ?? 0) > 1) {
        if (!tieColorByScore.has(entry.score)) {
          tieColorByScore.set(entry.score, tieColors[tieIndex % tieColors.length]);
          tieIndex += 1;
        }
      }
    });

    const activeById = new Map<number, { rank: number | null; score: number | null }>();
    sorted.forEach((entry) => {
      activeById.set(entry.participant.id, { rank: entry.rank, score: entry.score });
    });

    return {
      rows: sorted.map((entry) => entry.participant),
      activeById,
      tieColorByScore
    };
  }, [event, tieColors]);

  const loadEvent = async () => {
    try {
      const data = await apiGet<EventDetail>(`/api/events/${eventId}`);
      setEvent(data);
      if (data.prizeRanks.length === 3) {
        setPrizeRanks([
          String(data.prizeRanks[0]),
          String(data.prizeRanks[1]),
          String(data.prizeRanks[2])
        ]);
      }
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

  const savePrizeRanks = async () => {
    const parsed = prizeRanks.map((value) => Number(value));
    if (parsed.some((value) => !Number.isInteger(value) || value < 1 || value > 60)) {
      setError("Vul drie geldige rangnummers in.");
      return;
    }
    const unique = new Set(parsed);
    if (unique.size !== parsed.length) {
      setError("Prijsrangen moeten uniek zijn.");
      return;
    }
    try {
      await apiSend(`/api/events/${eventId}`, "PATCH", {
        prizeRank1: parsed[0],
        prizeRank2: parsed[1],
        prizeRank3: parsed[2]
      });
      setSuccess("Prijsrangen opgeslagen.");
      await loadEvent();
    } catch (err) {
      setError("Prijsrangen opslaan mislukt.");
    }
  };

  const unlockEvent = async () => {
    try {
      await apiSend(`/api/events/${eventId}/unlock`, "POST");
      setSuccess("Kaartavond ontgrendeld.");
      await loadEvent();
    } catch (err) {
      setError("Ontgrendelen mislukt.");
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
          Datum: {formatEventDate(event.eventDate)} · Status:{" "}
          {event.status === "LOCKED" ? "Vergrendeld" : "Open"}
        </Typography>
      </Box>

      {event.status === "LOCKED" && (
        <Alert severity="info">
          Deze kaartavond is vergrendeld. Ontgrendel om wijzigingen te doen.
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
                <TableCell sx={{ fontWeight: 700 }}>Rang (actueel)</TableCell>
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
              {rankingDisplay.rows.map((participant) => {
                const active = rankingDisplay.activeById.get(participant.id);
                const tieColor =
                  active?.score !== null && active?.score !== undefined
                    ? rankingDisplay.tieColorByScore.get(active.score)
                    : undefined;
                return (
                  <TableRow
                    key={participant.id}
                    sx={{
                      backgroundColor: tieColor,
                      outline:
                        activeParticipantId === participant.id
                          ? `2px solid ${theme.palette.secondary.main}`
                          : "none",
                      outlineOffset: "-2px"
                    }}
                  >
                    <TableCell sx={{ fontWeight: 700 }}>{active?.rank ?? ""}</TableCell>
                    <TableCell>{participant.playerName}</TableCell>
                    <TableCell>
                      <TextField
                        value={participant.pointsR1 ?? ""}
                        onFocus={() => setActiveParticipantId(participant.id)}
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
                        onFocus={() => setActiveParticipantId(participant.id)}
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
                        onFocus={() => setActiveParticipantId(participant.id)}
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
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2} direction={{ xs: "column", md: "row" }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6">Prijswinnaars</Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                <Typography variant="subtitle2">Prijsrangen per ronde</Typography>
                <Stack direction="row" spacing={1}>
                  {prizeRanks.map((value, index) => (
                    <TextField
                      key={`prize-rank-${index}`}
                      label={`Rang ${index + 1}`}
                      type="number"
                      size="small"
                      value={value}
                      onChange={(event) =>
                        setPrizeRanks((current) => {
                          const next = [...current] as [string, string, string];
                          next[index] = event.target.value;
                          return next;
                        })
                      }
                      inputProps={{ min: 1 }}
                      disabled={event.status === "LOCKED"}
                      sx={{ maxWidth: 110 }}
                    />
                  ))}
                  <Button
                    variant="outlined"
                    onClick={savePrizeRanks}
                    disabled={event.status === "LOCKED"}
                  >
                    Opslaan
                  </Button>
                </Stack>
              </Stack>
              <Stack spacing={1} sx={{ mt: 2 }}>
                {event.roundWinners.every((round) => round.winners.length === 0) ? (
                  <Typography variant="body2" color="text.secondary">
                    Nog geen prijswinnaars beschikbaar.
                  </Typography>
                ) : (
                  event.roundWinners.map((round) => (
                    <Box key={`round-${round.round}`}>
                      <Typography variant="subtitle2">
                        Ronde {round.round}
                      </Typography>
                      {round.winners.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          Geen prijswinnaars.
                        </Typography>
                      ) : (
                        round.winners.map((winner) => (
                          <Typography key={`round-${round.round}-${winner.rank}`}>
                            Rang {winner.rank}: {winner.playerName}
                          </Typography>
                        ))
                      )}
                    </Box>
                  ))
                )}
                <Box>
                  <Typography variant="subtitle2">Eindwinnaar</Typography>
                  {event.eventWinner ? (
                    <Typography>
                      Rang {event.eventWinner.rank}: {event.eventWinner.playerName}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Nog geen eindwinnaar beschikbaar.
                    </Typography>
                  )}
                </Box>
              </Stack>
            </Box>
            <Box sx={{ flex: 1 }}>
              {event.status === "LOCKED" ? (
                <>
                  <Typography variant="h6">Ontgrendelen</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Ontgrendel om de scores en deelnemers te wijzigen.
                  </Typography>
                  <Button
                    variant="contained"
                    color="secondary"
                    sx={{ mt: 1 }}
                    onClick={unlockEvent}
                  >
                    Kaartavond ontgrendelen
                  </Button>
                </>
              ) : (
                <>
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
                    disabled={!event.canLock}
                  >
                    Kaartavond vergrendelen
                  </Button>
                </>
              )}
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {event.tieErrors.length > 0 && (
        <Alert severity="warning">
          Gelijke totaalscores zijn niet toegestaan. Pas de punten aan.
        </Alert>
      )}
    </Stack>
  );
}
