import { canLockEvent, computeRanking, ParticipantRow } from "./ranking";
import {
  EventEntity,
  EventParticipantEntity,
  PlayerEntity,
  SeasonEntity,
  nextId,
  readStore,
  writeStore
} from "./localStore";

const DUPLICATE_PLAYER = "DUPLICATE_PLAYER";
const DUPLICATE_PARTICIPANT = "DUPLICATE_PARTICIPANT";

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

function parsePath(path: string) {
  const [pathname, search = ""] = path.split("?");
  return { pathname, params: new URLSearchParams(search) };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function getEventById(eventId: number) {
  const store = readStore();
  return store.events.find((event) => event.id === eventId) ?? null;
}

function getParticipants(eventId: number): ParticipantRow[] {
  const store = readStore();
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

function buildEventDetail(event: EventEntity) {
  const participants = getParticipants(event.id);
  const prizeRanks = [event.prizeRank1, event.prizeRank2, event.prizeRank3];
  const ranking = computeRanking(participants, prizeRanks);
  const lockCheck = canLockEvent(ranking.participants, ranking.tieErrors);

  return {
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
  };
}

export async function handleGet(path: string) {
  const { pathname, params } = parsePath(path);

  if (pathname === "/api/health") {
    return { ok: true };
  }

  if (pathname === "/api/players") {
    const queryText = (params.get("query") || "").trim();
    const includeArchived = params.get("includeArchived") === "true";
    const normalizedQuery = queryText.toLowerCase();

    const store = readStore();
    const players = store.players
      .filter((player) => includeArchived || !player.isArchived)
      .filter((player) =>
        normalizedQuery === "" ? true : player.name.toLowerCase().includes(normalizedQuery)
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    return players.map((player) => ({
      id: player.id,
      name: player.name,
      isArchived: player.isArchived
    }));
  }

  if (pathname === "/api/seasons") {
    const includeArchived = params.get("includeArchived") === "true";
    const store = readStore();
    const seasons = store.seasons
      .filter((season) => includeArchived || !season.isArchived)
      .sort((a, b) => b.id - a.id);

    return seasons.map((season) => ({
      id: season.id,
      name: season.name,
      startDate: season.startDate,
      endDate: season.endDate,
      isArchived: season.isArchived
    }));
  }

  if (pathname === "/api/events") {
    const includeArchived = params.get("includeArchived") === "true";
    const seasonIdParam = params.get("seasonId");
    const seasonId = seasonIdParam ? Number(seasonIdParam) : null;

    const store = readStore();
    const events = store.events
      .filter((event) => (seasonId === null ? true : event.seasonId === seasonId))
      .filter((event) => includeArchived || !event.isArchived)
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate));

    return events.map((event) => ({
      id: event.id,
      seasonId: event.seasonId,
      eventDate: event.eventDate,
      title: event.title,
      notes: event.notes,
      status: event.status,
      isArchived: event.isArchived
    }));
  }

  const eventMatch = pathname.match(/^\/api\/events\/(\d+)$/);
  if (eventMatch) {
    const eventId = Number(eventMatch[1]);
    const event = getEventById(eventId);
    if (!event) {
      throw new Error("Kaartavond niet gevonden.");
    }
    return buildEventDetail(event);
  }

  const seasonRankingMatch = pathname.match(/^\/api\/seasons\/(\d+)\/ranking$/);
  if (seasonRankingMatch) {
    const seasonId = Number(seasonRankingMatch[1]);
    const store = readStore();

    const events = store.events.filter((event) => event.seasonId === seasonId);
    const relevant = events.filter((event) => !event.isArchived);
    const openEvents = relevant.filter((event) => event.status !== "LOCKED");
    if (openEvents.length > 0) {
      return {
        available: false,
        message:
          "Het klassement is pas beschikbaar wanneer alle kaartavonden van dit seizoen zijn vergrendeld.",
        openEventIds: openEvents.map((event) => event.id)
      };
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
      .filter(
        (row): row is { player_id: number; player_name: string; total_points: number } =>
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

    return {
      available: true,
      tieWarning,
      ranking: ranking.map((entry, index) => ({
        rank: index + 1,
        playerId: entry.playerId,
        playerName: entry.playerName,
        seasonTotal: entry.total,
        appearances: entry.appearances
      }))
    };
  }

  throw new Error("Niet gevonden.");
}

export async function handleSend(path: string, method: string, body?: unknown) {
  const { pathname } = parsePath(path);

  if (pathname === "/api/players" && method === "POST") {
    const payload = body as { name?: unknown };
    if (!isNonEmptyString(payload?.name)) {
      throw new Error("Naam is verplicht.");
    }
    const name = payload.name.trim();

    const player = writeStore((store) => {
      const exists = store.players.some(
        (entry) => normalizeName(entry.name) === normalizeName(name)
      );
      if (exists) {
        throw new Error(DUPLICATE_PLAYER);
      }
      const now = nowIso();
      const newPlayer: PlayerEntity = {
        id: nextId(store, "players"),
        name,
        isArchived: false,
        createdAt: now,
        updatedAt: now
      };
      store.players.push(newPlayer);
      return newPlayer;
    });

    return { id: player.id, name: player.name };
  }

  const playerMatch = pathname.match(/^\/api\/players\/(\d+)$/);
  if (playerMatch && method === "PATCH") {
    const playerId = Number(playerMatch[1]);
    const payload = body as { name?: unknown; isArchived?: unknown };

    if (payload?.name === undefined && payload?.isArchived === undefined) {
      throw new Error("Geen wijzigingen opgegeven.");
    }

    try {
      writeStore((store) => {
        const player = store.players.find((entry) => entry.id === playerId);
        if (!player) {
          throw new Error("Speler niet gevonden.");
        }
        if (payload?.name !== undefined) {
          if (!isNonEmptyString(payload.name)) {
            throw new Error("Ongeldige spelergegevens.");
          }
          const name = payload.name.trim();
          const exists = store.players.some(
            (entry) =>
              entry.id !== playerId && normalizeName(entry.name) === normalizeName(name)
          );
          if (exists) {
            throw new Error(DUPLICATE_PLAYER);
          }
          player.name = name;
        }
        if (payload?.isArchived !== undefined) {
          player.isArchived = Boolean(payload.isArchived);
        }
        player.updatedAt = nowIso();
      });
    } catch (error) {
      if (error instanceof Error && error.message === DUPLICATE_PLAYER) {
        throw new Error("Spelernaam bestaat al.");
      }
      throw error;
    }

    return { ok: true };
  }

  if (pathname === "/api/seasons" && method === "POST") {
    const payload = body as { name?: unknown; startDate?: unknown; endDate?: unknown };
    if (!isNonEmptyString(payload?.name)) {
      throw new Error("Seizoensnaam is verplicht.");
    }
    const name = payload.name.trim();
    const season = writeStore((store) => {
      const now = nowIso();
      const newSeason: SeasonEntity = {
        id: nextId(store, "seasons"),
        name,
        startDate:
          typeof payload.startDate === "string" ? payload.startDate : null,
        endDate: typeof payload.endDate === "string" ? payload.endDate : null,
        isArchived: false,
        createdAt: now,
        updatedAt: now
      };
      store.seasons.push(newSeason);
      return newSeason;
    });

    return { id: season.id };
  }

  const seasonMatch = pathname.match(/^\/api\/seasons\/(\d+)$/);
  if (seasonMatch && method === "PATCH") {
    const seasonId = Number(seasonMatch[1]);
    const payload = body as {
      name?: unknown;
      startDate?: unknown;
      endDate?: unknown;
      isArchived?: unknown;
    };
    if (
      payload?.name === undefined &&
      payload?.startDate === undefined &&
      payload?.endDate === undefined &&
      payload?.isArchived === undefined
    ) {
      throw new Error("Geen wijzigingen opgegeven.");
    }

    writeStore((store) => {
      const season = store.seasons.find((entry) => entry.id === seasonId);
      if (!season) {
        throw new Error("Seizoen niet gevonden.");
      }
      if (payload?.name !== undefined) {
        if (!isNonEmptyString(payload.name)) {
          throw new Error("Ongeldige seizoensgegevens.");
        }
        season.name = payload.name.trim();
      }
      if (payload?.startDate !== undefined) {
        season.startDate =
          typeof payload.startDate === "string" ? payload.startDate : null;
      }
      if (payload?.endDate !== undefined) {
        season.endDate = typeof payload.endDate === "string" ? payload.endDate : null;
      }
      if (payload?.isArchived !== undefined) {
        season.isArchived = Boolean(payload.isArchived);
      }
      season.updatedAt = nowIso();
    });

    return { ok: true };
  }

  if (pathname === "/api/events" && method === "POST") {
    const payload = body as {
      seasonId?: unknown;
      eventDate?: unknown;
      title?: unknown;
      notes?: unknown;
      prizeRank1?: unknown;
      prizeRank2?: unknown;
      prizeRank3?: unknown;
    };

    if (!isNonEmptyString(payload?.eventDate) || !Number.isInteger(payload?.seasonId)) {
      throw new Error("Ongeldige kaartavondgegevens.");
    }

    const prizeRanks = [
      typeof payload.prizeRank1 === "number" ? payload.prizeRank1 : 1,
      typeof payload.prizeRank2 === "number" ? payload.prizeRank2 : 18,
      typeof payload.prizeRank3 === "number" ? payload.prizeRank3 : 25
    ];
    const prizeError = validatePrizeRanks(prizeRanks);
    if (prizeError) {
      throw new Error(prizeError);
    }

    const event = writeStore((store) => {
      const season = store.seasons.find((entry) => entry.id === payload.seasonId);
      if (!season) {
        throw new Error("Seizoen niet gevonden.");
      }
      const now = nowIso();
      const newEvent: EventEntity = {
        id: nextId(store, "events"),
        seasonId: payload.seasonId as number,
        eventDate: payload.eventDate as string,
        title: typeof payload.title === "string" ? payload.title : null,
        notes: typeof payload.notes === "string" ? payload.notes : null,
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

    return { id: event.id };
  }

  const eventMatch = pathname.match(/^\/api\/events\/(\d+)$/);
  if (eventMatch && method === "PATCH") {
    const eventId = Number(eventMatch[1]);
    const payload = body as {
      eventDate?: unknown;
      title?: unknown;
      notes?: unknown;
      isArchived?: unknown;
      prizeRank1?: unknown;
      prizeRank2?: unknown;
      prizeRank3?: unknown;
    };

    const current = getEventById(eventId);
    if (!current) {
      throw new Error("Kaartavond niet gevonden.");
    }
    if (current.status === "LOCKED") {
      throw new Error("Kaartavond is vergrendeld.");
    }
    if (
      payload?.eventDate === undefined &&
      payload?.title === undefined &&
      payload?.notes === undefined &&
      payload?.isArchived === undefined &&
      payload?.prizeRank1 === undefined &&
      payload?.prizeRank2 === undefined &&
      payload?.prizeRank3 === undefined
    ) {
      throw new Error("Geen wijzigingen opgegeven.");
    }

    let nextPrizeRanks: number[] | null = null;
    if (
      payload?.prizeRank1 !== undefined ||
      payload?.prizeRank2 !== undefined ||
      payload?.prizeRank3 !== undefined
    ) {
      nextPrizeRanks = [
        typeof payload.prizeRank1 === "number" ? payload.prizeRank1 : current.prizeRank1,
        typeof payload.prizeRank2 === "number" ? payload.prizeRank2 : current.prizeRank2,
        typeof payload.prizeRank3 === "number" ? payload.prizeRank3 : current.prizeRank3
      ];
      const prizeError = validatePrizeRanks(nextPrizeRanks);
      if (prizeError) {
        throw new Error(prizeError);
      }
    }

    writeStore((store) => {
      const event = store.events.find((entry) => entry.id === eventId);
      if (!event) {
        throw new Error("Kaartavond niet gevonden.");
      }
      if (payload?.eventDate !== undefined) {
        if (!isNonEmptyString(payload.eventDate)) {
          throw new Error("Ongeldige kaartavondgegevens.");
        }
        event.eventDate = payload.eventDate;
      }
      if (payload?.title !== undefined) {
        event.title = typeof payload.title === "string" ? payload.title : null;
      }
      if (payload?.notes !== undefined) {
        event.notes = typeof payload.notes === "string" ? payload.notes : null;
      }
      if (payload?.isArchived !== undefined) {
        event.isArchived = Boolean(payload.isArchived);
      }
      if (nextPrizeRanks) {
        event.prizeRank1 = nextPrizeRanks[0];
        event.prizeRank2 = nextPrizeRanks[1];
        event.prizeRank3 = nextPrizeRanks[2];
      }
      event.updatedAt = nowIso();
    });

    return { ok: true };
  }

  const addParticipantMatch = pathname.match(/^\/api\/events\/(\d+)\/participants$/);
  if (addParticipantMatch && method === "POST") {
    const eventId = Number(addParticipantMatch[1]);
    const payload = body as { playerId?: unknown };
    if (!Number.isInteger(payload?.playerId)) {
      throw new Error("Ongeldige deelnemer.");
    }
    const event = getEventById(eventId);
    if (!event) {
      throw new Error("Kaartavond niet gevonden.");
    }
    if (event.status === "LOCKED") {
      throw new Error("Kaartavond is vergrendeld.");
    }

    const participant = writeStore((store) => {
      const participants = store.eventParticipants.filter(
        (entry) => entry.eventId === eventId
      );
      if (participants.length >= 60) {
        throw new Error("Maximaal 60 deelnemers toegestaan.");
      }
      const player = store.players.find((entry) => entry.id === payload.playerId);
      if (!player) {
        throw new Error("Speler niet gevonden.");
      }
      if (player.isArchived) {
        throw new Error("Gearchiveerde speler kan niet worden toegevoegd.");
      }
      const exists = store.eventParticipants.some(
        (entry) => entry.eventId === eventId && entry.playerId === payload.playerId
      );
      if (exists) {
        throw new Error(DUPLICATE_PARTICIPANT);
      }
      const now = nowIso();
      const newParticipant: EventParticipantEntity = {
        id: nextId(store, "eventParticipants"),
        eventId,
        playerId: payload.playerId as number,
        pointsR1: null,
        pointsR2: null,
        pointsR3: null,
        createdAt: now,
        updatedAt: now
      };
      store.eventParticipants.push(newParticipant);
      return newParticipant;
    });

    return { id: participant.id };
  }

  const updateParticipantMatch = pathname.match(
    /^\/api\/events\/(\d+)\/participants\/(\d+)$/
  );
  if (updateParticipantMatch && method === "PATCH") {
    const eventId = Number(updateParticipantMatch[1]);
    const participantId = Number(updateParticipantMatch[2]);
    const payload = body as { pointsR1?: unknown; pointsR2?: unknown; pointsR3?: unknown };

    const event = getEventById(eventId);
    if (!event) {
      throw new Error("Kaartavond niet gevonden.");
    }
    if (event.status === "LOCKED") {
      throw new Error("Kaartavond is vergrendeld.");
    }

    if (
      payload?.pointsR1 === undefined &&
      payload?.pointsR2 === undefined &&
      payload?.pointsR3 === undefined
    ) {
      throw new Error("Geen wijzigingen opgegeven.");
    }

    writeStore((store) => {
      const participant = store.eventParticipants.find(
        (entry) => entry.id === participantId
      );
      if (!participant) {
        throw new Error("Deelnemer niet gevonden.");
      }
      if (payload?.pointsR1 !== undefined) {
        if (payload.pointsR1 !== null && !isNonNegativeInteger(payload.pointsR1)) {
          throw new Error("Ongeldige punten.");
        }
        participant.pointsR1 = payload.pointsR1 === null ? null : payload.pointsR1;
      }
      if (payload?.pointsR2 !== undefined) {
        if (payload.pointsR2 !== null && !isNonNegativeInteger(payload.pointsR2)) {
          throw new Error("Ongeldige punten.");
        }
        participant.pointsR2 = payload.pointsR2 === null ? null : payload.pointsR2;
      }
      if (payload?.pointsR3 !== undefined) {
        if (payload.pointsR3 !== null && !isNonNegativeInteger(payload.pointsR3)) {
          throw new Error("Ongeldige punten.");
        }
        participant.pointsR3 = payload.pointsR3 === null ? null : payload.pointsR3;
      }
      participant.updatedAt = nowIso();
    });

    return { ok: true };
  }

  const lockMatch = pathname.match(/^\/api\/events\/(\d+)\/lock$/);
  if (lockMatch && method === "POST") {
    const eventId = Number(lockMatch[1]);
    const event = getEventById(eventId);
    if (!event) {
      throw new Error("Kaartavond niet gevonden.");
    }
    if (event.status === "LOCKED") {
      throw new Error("Kaartavond is al vergrendeld.");
    }

    const participants = getParticipants(eventId);
    const prizeRanks = [event.prizeRank1, event.prizeRank2, event.prizeRank3];
    const ranking = computeRanking(participants, prizeRanks);
    const lockCheck = canLockEvent(ranking.participants, ranking.tieErrors);

    if (!lockCheck.allowed) {
      throw new Error("Kaartavond kan niet worden vergrendeld.");
    }

    writeStore((store) => {
      const current = store.events.find((entry) => entry.id === eventId);
      if (!current) {
        throw new Error("Kaartavond niet gevonden.");
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

    return { ok: true };
  }

  const unlockMatch = pathname.match(/^\/api\/events\/(\d+)\/unlock$/);
  if (unlockMatch && method === "POST") {
    const eventId = Number(unlockMatch[1]);
    const event = getEventById(eventId);
    if (!event) {
      throw new Error("Kaartavond niet gevonden.");
    }
    if (event.status === "OPEN") {
      throw new Error("Kaartavond is al open.");
    }

    writeStore((store) => {
      const current = store.events.find((entry) => entry.id === eventId);
      if (!current) {
        throw new Error("Kaartavond niet gevonden.");
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

    return { ok: true };
  }

  throw new Error("Niet gevonden.");
}
