import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router-dom";
import { Trophy, Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { apiGet, apiSend } from "../api";
import { EventDetail, EventParticipant, Player } from "../types";
import { formatEventDate } from "../utils/date";
import { formatPlayerId } from "../utils/playerId";
import { createKeyedDebouncer } from "../utils/keyedDebouncer";
import { RANK_MEDAL_COLORS } from "../utils/medalColors";

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
  const [activeParticipantId, setActiveParticipantId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("playerName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const inputRefs = useRef<
    Record<number, Partial<Record<"pointsR1" | "pointsR2" | "pointsR3", HTMLInputElement | null>>>
  >({});
  const scoreSaveDebouncer = useRef(
    createKeyedDebouncer<[EventParticipant, "pointsR1" | "pointsR2" | "pointsR3", number | null]>(
      SCORE_SAVE_DEBOUNCE_MS
    )
  );

  useEffect(() => {
    const debouncer = scoreSaveDebouncer.current;
    return () => debouncer.flushAll();
  }, []);

  const [prizeRanks, setPrizeRanks] = useState<[string, string, string]>(["1", "18", "25"]);

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
        return { participant, rank: participant.rankR3, score: participant.totalPoints };
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
    event.prizeRanks.forEach((rank, index) => {
      if (!rankColorByValue.has(rank)) {
        rankColorByValue.set(rank, RANK_MEDAL_COLORS[index] ?? RANK_MEDAL_COLORS[0]);
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

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDirection === "asc" ? " ▲" : " ▼") : "");

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
        setPrizeRanks([String(data.prizeRanks[0]), String(data.prizeRanks[1]), String(data.prizeRanks[2])]);
      }
    } catch (err) {
      toast.error("Kon kaartavond niet laden.");
    }
  };

  const loadPlayers = async () => {
    try {
      const data = await apiGet<Player[]>("/api/players?query=&includeArchived=false");
      setPlayers(data.filter((player) => !player.isArchived));
      if (data.length > 0 && playerId === "") {
        setPlayerId(data[0].id);
      }
    } catch (err) {
      toast.error("Kon spelers niet laden.");
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
      toast.error("Kies een speler.");
      return;
    }
    try {
      await apiSend(`/api/events/${eventId}/participants`, "POST", { playerId });
      toast.success("Deelnemer toegevoegd.");
      await loadEvent();
    } catch (err) {
      toast.error("Deelnemer toevoegen mislukt.");
    }
  };

  const playerIdByName = useMemo(() => {
    if (!event) return new Map<string, number>();
    const map = new Map<string, number>();
    event.participants.forEach((participant) => {
      map.set(participant.playerName, participant.playerId);
    });
    return map;
  }, [event]);

  const participantByName = useMemo(() => {
    if (!event) return new Map<string, EventParticipant>();
    const map = new Map<string, EventParticipant>();
    event.participants.forEach((participant) => {
      map.set(participant.playerName, participant);
    });
    return map;
  }, [event]);

  const formatWinnerLabel = (name: string) => {
    const winnerPlayerId = playerIdByName.get(name);
    if (!winnerPlayerId) return name;
    return `${formatPlayerId(winnerPlayerId)} · ${name}`;
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
      await apiSend(`/api/events/${eventId}/participants/${participant.id}`, "PATCH", { [field]: payloadValue });
    } catch (err) {
      toast.error("Punten opslaan mislukt.");
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

    setEvent((current) => {
      if (!current) return current;
      return {
        ...current,
        participants: current.participants.map((p) => (p.id === participant.id ? { ...p, [field]: payloadValue } : p))
      };
    });

    scoreSaveDebouncer.current.schedule(`${participant.id}:${field}`, saveScore, participant, field, payloadValue);
  };

  const removeParticipant = async (participant: EventParticipant) => {
    try {
      await apiSend(`/api/events/${eventId}/participants/${participant.id}`, "DELETE");
      toast.success("Deelnemer verwijderd.");
      await loadEvent();
      await loadPlayers();
    } catch (err) {
      toast.error("Deelnemer verwijderen mislukt.");
    }
  };

  const lockEvent = async () => {
    try {
      await apiSend(`/api/events/${eventId}/lock`, "POST");
      toast.success("Kaartavond vergrendeld.");
      await loadEvent();
    } catch (err) {
      toast.error("Vergrendelen mislukt. Controleer de voorwaarden.");
    }
  };

  const savePrizeRanks = async () => {
    const parsed = prizeRanks.map((value) => Number(value));
    if (parsed.some((value) => !Number.isInteger(value) || value < 1 || value > 60)) {
      toast.error("Vul drie geldige rangnummers in.");
      return;
    }
    const unique = new Set(parsed);
    if (unique.size !== parsed.length) {
      toast.error("Prijsrangen moeten uniek zijn.");
      return;
    }
    try {
      await apiSend(`/api/events/${eventId}`, "PATCH", {
        prizeRank1: parsed[0],
        prizeRank2: parsed[1],
        prizeRank3: parsed[2]
      });
      toast.success("Prijsrangen opgeslagen.");
      await loadEvent();
    } catch (err) {
      toast.error("Prijsrangen opslaan mislukt.");
    }
  };

  const unlockEvent = async () => {
    try {
      await apiSend(`/api/events/${eventId}/unlock`, "POST");
      toast.success("Kaartavond ontgrendeld.");
      await loadEvent();
    } catch (err) {
      toast.error("Ontgrendelen mislukt.");
    }
  };

  if (!event) {
    return (
      <div>
        <p>Kaartavond laden...</p>
      </div>
    );
  }

  const endWinners = event.eventWinners.length > 0 ? event.eventWinners : event.eventWinner ? [event.eventWinner] : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">{event.title || "Kaartavond"}</h1>
        <p>
          Datum: {formatEventDate(event.eventDate)} · Status: {event.status === "LOCKED" ? "Vergrendeld" : "Open"}
        </p>
      </div>

      {event.status === "LOCKED" && (
        <Card className="border-primary/40 bg-secondary">
          <CardContent className="pt-6 text-sm">
            Deze kaartavond is vergrendeld. Ontgrendel om wijzigingen te doen.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center">
          <Select
            value={playerId === "" ? undefined : String(playerId)}
            onValueChange={(value) => setPlayerId(Number(value))}
            disabled={event.status === "LOCKED"}
          >
            <SelectTrigger className="md:w-64">
              <SelectValue placeholder="Deelnemer toevoegen" />
            </SelectTrigger>
            <SelectContent>
              {availablePlayers.map((player) => (
                <SelectItem key={player.id} value={String(player.id)}>
                  {formatPlayerId(player.id)} · {player.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={addParticipant} disabled={event.status === "LOCKED" || availablePlayers.length === 0}>
            Deelnemer toevoegen
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-lg font-semibold">Scores en rangschikking</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("activeRank")}>
                  Rang{sortIndicator("activeRank")}
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("playerId")}>
                  ID{sortIndicator("playerId")}
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("playerName")}>
                  Naam{sortIndicator("playerName")}
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("pointsR1")}>
                  Punten R1{sortIndicator("pointsR1")}
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("pointsR2")}>
                  Punten R2{sortIndicator("pointsR2")}
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("pointsR3")}>
                  Punten R3{sortIndicator("pointsR3")}
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("totalPoints")}>
                  Totaal punten{sortIndicator("totalPoints")}
                </TableHead>
                <TableHead>Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rankingDisplay.rows.map((participant) => {
                const active = rankingDisplay.activeById.get(participant.id);
                const colorFor = (rank: number | null | undefined) =>
                  rank !== null && rank !== undefined ? rankingDisplay.rankColorByValue.get(rank) : undefined;

                return (
                  <TableRow
                    key={participant.id}
                    className={cn(activeParticipantId === participant.id && "ring-2 ring-inset ring-primary")}
                  >
                    <TableCell className="font-semibold">{active?.rank ?? ""}</TableCell>
                    <TableCell>{formatPlayerId(participant.playerId)}</TableCell>
                    <TableCell>{participant.playerName}</TableCell>
                    <TableCell style={{ backgroundColor: colorFor(participant.rankR1) }}>
                      <Input
                        type="number"
                        min={0}
                        className="w-20"
                        value={participant.pointsR1 ?? ""}
                        onFocus={() => setActiveParticipantId(participant.id)}
                        ref={(element) => {
                          inputRefs.current[participant.id] = inputRefs.current[participant.id] || {};
                          inputRefs.current[participant.id].pointsR1 = element;
                        }}
                        onChange={(event) => updateScore(participant, "pointsR1", event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Tab") {
                            event.preventDefault();
                            focusNextInColumn("pointsR1", participant.id, event.shiftKey ? -1 : 1);
                          }
                        }}
                        disabled={event.status === "LOCKED"}
                      />
                    </TableCell>
                    <TableCell style={{ backgroundColor: colorFor(participant.rankR2) }}>
                      <Input
                        type="number"
                        min={0}
                        className="w-20"
                        value={participant.pointsR2 ?? ""}
                        onFocus={() => setActiveParticipantId(participant.id)}
                        ref={(element) => {
                          inputRefs.current[participant.id] = inputRefs.current[participant.id] || {};
                          inputRefs.current[participant.id].pointsR2 = element;
                        }}
                        onChange={(event) => updateScore(participant, "pointsR2", event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Tab") {
                            event.preventDefault();
                            focusNextInColumn("pointsR2", participant.id, event.shiftKey ? -1 : 1);
                          }
                        }}
                        disabled={event.status === "LOCKED"}
                      />
                    </TableCell>
                    <TableCell style={{ backgroundColor: colorFor(participant.rankR3) }}>
                      <Input
                        type="number"
                        min={0}
                        className="w-20"
                        value={participant.pointsR3 ?? ""}
                        onFocus={() => setActiveParticipantId(participant.id)}
                        ref={(element) => {
                          inputRefs.current[participant.id] = inputRefs.current[participant.id] || {};
                          inputRefs.current[participant.id].pointsR3 = element;
                        }}
                        onChange={(event) => updateScore(participant, "pointsR3", event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Tab") {
                            event.preventDefault();
                            focusNextInColumn("pointsR3", participant.id, event.shiftKey ? -1 : 1);
                          }
                        }}
                        disabled={event.status === "LOCKED"}
                      />
                    </TableCell>
                    <TableCell>{participant.totalPoints ?? ""}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        className="text-destructive"
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6">
            <h2 className="text-lg font-semibold">Prijswinnaars</h2>
            <p className="text-sm font-medium">Prijsrangen per ronde</p>
            <div className="flex flex-col gap-2">
              {prizeRanks.map((value, index) => (
                <Input
                  key={`prize-rank-${index}`}
                  type="number"
                  min={1}
                  className="max-w-40"
                  placeholder={`R${index + 1}`}
                  value={value}
                  onChange={(event) =>
                    setPrizeRanks((current) => {
                      const next = [...current] as [string, string, string];
                      next[index] = event.target.value;
                      return next;
                    })
                  }
                  disabled={event.status === "LOCKED"}
                />
              ))}
              <Button variant="outline" onClick={savePrizeRanks} disabled={event.status === "LOCKED"}>
                Opslaan
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-secondary">
          <CardContent className="flex flex-col gap-3 pt-6">
            <h2 className="text-lg font-semibold">Kaartavondresultaten</h2>
            {event.roundWinners.every((round) => round.winners.length === 0) ? (
              <p className="text-sm text-muted-foreground">Nog geen prijswinnaars beschikbaar.</p>
            ) : (
              event.roundWinners.map((round) => (
                <div key={`round-${round.round}`} className="rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-2">
                    <Medal className="h-4 w-4 text-accent" />
                    <span className="font-semibold">R{round.round}</span>
                  </div>
                  <div className="mt-1">
                    {round.winners.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Geen prijswinnaars.</p>
                    ) : (
                      round.winners.map((winner) => {
                        const points = getRoundPoints(winner.playerName, round.round);
                        const suffix = formatPoints(points);
                        return (
                          <p key={`round-${round.round}-${winner.rank}`}>
                            Rang {winner.rank}: {formatWinnerLabel(winner.playerName)}
                            {suffix ? ` · ${suffix}` : ""}
                          </p>
                        );
                      })
                    )}
                  </div>
                </div>
              ))
            )}
            <div className="rounded-lg border border-accent/40 bg-accent/10 p-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-accent" />
                <span className="font-semibold">Eindwinnaar</span>
              </div>
              <div className="mt-1">
                {endWinners.length > 0 ? (
                  endWinners.map((winner, index) => {
                    const suffix = formatPoints(getTotalPoints(winner.playerName));
                    return (
                      <p key={`event-winner-${winner.rank}-${winner.playerName}-${index}`}>
                        Rang {winner.rank}: {formatWinnerLabel(winner.playerName)}
                        {suffix ? ` · ${suffix}` : ""}
                      </p>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">Nog geen eindwinnaar beschikbaar.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {event.status === "LOCKED" ? (
              <>
                <h2 className="text-lg font-semibold">Ontgrendelen</h2>
                <p className="text-sm text-muted-foreground">Ontgrendel om de scores en deelnemers te wijzigen.</p>
                <Button className="mt-2" variant="secondary" onClick={unlockEvent}>
                  Kaartavond ontgrendelen
                </Button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">Vergrendelen</h2>
                {event.canLock ? (
                  <p className="text-sm">Alle voorwaarden zijn in orde.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Voorwaarden niet voldaan: {event.lockReasons.join(", ")}</p>
                )}
                <Button className="mt-2" onClick={lockEvent} disabled={!event.canLock}>
                  Kaartavond vergrendelen
                </Button>
              </>
            )}
            {event.tieErrors.length > 0 && (
              <p className="mt-4 text-sm font-medium text-destructive">
                Let op: gelijke totaalscores in de eindstand. Vergrendelen is toegestaan.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
