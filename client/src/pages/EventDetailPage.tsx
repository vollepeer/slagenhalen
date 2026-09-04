import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { useNavigate, useParams } from "react-router-dom";
import { apiGet, apiSend } from "../api";
import { EventDetail, EventParticipant, Player } from "../types";
import { formatEventDate } from "../utils/date";
import { formatPlayerId } from "../utils/playerId";
import { createKeyedDebouncer } from "../utils/keyedDebouncer";

const SCORE_SAVE_DEBOUNCE_MS = 500;

type SortDirection = "asc" | "desc";
type SortKey =
  | "activeRank"
  | "playerName"
  | "playerId"
  | "pointsR1"
  | "pointsR2"
  | "pointsR3"
  | "totalPoints";

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
  const [sortKey, setSortKey] = useState<SortKey>("playerName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const inputRefs = useRef<
    Record<number, Partial<Record<"pointsR1" | "pointsR2" | "pointsR3", HTMLInputElement | null>>>
  >({});
  const scoreSaveDebouncer = useRef(createKeyedDebouncer<[EventParticipant, "pointsR1" | "pointsR2" | "pointsR3", number | null]>(SCORE_SAVE_DEBOUNCE_MS));

  useEffect(() => {
    const debouncer = scoreSaveDebouncer.current;
    // Flush rather than cancel: a pending save must still go out even if the user
    // navigates away before the debounce window elapses, or the edit is silently lost.
    return () => debouncer.flushAll();
  }, []);
  const [prizeRanks, setPrizeRanks] = useState<[string, string, string]>([
    "1",
    "18",
    "25"
  ]);
  const theme = useTheme();

  const rankingDisplay = useMemo(() => {
    if (!event) {
      return {
        rows: [] as EventParticipant[],
        activeById: new Map<number, { rank: number | null; score: number | null }>(),
        rankColorByValue: new Map<number, string>()
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

    const activeById = new Map<number, { rank: number | null; score: number | null }>();
    snapshots.forEach((entry) => {
      activeById.set(entry.participant.id, { rank: entry.rank, score: entry.score });
    });

    const rankColorByValue = new Map<number, string>();
    const rankColors = ["#f6d365", "#c0c0c0", "#cd7f32"];
    event.prizeRanks.forEach((rank, index) => {
      if (!rankColorByValue.has(rank)) {
        rankColorByValue.set(rank, rankColors[index] ?? "#f6d365");
      }
    });

    const getSortValue = (entry: (typeof snapshots)[number], key: SortKey) => {
      const participant = entry.participant;
      switch (key) {
        case "activeRank":
          return entry.rank;
        case "playerName":
          return participant.playerName;
        case "playerId":
          return participant.playerId;
        case "pointsR1":
          return participant.pointsR1;
        case "pointsR2":
          return participant.pointsR2;
        case "pointsR3":
          return participant.pointsR3;
        case "totalPoints":
          return participant.totalPoints;
      }
    };

    const sorted = [...snapshots].sort((a, b) => {
      const aVal = getSortValue(a, sortKey);
      const bVal = getSortValue(b, sortKey);

      if (aVal === null || aVal === undefined) {
        if (bVal === null || bVal === undefined) {
          return a.participant.playerName.localeCompare(b.participant.playerName);
        }
        return 1;
      }
      if (bVal === null || bVal === undefined) {
        return -1;
      }

      let comparison = 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        comparison = aVal.localeCompare(bVal);
      } else {
        comparison = Number(aVal) - Number(bVal);
      }

      if (comparison === 0) {
        comparison = a.participant.playerName.localeCompare(b.participant.playerName);
      }

      return sortDirection === "asc" ? comparison : comparison * -1;
    });

    return {
      rows: sorted.map((entry) => entry.participant),
      activeById,
      rankColorByValue
    };
  }, [event, sortDirection, sortKey]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const focusNextInColumn = (
    field: "pointsR1" | "pointsR2" | "pointsR3",
    currentId: number,
    direction: 1 | -1
  ) => {
    const ids = rankingDisplay.rows.map((participant) => participant.id);
    const currentIndex = ids.indexOf(currentId);
    if (currentIndex === -1) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= ids.length) {
      return;
    }
    const nextId = ids[nextIndex];
    const nextInput = inputRefs.current[nextId]?.[field];
    if (nextInput) {
      nextInput.focus();
      nextInput.select();
    }
  };

  const loadEvent = async () => {
    try {
      const data = await apiGet<EventDetail>(`/api/events/${eventId}`);
      setEvent((current) => {
        if (!current) return data;
        // A score save still pending in the debouncer hasn't reached the server yet, so this
        // response can't reflect it — keep the on-screen (optimistic) value for that field
        // instead of overwriting it with the now-stale server value.
        return {
          ...data,
          participants: data.participants.map((fresh) => {
            const displayed = current.participants.find((p) => p.id === fresh.id);
            if (!displayed) return fresh;
            const merged = { ...fresh };
            (["pointsR1", "pointsR2", "pointsR3"] as const).forEach((field) => {
              if (scoreSaveDebouncer.current.hasPending(`${fresh.id}:${field}`)) {
                merged[field] = displayed[field];
              }
            });
            return merged;
          })
        };
      });
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

  const playerIdByName = useMemo(() => {
    if (!event) {
      return new Map<string, number>();
    }
    const map = new Map<string, number>();
    event.participants.forEach((participant) => {
      map.set(participant.playerName, participant.playerId);
    });
    return map;
  }, [event]);

  const participantByName = useMemo(() => {
    if (!event) {
      return new Map<string, EventParticipant>();
    }
    const map = new Map<string, EventParticipant>();
    event.participants.forEach((participant) => {
      map.set(participant.playerName, participant);
    });
    return map;
  }, [event]);

  const formatWinnerLabel = (name: string) => {
    const playerId = playerIdByName.get(name);
    if (!playerId) return name;
    return `${formatPlayerId(playerId)} · ${name}`;
  };

  const formatPoints = (points: number | null | undefined) => {
    if (points === null || points === undefined) return "";
    return `${points} p`;
  };

  const getRoundPoints = (name: string, round: 1 | 2 | 3) => {
    const participant = participantByName.get(name);
    if (!participant) return null;
    if (round === 1) return participant.pointsR1;
    if (round === 2) return participant.pointsR2;
    return participant.pointsR3;
  };

  const getTotalPoints = (name: string) => {
    const participant = participantByName.get(name);
    return participant?.totalPoints ?? null;
  };

  const saveScore = async (
    participant: EventParticipant,
    field: "pointsR1" | "pointsR2" | "pointsR3",
    payloadValue: number | null
  ) => {
    try {
      await apiSend(
        `/api/events/${eventId}/participants/${participant.id}`,
        "PATCH",
        { [field]: payloadValue }
      );
      setError(null);
    } catch (err) {
      // Resync below either way: on success this picks up the recomputed ranks/totals; on
      // failure the server never got the write, so this reverts the field to its real value
      // instead of leaving the optimistic (unsaved) number on screen indefinitely.
      setError("Punten opslaan mislukt.");
    } finally {
      await loadEvent();
    }
  };

  const updateScore = (
    participant: EventParticipant,
    field: "pointsR1" | "pointsR2" | "pointsR3",
    value: string
  ) => {
    const payloadValue = value === "" ? null : Number(value);
    if (value !== "" && Number.isNaN(payloadValue)) return;

    // Update the screen immediately so the typed digit shows without waiting on the network;
    // the actual save is debounced below so it fires once the user pauses, not on every keystroke.
    setEvent((current) => {
      if (!current) return current;
      return {
        ...current,
        participants: current.participants.map((p) =>
          p.id === participant.id ? { ...p, [field]: payloadValue } : p
        )
      };
    });

    scoreSaveDebouncer.current.schedule(
      `${participant.id}:${field}`,
      saveScore,
      participant,
      field,
      payloadValue
    );
  };

  const removeParticipant = async (participant: EventParticipant) => {
    try {
      await apiSend(
        `/api/events/${eventId}/participants/${participant.id}`,
        "DELETE"
      );
      setSuccess("Deelnemer verwijderd.");
      await loadEvent();
      await loadPlayers();
    } catch (err) {
      setError("Deelnemer verwijderen mislukt.");
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

  const endWinners = event.eventWinners.length > 0
    ? event.eventWinners
    : event.eventWinner
      ? [event.eventWinner]
      : [];

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
                  {formatPlayerId(player.id)} · {player.name}
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
                <TableCell sortDirection={sortKey === "activeRank" ? sortDirection : false}>
                  <TableSortLabel
                    active={sortKey === "activeRank"}
                    direction={sortKey === "activeRank" ? sortDirection : "asc"}
                    onClick={() => handleSort("activeRank")}
                  >
                    Rang
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortKey === "playerId" ? sortDirection : false}>
                  <TableSortLabel
                    active={sortKey === "playerId"}
                    direction={sortKey === "playerId" ? sortDirection : "asc"}
                    onClick={() => handleSort("playerId")}
                  >
                    ID
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortKey === "playerName" ? sortDirection : false}>
                  <TableSortLabel
                    active={sortKey === "playerName"}
                    direction={sortKey === "playerName" ? sortDirection : "asc"}
                    onClick={() => handleSort("playerName")}
                  >
                    Naam
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortKey === "pointsR1" ? sortDirection : false}>
                  <TableSortLabel
                    active={sortKey === "pointsR1"}
                    direction={sortKey === "pointsR1" ? sortDirection : "asc"}
                    onClick={() => handleSort("pointsR1")}
                  >
                    Punten R1
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortKey === "pointsR2" ? sortDirection : false}>
                  <TableSortLabel
                    active={sortKey === "pointsR2"}
                    direction={sortKey === "pointsR2" ? sortDirection : "asc"}
                    onClick={() => handleSort("pointsR2")}
                  >
                    Punten R2
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortKey === "pointsR3" ? sortDirection : false}>
                  <TableSortLabel
                    active={sortKey === "pointsR3"}
                    direction={sortKey === "pointsR3" ? sortDirection : "asc"}
                    onClick={() => handleSort("pointsR3")}
                  >
                    Punten R3
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortKey === "totalPoints" ? sortDirection : false}>
                  <TableSortLabel
                    active={sortKey === "totalPoints"}
                    direction={sortKey === "totalPoints" ? sortDirection : "asc"}
                    onClick={() => handleSort("totalPoints")}
                  >
                    Totaal punten
                  </TableSortLabel>
                </TableCell>
                <TableCell>Acties</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rankingDisplay.rows.map((participant) => {
                const active = rankingDisplay.activeById.get(participant.id);
                const colorR1 =
                  participant.rankR1 !== null && participant.rankR1 !== undefined
                    ? rankingDisplay.rankColorByValue.get(participant.rankR1)
                    : undefined;
                const colorR2 =
                  participant.rankR2 !== null && participant.rankR2 !== undefined
                    ? rankingDisplay.rankColorByValue.get(participant.rankR2)
                    : undefined;
                const colorR3 =
                  participant.rankR3 !== null && participant.rankR3 !== undefined
                    ? rankingDisplay.rankColorByValue.get(participant.rankR3)
                    : undefined;
                return (
                  <TableRow
                    key={participant.id}
                    sx={{
                      outline:
                        activeParticipantId === participant.id
                          ? `2px solid ${theme.palette.secondary.main}`
                          : "none",
                      outlineOffset: "-2px"
                    }}
                  >
                    <TableCell sx={{ fontWeight: 700 }}>
                      {active?.rank ?? ""}
                    </TableCell>
                    <TableCell>{formatPlayerId(participant.playerId)}</TableCell>
                    <TableCell>{participant.playerName}</TableCell>
                    <TableCell sx={colorR1 ? { backgroundColor: colorR1 } : undefined}>
                      <TextField
                        value={participant.pointsR1 ?? ""}
                        onFocus={() => setActiveParticipantId(participant.id)}
                        inputRef={(element) => {
                          inputRefs.current[participant.id] =
                            inputRefs.current[participant.id] || {};
                          inputRefs.current[participant.id].pointsR1 = element;
                        }}
                        onChange={(event) =>
                          updateScore(participant, "pointsR1", event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Tab") {
                            event.preventDefault();
                            focusNextInColumn(
                              "pointsR1",
                              participant.id,
                              event.shiftKey ? -1 : 1
                            );
                          }
                        }}
                      type="number"
                      size="small"
                      inputProps={{ min: 0 }}
                      disabled={event.status === "LOCKED"}
                    />
                  </TableCell>
                  <TableCell sx={colorR2 ? { backgroundColor: colorR2 } : undefined}>
                      <TextField
                        value={participant.pointsR2 ?? ""}
                        onFocus={() => setActiveParticipantId(participant.id)}
                        inputRef={(element) => {
                          inputRefs.current[participant.id] =
                            inputRefs.current[participant.id] || {};
                          inputRefs.current[participant.id].pointsR2 = element;
                        }}
                        onChange={(event) =>
                          updateScore(participant, "pointsR2", event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Tab") {
                            event.preventDefault();
                            focusNextInColumn(
                              "pointsR2",
                              participant.id,
                              event.shiftKey ? -1 : 1
                            );
                          }
                        }}
                      type="number"
                      size="small"
                      inputProps={{ min: 0 }}
                      disabled={event.status === "LOCKED"}
                    />
                  </TableCell>
                  <TableCell sx={colorR3 ? { backgroundColor: colorR3 } : undefined}>
                      <TextField
                        value={participant.pointsR3 ?? ""}
                        onFocus={() => setActiveParticipantId(participant.id)}
                        inputRef={(element) => {
                          inputRefs.current[participant.id] =
                            inputRefs.current[participant.id] || {};
                          inputRefs.current[participant.id].pointsR3 = element;
                        }}
                        onChange={(event) =>
                          updateScore(participant, "pointsR3", event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Tab") {
                            event.preventDefault();
                            focusNextInColumn(
                              "pointsR3",
                              participant.id,
                              event.shiftKey ? -1 : 1
                            );
                          }
                        }}
                      type="number"
                      size="small"
                      inputProps={{ min: 0 }}
                      disabled={event.status === "LOCKED"}
                    />
                  </TableCell>
                    <TableCell>{participant.totalPoints ?? ""}</TableCell>
                    <TableCell>
                      <Button
                        variant="text"
                        color="error"
                        onClick={() => removeParticipant(participant)}
                        disabled={event.status === "LOCKED"}
                      >
                        Verwijderen
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }
        }}
      >
        <Card>
          <CardContent>
            <Typography variant="h6">Prijswinnaars</Typography>
            <Stack spacing={1} sx={{ mt: 1 }}>
              <Typography variant="subtitle2">Prijsrangen per ronde</Typography>
              <Stack spacing={1}>
                {prizeRanks.map((value, index) => (
                  <TextField
                    key={`prize-rank-${index}`}
                        label={`R${index + 1}`}
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
                    sx={{ maxWidth: 160 }}
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
          </CardContent>
        </Card>

        <Card sx={{ bgcolor: "#f8f2e8" }}>
          <CardContent>
            <Typography variant="h6">Kaartavondresultaten</Typography>
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              {event.roundWinners.every((round) => round.winners.length === 0) ? (
                <Typography variant="body2" color="text.secondary">
                  Nog geen prijswinnaars beschikbaar.
                </Typography>
              ) : (
                event.roundWinners.map((round) => (
                  <Box
                    key={`round-${round.round}`}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      border: "1px solid #eadfcf",
                      bgcolor: "#fffaf1"
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip
                        label={`R${round.round}`}
                        size="small"
                        sx={{ bgcolor: "#efe3d0", fontWeight: 700 }}
                      />
                    </Stack>
                    <Box sx={{ mt: 1 }}>
                      {round.winners.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          Geen prijswinnaars.
                        </Typography>
                      ) : (
                        round.winners.map((winner) => {
                          const points = getRoundPoints(winner.playerName, round.round);
                          const suffix = formatPoints(points);
                          return (
                            <Typography key={`round-${round.round}-${winner.rank}`}>
                              Rang {winner.rank}: {formatWinnerLabel(winner.playerName)}
                              {suffix ? ` · ${suffix}` : ""}
                            </Typography>
                          );
                        })
                      )}
                    </Box>
                  </Box>
                ))
              )}
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: "1px solid #e4d2b4",
                  bgcolor: "#fff4dc"
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <EmojiEventsIcon sx={{ color: "#c9a227" }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Eindwinnaar
                  </Typography>
                </Stack>
                <Box sx={{ mt: 1 }}>
                  {endWinners.length > 0 ? (
                    endWinners.map((winner, index) => {
                      const suffix = formatPoints(getTotalPoints(winner.playerName));
                      return (
                        <Typography key={`event-winner-${winner.rank}-${winner.playerName}-${index}`}>
                          Rang {winner.rank}: {formatWinnerLabel(winner.playerName)}
                          {suffix ? ` · ${suffix}` : ""}
                        </Typography>
                      );
                    })
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Nog geen eindwinnaar beschikbaar.
                    </Typography>
                  )}
                </Box>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
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
            {event.tieErrors.length > 0 && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Let op: gelijke totaalscores in de eindstand. Vergrendelen is toegestaan.
              </Alert>
            )}
          </CardContent>
        </Card>
      </Box>
    </Stack>
  );
}
