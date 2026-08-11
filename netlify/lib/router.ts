import { insertAuditLog } from "./auditLog";
import { findPlayerByName, getPlayerById, insertPlayer, listPlayers, updatePlayerRow } from "./players";
import { findSeasonById, insertSeason, listSeasons, updateSeasonRow } from "./seasons";
import { canLockEvent, computeRanking } from "./ranking";
import {
  countParticipants,
  deleteParticipantRow,
  findParticipant,
  getEventRowById,
  getParticipants,
  insertEvent,
  insertParticipant,
  listEvents,
  listEventRowsForSeason,
  updateEventRow,
  updateParticipantRow
} from "./events";
import type { EventRow } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type RequestContext = { userId: string; userEmail: string };
export type ApiResult = { status: number; body: unknown };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function handleApiRequest(
  method: string,
  pathname: string,
  params: URLSearchParams,
  body: unknown,
  ctx: RequestContext
): Promise<ApiResult> {
  try {
    return await dispatch(method, pathname, params, body, ctx);
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: error.status, body: { message: error.message } };
    }
    console.error("Onverwachte fout in API:", error);
    return { status: 500, body: { message: "Interne serverfout." } };
  }
}

async function dispatch(
  method: string,
  pathname: string,
  params: URLSearchParams,
  body: unknown,
  ctx: RequestContext
): Promise<ApiResult> {
  if (method === "GET" && pathname === "/api/players") {
    const players = await listPlayers(params.get("query") || "", params.get("includeArchived") === "true");
    return { status: 200, body: players };
  }

  if (method === "POST" && pathname === "/api/players") {
    const payload = body as { name?: unknown };
    if (!isNonEmptyString(payload?.name)) throw new ApiError(400, "Naam is verplicht.");
    const name = payload.name.trim();
    if (await findPlayerByName(name)) throw new ApiError(400, "Spelernaam bestaat al.");
    const player = await insertPlayer(name);
    await insertAuditLog({ entityType: "player", entityId: player.id, action: "CREATED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 201, body: { id: player.id, name: player.name } };
  }

  const playerMatch = pathname.match(/^\/api\/players\/(\d+)$/);
  if (method === "PATCH" && playerMatch) {
    const playerId = Number(playerMatch[1]);
    const payload = body as { name?: unknown; isArchived?: unknown };
    if (payload?.name === undefined && payload?.isArchived === undefined) {
      throw new ApiError(400, "Geen wijzigingen opgegeven.");
    }
    const player = await getPlayerById(playerId);
    if (!player) throw new ApiError(404, "Speler niet gevonden.");

    const updates: Partial<{ name: string; is_archived: boolean }> = {};
    if (payload?.name !== undefined) {
      if (!isNonEmptyString(payload.name)) throw new ApiError(400, "Ongeldige spelergegevens.");
      const name = payload.name.trim();
      if (await findPlayerByName(name, playerId)) throw new ApiError(400, "Spelernaam bestaat al.");
      updates.name = name;
    }
    if (payload?.isArchived !== undefined) {
      updates.is_archived = Boolean(payload.isArchived);
    }
    await updatePlayerRow(playerId, updates);
    await insertAuditLog({ entityType: "player", entityId: playerId, action: "UPDATED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 200, body: { ok: true } };
  }

  if (method === "GET" && pathname === "/api/seasons") {
    const seasons = await listSeasons(params.get("includeArchived") === "true");
    return { status: 200, body: seasons };
  }

  if (method === "POST" && pathname === "/api/seasons") {
    const payload = body as { name?: unknown; topScoresCount?: unknown; startDate?: unknown; endDate?: unknown };
    if (!isNonEmptyString(payload?.name)) throw new ApiError(400, "Seizoensnaam is verplicht.");
    const topScoresCount =
      typeof payload.topScoresCount === "number" && Number.isInteger(payload.topScoresCount)
        ? payload.topScoresCount
        : 7;
    if (topScoresCount < 1) throw new ApiError(400, "Aantal beste scores moet minimaal 1 zijn.");
    const season = await insertSeason({
      name: payload.name.trim(),
      topScoresCount,
      startDate: typeof payload.startDate === "string" ? payload.startDate : null,
      endDate: typeof payload.endDate === "string" ? payload.endDate : null
    });
    await insertAuditLog({ entityType: "season", entityId: season.id, action: "CREATED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 201, body: { id: season.id } };
  }

  const seasonMatch = pathname.match(/^\/api\/seasons\/(\d+)$/);
  if (method === "PATCH" && seasonMatch) {
    const seasonId = Number(seasonMatch[1]);
    const payload = body as {
      name?: unknown;
      topScoresCount?: unknown;
      startDate?: unknown;
      endDate?: unknown;
      isArchived?: unknown;
    };
    if (
      payload?.name === undefined &&
      payload?.topScoresCount === undefined &&
      payload?.startDate === undefined &&
      payload?.endDate === undefined &&
      payload?.isArchived === undefined
    ) {
      throw new ApiError(400, "Geen wijzigingen opgegeven.");
    }
    if (!(await findSeasonById(seasonId))) throw new ApiError(404, "Seizoen niet gevonden.");

    const updates: Partial<{
      name: string;
      top_scores_count: number;
      start_date: string | null;
      end_date: string | null;
      is_archived: boolean;
    }> = {};
    if (payload?.name !== undefined) {
      if (!isNonEmptyString(payload.name)) throw new ApiError(400, "Ongeldige seizoensgegevens.");
      updates.name = payload.name.trim();
    }
    if (payload?.topScoresCount !== undefined) {
      if (typeof payload.topScoresCount !== "number" || !Number.isInteger(payload.topScoresCount) || payload.topScoresCount < 1) {
        throw new ApiError(400, "Ongeldige seizoensgegevens.");
      }
      updates.top_scores_count = payload.topScoresCount;
    }
    if (payload?.startDate !== undefined) {
      updates.start_date = typeof payload.startDate === "string" ? payload.startDate : null;
    }
    if (payload?.endDate !== undefined) {
      updates.end_date = typeof payload.endDate === "string" ? payload.endDate : null;
    }
    if (payload?.isArchived !== undefined) {
      updates.is_archived = Boolean(payload.isArchived);
    }
    await updateSeasonRow(seasonId, updates);
    await insertAuditLog({ entityType: "season", entityId: seasonId, action: "UPDATED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 200, body: { ok: true } };
  }

  if (method === "POST" && pathname === "/api/events") {
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
      throw new ApiError(400, "Ongeldige kaartavondgegevens.");
    }
    const prizeRanks: [number, number, number] = [
      typeof payload.prizeRank1 === "number" ? payload.prizeRank1 : 1,
      typeof payload.prizeRank2 === "number" ? payload.prizeRank2 : 18,
      typeof payload.prizeRank3 === "number" ? payload.prizeRank3 : 25
    ];
    const prizeError = validatePrizeRanks(prizeRanks);
    if (prizeError) throw new ApiError(400, prizeError);

    if (!(await findSeasonById(payload.seasonId as number))) throw new ApiError(404, "Seizoen niet gevonden.");

    const event = await insertEvent({
      seasonId: payload.seasonId as number,
      eventDate: payload.eventDate as string,
      title: typeof payload.title === "string" ? payload.title : null,
      notes: typeof payload.notes === "string" ? payload.notes : null,
      prizeRanks
    });
    await insertAuditLog({ entityType: "event", entityId: event.id, action: "CREATED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 201, body: { id: event.id } };
  }

  if (method === "GET" && pathname === "/api/events") {
    const seasonIdParam = params.get("seasonId");
    const events = await listEvents(seasonIdParam ? Number(seasonIdParam) : null, params.get("includeArchived") === "true");
    return { status: 200, body: events };
  }

  const eventDetailMatch = pathname.match(/^\/api\/events\/(\d+)$/);
  if (method === "GET" && eventDetailMatch) {
    const event = await getEventRowById(Number(eventDetailMatch[1]));
    if (!event) throw new ApiError(404, "Kaartavond niet gevonden.");
    return { status: 200, body: await buildEventDetail(event) };
  }

  if (method === "PATCH" && eventDetailMatch) {
    const eventId = Number(eventDetailMatch[1]);
    const event = await getEventRowById(eventId);
    if (!event) throw new ApiError(404, "Kaartavond niet gevonden.");
    if (event.status === "LOCKED") throw new ApiError(400, "Kaartavond is vergrendeld.");

    const payload = body as {
      eventDate?: unknown;
      title?: unknown;
      notes?: unknown;
      isArchived?: unknown;
      prizeRank1?: unknown;
      prizeRank2?: unknown;
      prizeRank3?: unknown;
    };
    if (
      payload?.eventDate === undefined &&
      payload?.title === undefined &&
      payload?.notes === undefined &&
      payload?.isArchived === undefined &&
      payload?.prizeRank1 === undefined &&
      payload?.prizeRank2 === undefined &&
      payload?.prizeRank3 === undefined
    ) {
      throw new ApiError(400, "Geen wijzigingen opgegeven.");
    }

    const updates: Partial<{
      event_date: string;
      title: string | null;
      notes: string | null;
      is_archived: boolean;
      prize_rank_1: number;
      prize_rank_2: number;
      prize_rank_3: number;
    }> = {};

    if (payload?.eventDate !== undefined) {
      if (!isNonEmptyString(payload.eventDate)) throw new ApiError(400, "Ongeldige kaartavondgegevens.");
      updates.event_date = payload.eventDate;
    }
    if (payload?.title !== undefined) updates.title = typeof payload.title === "string" ? payload.title : null;
    if (payload?.notes !== undefined) updates.notes = typeof payload.notes === "string" ? payload.notes : null;
    if (payload?.isArchived !== undefined) updates.is_archived = Boolean(payload.isArchived);

    if (payload?.prizeRank1 !== undefined || payload?.prizeRank2 !== undefined || payload?.prizeRank3 !== undefined) {
      const nextPrizeRanks = [
        typeof payload.prizeRank1 === "number" ? payload.prizeRank1 : event.prize_rank_1,
        typeof payload.prizeRank2 === "number" ? payload.prizeRank2 : event.prize_rank_2,
        typeof payload.prizeRank3 === "number" ? payload.prizeRank3 : event.prize_rank_3
      ];
      const prizeError = validatePrizeRanks(nextPrizeRanks);
      if (prizeError) throw new ApiError(400, prizeError);
      updates.prize_rank_1 = nextPrizeRanks[0];
      updates.prize_rank_2 = nextPrizeRanks[1];
      updates.prize_rank_3 = nextPrizeRanks[2];
    }

    await updateEventRow(eventId, updates);
    await insertAuditLog({ entityType: "event", entityId: eventId, action: "UPDATED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 200, body: { ok: true } };
  }

  const addParticipantMatch = pathname.match(/^\/api\/events\/(\d+)\/participants$/);
  if (method === "POST" && addParticipantMatch) {
    const eventId = Number(addParticipantMatch[1]);
    const payload = body as { playerId?: unknown };
    if (!Number.isInteger(payload?.playerId)) throw new ApiError(400, "Ongeldige deelnemer.");

    const event = await getEventRowById(eventId);
    if (!event) throw new ApiError(404, "Kaartavond niet gevonden.");
    if (event.status === "LOCKED") throw new ApiError(400, "Kaartavond is vergrendeld.");

    if ((await countParticipants(eventId)) >= 60) throw new ApiError(400, "Maximaal 60 deelnemers toegestaan.");

    const player = await getPlayerById(payload.playerId as number);
    if (!player) throw new ApiError(404, "Speler niet gevonden.");
    if (player.is_archived) throw new ApiError(400, "Gearchiveerde speler kan niet worden toegevoegd.");

    if (await findParticipant(eventId, payload.playerId as number)) throw new ApiError(400, "Speler is al toegevoegd.");

    const participant = await insertParticipant(eventId, payload.playerId as number);
    await insertAuditLog({ entityType: "participant", entityId: participant.id, action: "CREATED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 201, body: { id: participant.id } };
  }

  const participantMatch = pathname.match(/^\/api\/events\/(\d+)\/participants\/(\d+)$/);
  if (method === "PATCH" && participantMatch) {
    const eventId = Number(participantMatch[1]);
    const participantId = Number(participantMatch[2]);
    const event = await getEventRowById(eventId);
    if (!event) throw new ApiError(404, "Kaartavond niet gevonden.");
    if (event.status === "LOCKED") throw new ApiError(400, "Kaartavond is vergrendeld.");

    const payload = body as Record<string, unknown>;
    if (payload?.pointsR1 === undefined && payload?.pointsR2 === undefined && payload?.pointsR3 === undefined) {
      throw new ApiError(400, "Geen wijzigingen opgegeven.");
    }

    const updates: Partial<{ points_r1: number | null; points_r2: number | null; points_r3: number | null }> = {};
    for (const [key, dbKey] of [
      ["pointsR1", "points_r1"],
      ["pointsR2", "points_r2"],
      ["pointsR3", "points_r3"]
    ] as const) {
      const value = payload[key];
      if (value === undefined) continue;
      if (value !== null && !(typeof value === "number" && Number.isInteger(value) && value >= 0)) {
        throw new ApiError(400, "Ongeldige punten.");
      }
      updates[dbKey] = value === null ? null : value;
    }

    await updateParticipantRow(participantId, updates);
    await insertAuditLog({ entityType: "participant", entityId: participantId, action: "UPDATED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 200, body: { ok: true } };
  }

  if (method === "DELETE" && participantMatch) {
    const eventId = Number(participantMatch[1]);
    const participantId = Number(participantMatch[2]);
    const event = await getEventRowById(eventId);
    if (!event) throw new ApiError(404, "Kaartavond niet gevonden.");
    if (event.status === "LOCKED") throw new ApiError(400, "Kaartavond is vergrendeld.");

    if ((await deleteParticipantRow(eventId, participantId)) === 0) throw new ApiError(404, "Deelnemer niet gevonden.");
    await insertAuditLog({ entityType: "participant", entityId: participantId, action: "DELETED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 200, body: { ok: true } };
  }

  const lockMatch = pathname.match(/^\/api\/events\/(\d+)\/lock$/);
  if (method === "POST" && lockMatch) {
    const eventId = Number(lockMatch[1]);
    const event = await getEventRowById(eventId);
    if (!event) throw new ApiError(404, "Kaartavond niet gevonden.");
    if (event.status === "LOCKED") throw new ApiError(400, "Kaartavond is al vergrendeld.");

    const participants = await getParticipants(eventId);
    const prizeRanks = [event.prize_rank_1, event.prize_rank_2, event.prize_rank_3];
    const ranking = computeRanking(participants, prizeRanks);
    const lockCheck = canLockEvent(ranking.participants, ranking.tieErrors);
    if (!lockCheck.allowed) throw new ApiError(400, "Kaartavond kan niet worden vergrendeld.");

    await updateEventRow(eventId, { status: "LOCKED", locked_at: new Date().toISOString() });
    await insertAuditLog({ entityType: "event", entityId: eventId, action: "LOCKED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 200, body: { ok: true } };
  }

  const unlockMatch = pathname.match(/^\/api\/events\/(\d+)\/unlock$/);
  if (method === "POST" && unlockMatch) {
    const eventId = Number(unlockMatch[1]);
    const event = await getEventRowById(eventId);
    if (!event) throw new ApiError(404, "Kaartavond niet gevonden.");
    if (event.status === "OPEN") throw new ApiError(400, "Kaartavond is al open.");

    await updateEventRow(eventId, { status: "OPEN", locked_at: null });
    await insertAuditLog({ entityType: "event", entityId: eventId, action: "UNLOCKED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 200, body: { ok: true } };
  }

  const seasonRankingMatch = pathname.match(/^\/api\/seasons\/(\d+)\/ranking$/);
  if (method === "GET" && seasonRankingMatch) {
    return { status: 200, body: await getSeasonRanking(Number(seasonRankingMatch[1])) };
  }

  throw new ApiError(404, "Niet gevonden.");
}

function validatePrizeRanks(prizeRanks: number[]): string | null {
  const unique = new Set(prizeRanks);
  return unique.size !== prizeRanks.length ? "Prijsrangen moeten uniek zijn." : null;
}

async function buildEventDetail(event: EventRow) {
  const participants = await getParticipants(event.id);
  const prizeRanks = [event.prize_rank_1, event.prize_rank_2, event.prize_rank_3];
  const ranking = computeRanking(participants, prizeRanks);
  const lockCheck = canLockEvent(ranking.participants, ranking.tieErrors);

  return {
    id: event.id,
    seasonId: event.season_id,
    eventDate: event.event_date,
    title: event.title,
    notes: event.notes,
    prizeRanks,
    status: event.status,
    isArchived: event.is_archived,
    lockedAt: event.locked_at,
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
    eventWinners: ranking.eventWinners,
    eventWinner: ranking.eventWinner,
    tieErrors: ranking.tieErrors,
    canLock: lockCheck.allowed,
    lockReasons: lockCheck.reasons
  };
}

async function getSeasonRanking(seasonId: number) {
  const season = await findSeasonById(seasonId);
  const topScoresCount = season?.top_scores_count ?? 7;
  const events = await listEventRowsForSeason(seasonId);
  const relevant = events.filter((event) => !event.is_archived);
  const today = new Date().toISOString().slice(0, 10);
  const blockingOpenEvents = relevant.filter((event) => event.status !== "LOCKED" && event.event_date <= today);
  if (blockingOpenEvents.length > 0) {
    return {
      available: false,
      message: "Het klassement is pas beschikbaar wanneer alle kaartavonden tot en met vandaag zijn vergrendeld.",
      openEventIds: blockingOpenEvents.map((event) => event.id)
    };
  }

  const lockedEvents = relevant.filter((event) => event.status === "LOCKED");
  const totals = new Map<number, { playerId: number; playerName: string; scores: number[] }>();

  for (const event of lockedEvents) {
    const participants = await getParticipants(event.id);
    for (const participant of participants) {
      if (participant.points_r1 === null || participant.points_r2 === null || participant.points_r3 === null) continue;
      const total = participant.points_r1 + participant.points_r2 + participant.points_r3;
      const entry = totals.get(participant.player_id) || {
        playerId: participant.player_id,
        playerName: participant.player_name,
        scores: []
      };
      entry.scores.push(total);
      totals.set(participant.player_id, entry);
    }
  }

  const ranking = Array.from(totals.values())
    .map((entry) => {
      const sortedScores = [...entry.scores].sort((a, b) => b - a);
      const usedScores = sortedScores.slice(0, topScoresCount);
      return {
        playerId: entry.playerId,
        playerName: entry.playerName,
        total: usedScores.reduce((sum, score) => sum + score, 0),
        appearances: usedScores.length
      };
    })
    .sort((a, b) => b.total - a.total);

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
