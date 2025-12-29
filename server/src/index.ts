import express from "express";
import cors from "cors";
import { config } from "./config.js";
import {
  addParticipantSchema,
  createEventSchema,
  createPlayerSchema,
  createSeasonSchema,
  updateEventSchema,
  updateParticipantSchema,
  updatePlayerSchema,
  updateSeasonSchema
} from "./validators.js";
import { canLockEvent, computeRanking, ParticipantRow } from "./ranking.js";
import {
  Event,
  EventParticipant,
  Player,
  Season,
  nextId,
  readStore,
  writeStore
} from "./storage.js";

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

const DUPLICATE_PLAYER = "DUPLICATE_PLAYER";
const DUPLICATE_PARTICIPANT = "DUPLICATE_PARTICIPANT";
const EVENT_NOT_FOUND = "EVENT_NOT_FOUND";
const PLAYER_NOT_FOUND = "PLAYER_NOT_FOUND";
const SEASON_NOT_FOUND = "SEASON_NOT_FOUND";

function nowIso() {
  return new Date().toISOString();
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function validatePrizeRanks(prizeRanks: number[]) {
  const unique = new Set(prizeRanks);
  if (unique.size !== prizeRanks.length) {
    return "Prijsrangen moeten uniek zijn.";
  }
  return null;
}

async function getEventById(eventId: number) {
  const store = await readStore();
  return store.events.find((event) => event.id === eventId) ?? null;
}

async function getParticipants(eventId: number): Promise<ParticipantRow[]> {
  const store = await readStore();
  const participants = store.eventParticipants.filter(
    (participant) => participant.eventId === eventId
  );

  const rows = participants
    .map((participant) => {
      const player = store.players.find((p) => p.id === participant.playerId);
      if (!player) return null;
      return {
        id: participant.id,
        player_id: participant.playerId,
        player_name: player.name,
        points_r1: participant.pointsR1,
        points_r2: participant.pointsR2,
        points_r3: participant.pointsR3
      };
    })
    .filter((row): row is ParticipantRow => Boolean(row));

  rows.sort((a, b) => a.player_name.localeCompare(b.player_name));
  return rows;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/players", async (req, res) => {
  const queryText = String(req.query.query || "").trim();
  const includeArchived = String(req.query.includeArchived || "false") === "true";
  const normalizedQuery = queryText.toLowerCase();

  const store = await readStore();
  const players = store.players
    .filter((player) => includeArchived || !player.isArchived)
    .filter((player) =>
      normalizedQuery === "" ? true : player.name.toLowerCase().includes(normalizedQuery)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json(
    players.map((player) => ({
      id: player.id,
      name: player.name,
      isArchived: player.isArchived
    }))
  );
});

app.post("/api/players", async (req, res) => {
  const parsed = createPlayerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Naam is verplicht." });
  }

  const name = parsed.data.name.trim();
  try {
    const player = await writeStore((store) => {
      const exists = store.players.some(
        (entry) => normalizeName(entry.name) === normalizeName(name)
      );
      if (exists) {
        throw new Error(DUPLICATE_PLAYER);
      }
      const now = nowIso();
      const newPlayer: Player = {
        id: nextId(store, "players"),
        name,
        isArchived: false,
        createdAt: now,
        updatedAt: now
      };
      store.players.push(newPlayer);
      return newPlayer;
    });
    res.status(201).json({ id: player.id, name: player.name });
  } catch (error) {
    if (error instanceof Error && error.message === DUPLICATE_PLAYER) {
      return res.status(400).json({ message: "Spelernaam bestaat al." });
    }
    throw error;
  }
});

app.patch("/api/players/:id", async (req, res) => {
  const parsed = updatePlayerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Ongeldige spelergegevens." });
  }

  const playerId = Number(req.params.id);
  if (Number.isNaN(playerId)) {
    return res.status(400).json({ message: "Ongeldige speler." });
  }

  if (parsed.data.name === undefined && parsed.data.isArchived === undefined) {
    return res.status(400).json({ message: "Geen wijzigingen opgegeven." });
  }

  try {
    await writeStore((store) => {
      const player = store.players.find((entry) => entry.id === playerId);
      if (!player) {
        return false;
      }

      let updated = false;
      if (parsed.data.name !== undefined) {
        const name = parsed.data.name.trim();
        const exists = store.players.some(
          (entry) =>
            entry.id !== playerId && normalizeName(entry.name) === normalizeName(name)
        );
        if (exists) {
          throw new Error(DUPLICATE_PLAYER);
        }
        player.name = name;
        updated = true;
      }
      if (parsed.data.isArchived !== undefined) {
        player.isArchived = parsed.data.isArchived;
        updated = true;
      }

      if (updated) {
        player.updatedAt = nowIso();
      }
      return updated;
    });

    res.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === DUPLICATE_PLAYER) {
      return res.status(400).json({ message: "Spelernaam bestaat al." });
    }
    throw error;
  }
});

app.get("/api/seasons", async (req, res) => {
  const includeArchived = String(req.query.includeArchived || "false") === "true";
  const store = await readStore();
  const seasons = store.seasons
    .filter((season) => includeArchived || !season.isArchived)
    .sort((a, b) => b.id - a.id);

  res.json(
    seasons.map((season) => ({
      id: season.id,
      name: season.name,
      startDate: season.startDate,
      endDate: season.endDate,
      isArchived: season.isArchived
    }))
  );
});

app.post("/api/seasons", async (req, res) => {
  const parsed = createSeasonSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Seizoensnaam is verplicht." });
  }

  const name = parsed.data.name.trim();
  const season = await writeStore((store) => {
    const now = nowIso();
    const newSeason: Season = {
      id: nextId(store, "seasons"),
      name,
      startDate: parsed.data.startDate ?? null,
      endDate: parsed.data.endDate ?? null,
      isArchived: false,
      createdAt: now,
      updatedAt: now
    };
    store.seasons.push(newSeason);
    return newSeason;
  });

  res.status(201).json({ id: season.id });
});

app.patch("/api/seasons/:id", async (req, res) => {
  const parsed = updateSeasonSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Ongeldige seizoensgegevens." });
  }

  const seasonId = Number(req.params.id);
  if (Number.isNaN(seasonId)) {
    return res.status(400).json({ message: "Ongeldig seizoen." });
  }

  if (
    parsed.data.name === undefined &&
    parsed.data.startDate === undefined &&
    parsed.data.endDate === undefined &&
    parsed.data.isArchived === undefined
  ) {
    return res.status(400).json({ message: "Geen wijzigingen opgegeven." });
  }

  await writeStore((store) => {
    const season = store.seasons.find((entry) => entry.id === seasonId);
    if (!season) {
      return false;
    }
    let updated = false;
    if (parsed.data.name !== undefined) {
      season.name = parsed.data.name.trim();
      updated = true;
    }
    if (parsed.data.startDate !== undefined) {
      season.startDate = parsed.data.startDate ?? null;
      updated = true;
    }
    if (parsed.data.endDate !== undefined) {
      season.endDate = parsed.data.endDate ?? null;
      updated = true;
    }
    if (parsed.data.isArchived !== undefined) {
      season.isArchived = parsed.data.isArchived;
      updated = true;
    }
    if (updated) {
      season.updatedAt = nowIso();
    }
    return updated;
  });

  res.json({ ok: true });
});

app.get("/api/events", async (req, res) => {
  const includeArchived = String(req.query.includeArchived || "false") === "true";
  const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;

  const store = await readStore();
  const events = store.events
    .filter((event) => (seasonId === null ? true : event.seasonId === seasonId))
    .filter((event) => includeArchived || !event.isArchived)
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));

  res.json(
    events.map((event) => ({
      id: event.id,
      seasonId: event.seasonId,
      eventDate: event.eventDate,
      title: event.title,
      notes: event.notes,
      status: event.status,
      isArchived: event.isArchived
    }))
  );
});

app.post("/api/events", async (req, res) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Ongeldige kaartavondgegevens." });
  }

  const prizeRanks = [
    parsed.data.prizeRank1 ?? 1,
    parsed.data.prizeRank2 ?? 18,
    parsed.data.prizeRank3 ?? 25
  ];
  const prizeError = validatePrizeRanks(prizeRanks);
  if (prizeError) {
    return res.status(400).json({ message: prizeError });
  }

  try {
    const event = await writeStore((store) => {
      const season = store.seasons.find((entry) => entry.id === parsed.data.seasonId);
      if (!season) {
        throw new Error(SEASON_NOT_FOUND);
      }
      const now = nowIso();
      const newEvent: Event = {
        id: nextId(store, "events"),
        seasonId: parsed.data.seasonId,
        eventDate: parsed.data.eventDate,
        title: parsed.data.title ?? null,
        notes: parsed.data.notes ?? null,
        prizeRank1: prizeRanks[0],
        prizeRank2: prizeRanks[1],
        prizeRank3: prizeRanks[2],
        status: "OPEN",
        lockedAt: null,
        isArchived: false,
        createdAt: now,
        updatedAt: now
      };
      store.events.push(newEvent);
      return newEvent;
    });

    res.status(201).json({ id: event.id });
  } catch (error) {
    if (error instanceof Error && error.message === SEASON_NOT_FOUND) {
      return res.status(404).json({ message: "Seizoen niet gevonden." });
    }
    throw error;
  }
});

app.get("/api/events/:id", async (req, res) => {
  const eventId = Number(req.params.id);
  const event = await getEventById(eventId);
  if (!event) {
    return res.status(404).json({ message: "Kaartavond niet gevonden." });
  }

  const participants = await getParticipants(eventId);
  const prizeRanks = [event.prizeRank1, event.prizeRank2, event.prizeRank3];
  const ranking = computeRanking(participants, prizeRanks);
  const lockCheck = canLockEvent(ranking.participants, ranking.tieErrors);

  res.json({
    id: event.id,
    seasonId: event.seasonId,
    eventDate: event.eventDate,
    title: event.title,
    notes: event.notes,
    prizeRanks,
    status: event.status,
    isArchived: event.isArchived,
    lockedAt: event.lockedAt,
    participants: ranking.participants.map((participant) => ({
      id: participant.id,
      playerId: participant.player_id,
      playerName: participant.player_name,
      pointsR1: participant.points_r1,
      pointsR2: participant.points_r2,
      pointsR3: participant.points_r3,
      totalPoints: participant.total_points,
      rankR1: participant.rank_r1,
      rankR2: participant.rank_r2,
      rankR3: participant.rank_r3
    })),
    roundWinners: ranking.roundWinners,
    eventWinner: ranking.eventWinner,
    tieErrors: ranking.tieErrors,
    canLock: lockCheck.allowed,
    lockReasons: lockCheck.reasons
  });
});

app.patch("/api/events/:id", async (req, res) => {
  const parsed = updateEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Ongeldige kaartavondgegevens." });
  }

  const eventId = Number(req.params.id);
  const event = await getEventById(eventId);
  if (!event) {
    return res.status(404).json({ message: "Kaartavond niet gevonden." });
  }

  if (event.status === "LOCKED") {
    return res.status(400).json({ message: "Kaartavond is vergrendeld." });
  }

  if (
    parsed.data.eventDate === undefined &&
    parsed.data.title === undefined &&
    parsed.data.notes === undefined &&
    parsed.data.isArchived === undefined &&
    parsed.data.prizeRank1 === undefined &&
    parsed.data.prizeRank2 === undefined &&
    parsed.data.prizeRank3 === undefined
  ) {
    return res.status(400).json({ message: "Geen wijzigingen opgegeven." });
  }

  let nextPrizeRanks: number[] | null = null;
  if (
    parsed.data.prizeRank1 !== undefined ||
    parsed.data.prizeRank2 !== undefined ||
    parsed.data.prizeRank3 !== undefined
  ) {
    nextPrizeRanks = [
      parsed.data.prizeRank1 ?? event.prizeRank1,
      parsed.data.prizeRank2 ?? event.prizeRank2,
      parsed.data.prizeRank3 ?? event.prizeRank3
    ];
    const prizeError = validatePrizeRanks(nextPrizeRanks);
    if (prizeError) {
      return res.status(400).json({ message: prizeError });
    }
  }

  await writeStore((store) => {
    const current = store.events.find((entry) => entry.id === eventId);
    if (!current) {
      throw new Error(EVENT_NOT_FOUND);
    }
    const updates: Partial<Event> = {};
    if (parsed.data.eventDate !== undefined) {
      updates.eventDate = parsed.data.eventDate;
    }
    if (parsed.data.title !== undefined) {
      updates.title = parsed.data.title ?? null;
    }
    if (parsed.data.notes !== undefined) {
      updates.notes = parsed.data.notes ?? null;
    }
    if (nextPrizeRanks) {
      updates.prizeRank1 = nextPrizeRanks[0];
      updates.prizeRank2 = nextPrizeRanks[1];
      updates.prizeRank3 = nextPrizeRanks[2];
    }
    if (parsed.data.isArchived !== undefined) {
      updates.isArchived = parsed.data.isArchived;
    }

    Object.assign(current, updates);
    current.updatedAt = nowIso();
    return true;
  });

  res.json({ ok: true });
});

app.post("/api/events/:id/participants", async (req, res) => {
  const parsed = addParticipantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Ongeldige deelnemer." });
  }

  const eventId = Number(req.params.id);
  const event = await getEventById(eventId);
  if (!event) {
    return res.status(404).json({ message: "Kaartavond niet gevonden." });
  }
  if (event.status === "LOCKED") {
    return res.status(400).json({ message: "Kaartavond is vergrendeld." });
  }

  try {
    const participant = await writeStore((store) => {
      const participants = store.eventParticipants.filter(
        (entry) => entry.eventId === eventId
      );
      if (participants.length >= 60) {
        throw new Error("MAX_PARTICIPANTS");
      }
      const player = store.players.find((entry) => entry.id === parsed.data.playerId);
      if (!player) {
        throw new Error(PLAYER_NOT_FOUND);
      }
      if (player.isArchived) {
        throw new Error("ARCHIVED_PLAYER");
      }
      const exists = store.eventParticipants.some(
        (entry) => entry.eventId === eventId && entry.playerId === parsed.data.playerId
      );
      if (exists) {
        throw new Error(DUPLICATE_PARTICIPANT);
      }
      const now = nowIso();
      const newParticipant: EventParticipant = {
        id: nextId(store, "eventParticipants"),
        eventId,
        playerId: parsed.data.playerId,
        pointsR1: null,
        pointsR2: null,
        pointsR3: null,
        createdAt: now,
        updatedAt: now
      };
      store.eventParticipants.push(newParticipant);
      return newParticipant;
    });

    res.status(201).json({ id: participant.id });
  } catch (error) {
    if (error instanceof Error && error.message === "MAX_PARTICIPANTS") {
      return res.status(400).json({ message: "Maximaal 60 deelnemers toegestaan." });
    }
    if (error instanceof Error && error.message === PLAYER_NOT_FOUND) {
      return res.status(404).json({ message: "Speler niet gevonden." });
    }
    if (error instanceof Error && error.message === "ARCHIVED_PLAYER") {
      return res
        .status(400)
        .json({ message: "Gearchiveerde speler kan niet worden toegevoegd." });
    }
    if (error instanceof Error && error.message === DUPLICATE_PARTICIPANT) {
      return res.status(400).json({ message: "Speler is al toegevoegd." });
    }
    throw error;
  }
});

app.patch("/api/events/:eventId/participants/:participantId", async (req, res) => {
  const parsed = updateParticipantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Ongeldige punten." });
  }

  const eventId = Number(req.params.eventId);
  const event = await getEventById(eventId);
  if (!event) {
    return res.status(404).json({ message: "Kaartavond niet gevonden." });
  }
  if (event.status === "LOCKED") {
    return res.status(400).json({ message: "Kaartavond is vergrendeld." });
  }

  const participantId = Number(req.params.participantId);
  if (Number.isNaN(participantId)) {
    return res.status(400).json({ message: "Ongeldige deelnemer." });
  }

  if (
    parsed.data.pointsR1 === undefined &&
    parsed.data.pointsR2 === undefined &&
    parsed.data.pointsR3 === undefined
  ) {
    return res.status(400).json({ message: "Geen wijzigingen opgegeven." });
  }

  await writeStore((store) => {
    const participant = store.eventParticipants.find(
      (entry) => entry.id === participantId
    );
    if (!participant) {
      return false;
    }
    let updated = false;
    if (parsed.data.pointsR1 !== undefined) {
      participant.pointsR1 =
        parsed.data.pointsR1 === null ? null : parsed.data.pointsR1;
      updated = true;
    }
    if (parsed.data.pointsR2 !== undefined) {
      participant.pointsR2 =
        parsed.data.pointsR2 === null ? null : parsed.data.pointsR2;
      updated = true;
    }
    if (parsed.data.pointsR3 !== undefined) {
      participant.pointsR3 =
        parsed.data.pointsR3 === null ? null : parsed.data.pointsR3;
      updated = true;
    }
    if (updated) {
      participant.updatedAt = nowIso();
    }
    return updated;
  });

  res.json({ ok: true });
});

app.post("/api/events/:id/lock", async (req, res) => {
  const eventId = Number(req.params.id);
  const event = await getEventById(eventId);
  if (!event) {
    return res.status(404).json({ message: "Kaartavond niet gevonden." });
  }
  if (event.status === "LOCKED") {
    return res.status(400).json({ message: "Kaartavond is al vergrendeld." });
  }

  const participants = await getParticipants(eventId);
  const prizeRanks = [event.prizeRank1, event.prizeRank2, event.prizeRank3];
  const ranking = computeRanking(participants, prizeRanks);
  const lockCheck = canLockEvent(ranking.participants, ranking.tieErrors);

  if (!lockCheck.allowed) {
    return res.status(400).json({
      message: "Kaartavond kan niet worden vergrendeld.",
      reasons: lockCheck.reasons
    });
  }

  await writeStore((store) => {
    const current = store.events.find((entry) => entry.id === eventId);
    if (!current) {
      throw new Error(EVENT_NOT_FOUND);
    }
    const now = nowIso();
    current.status = "LOCKED";
    current.lockedAt = now;
    current.updatedAt = now;
    store.auditLog.push({
      id: nextId(store, "auditLog"),
      entityType: "event",
      entityId: eventId,
      action: "LOCKED",
      oldValueJson: null,
      newValueJson: null,
      createdAt: now
    });
  });

  res.json({ ok: true });
});

app.post("/api/events/:id/unlock", async (req, res) => {
  const eventId = Number(req.params.id);
  const event = await getEventById(eventId);
  if (!event) {
    return res.status(404).json({ message: "Kaartavond niet gevonden." });
  }
  if (event.status === "OPEN") {
    return res.status(400).json({ message: "Kaartavond is al open." });
  }

  await writeStore((store) => {
    const current = store.events.find((entry) => entry.id === eventId);
    if (!current) {
      throw new Error(EVENT_NOT_FOUND);
    }
    const now = nowIso();
    current.status = "OPEN";
    current.lockedAt = null;
    current.updatedAt = now;
    store.auditLog.push({
      id: nextId(store, "auditLog"),
      entityType: "event",
      entityId: eventId,
      action: "UNLOCKED",
      oldValueJson: null,
      newValueJson: null,
      createdAt: now
    });
  });

  res.json({ ok: true });
});

app.get("/api/seasons/:id/ranking", async (req, res) => {
  const seasonId = Number(req.params.id);
  const store = await readStore();

  const events = store.events.filter((event) => event.seasonId === seasonId);
  const relevant = events.filter((event) => !event.isArchived);
  const openEvents = relevant.filter((event) => event.status !== "LOCKED");
  if (openEvents.length > 0) {
    return res.json({
      available: false,
      message:
        "Het klassement is pas beschikbaar wanneer alle kaartavonden van dit seizoen zijn vergrendeld.",
      openEventIds: openEvents.map((event) => event.id)
    });
  }

  const lockedEventIds = new Set(
    relevant.filter((event) => event.status === "LOCKED").map((event) => event.id)
  );

  const rows = store.eventParticipants
    .filter((participant) => lockedEventIds.has(participant.eventId))
    .filter(
      (participant) =>
        participant.pointsR1 !== null &&
        participant.pointsR2 !== null &&
        participant.pointsR3 !== null
    )
    .map((participant) => {
      const player = store.players.find((entry) => entry.id === participant.playerId);
      if (!player) {
        return null;
      }
      return {
        player_id: participant.playerId,
        player_name: player.name,
        total_points:
          (participant.pointsR1 ?? 0) +
          (participant.pointsR2 ?? 0) +
          (participant.pointsR3 ?? 0)
      };
    })
    .filter((row): row is { player_id: number; player_name: string; total_points: number } =>
      Boolean(row)
    );

  const totals = new Map<
    number,
    { playerId: number; playerName: string; total: number; appearances: number }
  >();
  for (const row of rows) {
    const entry = totals.get(row.player_id) || {
      playerId: row.player_id,
      playerName: row.player_name,
      total: 0,
      appearances: 0
    };
    entry.total += row.total_points;
    entry.appearances += 1;
    totals.set(row.player_id, entry);
  }

  const ranking = Array.from(totals.values()).sort((a, b) => b.total - a.total);
  const seenTotals = new Set<number>();
  const tieWarning = ranking.some((entry) => {
    if (seenTotals.has(entry.total)) return true;
    seenTotals.add(entry.total);
    return false;
  });

  res.json({
    available: true,
    tieWarning,
    ranking: ranking.map((entry, index) => ({
      rank: index + 1,
      playerId: entry.playerId,
      playerName: entry.playerName,
      seasonTotal: entry.total,
      appearances: entry.appearances
    }))
  });
});

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    res.status(500).json({ message: "Interne serverfout.", detail: err.message });
  }
);

app.listen(config.port, () => {
  console.log(`API running on http://localhost:${config.port}`);
});
