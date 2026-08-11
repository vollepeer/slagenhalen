import { insertAuditLog } from "./auditLog";
import { findPlayerByName, getPlayerById, insertPlayer, listPlayers, updatePlayerRow } from "./players";
import { findSeasonById, insertSeason, listSeasons, updateSeasonRow } from "./seasons";

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

  throw new ApiError(404, "Niet gevonden.");
}
