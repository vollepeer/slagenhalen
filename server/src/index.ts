import express from "express";
import cors from "cors";
import { pool, exec, query } from "./db.js";
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

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/players", async (req, res) => {
  const queryText = String(req.query.query || "");
  const includeArchived = String(req.query.includeArchived || "false") === "true";

  const rows = await query<
    Array<{ id: number; name: string; is_archived: 0 | 1 }>
  >(
    `SELECT id, name, is_archived
     FROM players
     WHERE (? = '' OR name LIKE ?)
       AND (? = true OR is_archived = false)
     ORDER BY name ASC`,
    [queryText, `%${queryText}%`, includeArchived]
  );

  res.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      isArchived: Boolean(row.is_archived)
    }))
  );
});

app.post("/api/players", async (req, res) => {
  const parsed = createPlayerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Naam is verplicht." });
  }

  try {
    const result = await exec("INSERT INTO players (name) VALUES (?)", [
      parsed.data.name.trim()
    ]);
    res.status(201).json({ id: result.insertId, name: parsed.data.name.trim() });
  } catch (error) {
    res.status(400).json({ message: "Spelernaam bestaat al." });
  }
});

app.patch("/api/players/:id", async (req, res) => {
  const parsed = updatePlayerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Ongeldige spelergegevens." });
  }

  const updates: string[] = [];
  const params: Array<string | number | boolean> = [];
  if (parsed.data.name !== undefined) {
    updates.push("name = ?");
    params.push(parsed.data.name.trim());
  }
  if (parsed.data.isArchived !== undefined) {
    updates.push("is_archived = ?");
    params.push(parsed.data.isArchived);
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: "Geen wijzigingen opgegeven." });
  }

  params.push(Number(req.params.id));
  await exec(`UPDATE players SET ${updates.join(", ")} WHERE id = ?`, params);
  res.json({ ok: true });
});

app.get("/api/seasons", async (req, res) => {
  const includeArchived = String(req.query.includeArchived || "false") === "true";
  const rows = await query<
    Array<{
      id: number;
      name: string;
      start_date: string | null;
      end_date: string | null;
      is_archived: 0 | 1;
    }>
  >(
    `SELECT id, name, start_date, end_date, is_archived
     FROM seasons
     WHERE (? = true OR is_archived = false)
     ORDER BY id DESC`,
    [includeArchived]
  );

  res.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      isArchived: Boolean(row.is_archived)
    }))
  );
});

app.post("/api/seasons", async (req, res) => {
  const parsed = createSeasonSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Seizoensnaam is verplicht." });
  }

  const result = await exec(
    "INSERT INTO seasons (name, start_date, end_date) VALUES (?, ?, ?)",
    [parsed.data.name.trim(), parsed.data.startDate ?? null, parsed.data.endDate ?? null]
  );

  res.status(201).json({ id: result.insertId });
});

app.patch("/api/seasons/:id", async (req, res) => {
  const parsed = updateSeasonSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Ongeldige seizoensgegevens." });
  }

  const updates: string[] = [];
  const params: Array<string | number | boolean | null> = [];
  if (parsed.data.name !== undefined) {
    updates.push("name = ?");
    params.push(parsed.data.name.trim());
  }
  if (parsed.data.startDate !== undefined) {
    updates.push("start_date = ?");
    params.push(parsed.data.startDate ?? null);
  }
  if (parsed.data.endDate !== undefined) {
    updates.push("end_date = ?");
    params.push(parsed.data.endDate ?? null);
  }
  if (parsed.data.isArchived !== undefined) {
    updates.push("is_archived = ?");
    params.push(parsed.data.isArchived);
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: "Geen wijzigingen opgegeven." });
  }

  params.push(Number(req.params.id));
  await exec(`UPDATE seasons SET ${updates.join(", ")} WHERE id = ?`, params);
  res.json({ ok: true });
});

app.get("/api/events", async (req, res) => {
  const includeArchived = String(req.query.includeArchived || "false") === "true";
  const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;
  const rows = await query<
    Array<{
      id: number;
      season_id: number;
      event_date: string;
      title: string | null;
      notes: string | null;
      status: "OPEN" | "LOCKED";
      is_archived: 0 | 1;
    }>
  >(
    `SELECT id, season_id, event_date, title, notes, status, is_archived
     FROM events
     WHERE (? IS NULL OR season_id = ?)
       AND (? = true OR is_archived = false)
     ORDER BY event_date DESC`,
    [seasonId, seasonId, includeArchived]
  );

  res.json(
    rows.map((row) => ({
      id: row.id,
      seasonId: row.season_id,
      eventDate: row.event_date,
      title: row.title,
      notes: row.notes,
      status: row.status,
      isArchived: Boolean(row.is_archived)
    }))
  );
});

app.post("/api/events", async (req, res) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Ongeldige kaartavondgegevens." });
  }

  const result = await exec(
    "INSERT INTO events (season_id, event_date, title, notes) VALUES (?, ?, ?, ?)",
    [
      parsed.data.seasonId,
      parsed.data.eventDate,
      parsed.data.title ?? null,
      parsed.data.notes ?? null
    ]
  );

  res.status(201).json({ id: result.insertId });
});

async function getEventById(eventId: number) {
  const events = await query<
    Array<{
      id: number;
      season_id: number;
      event_date: string;
      title: string | null;
      notes: string | null;
      status: "OPEN" | "LOCKED";
      is_archived: 0 | 1;
      locked_at: string | null;
    }>
  >(
    `SELECT id, season_id, event_date, title, notes, status, is_archived, locked_at
     FROM events
     WHERE id = ?`,
    [eventId]
  );
  return events[0];
}

async function getParticipants(eventId: number) {
  return query<ParticipantRow[]>(
    `SELECT ep.id, ep.player_id, p.name as player_name,
            ep.points_r1, ep.points_r2, ep.points_r3
     FROM event_participants ep
     JOIN players p ON p.id = ep.player_id
     WHERE ep.event_id = ?
     ORDER BY p.name ASC`,
    [eventId]
  );
}

app.get("/api/events/:id", async (req, res) => {
  const eventId = Number(req.params.id);
  const event = await getEventById(eventId);
  if (!event) {
    return res.status(404).json({ message: "Kaartavond niet gevonden." });
  }

  const participants = await getParticipants(eventId);
  const ranking = computeRanking(participants);
  const lockCheck = canLockEvent(ranking.participants, ranking.tieErrors);

  res.json({
    id: event.id,
    seasonId: event.season_id,
    eventDate: event.event_date,
    title: event.title,
    notes: event.notes,
    status: event.status,
    isArchived: Boolean(event.is_archived),
    lockedAt: event.locked_at,
    participants: ranking.participants.map((p) => ({
      id: p.id,
      playerId: p.player_id,
      playerName: p.player_name,
      pointsR1: p.points_r1,
      pointsR2: p.points_r2,
      pointsR3: p.points_r3,
      totalPoints: p.total_points,
      rankR1: p.rank_r1,
      rankR2: p.rank_r2,
      rankR3: p.rank_r3
    })),
    winners: ranking.winners,
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

  const updates: string[] = [];
  const params: Array<string | number | boolean | null> = [];
  if (parsed.data.eventDate !== undefined) {
    updates.push("event_date = ?");
    params.push(parsed.data.eventDate);
  }
  if (parsed.data.title !== undefined) {
    updates.push("title = ?");
    params.push(parsed.data.title ?? null);
  }
  if (parsed.data.notes !== undefined) {
    updates.push("notes = ?");
    params.push(parsed.data.notes ?? null);
  }
  if (parsed.data.isArchived !== undefined) {
    updates.push("is_archived = ?");
    params.push(parsed.data.isArchived);
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: "Geen wijzigingen opgegeven." });
  }

  params.push(eventId);
  await exec(`UPDATE events SET ${updates.join(", ")} WHERE id = ?`, params);
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

  const countRows = await query<Array<{ count: number }>>(
    "SELECT COUNT(*) as count FROM event_participants WHERE event_id = ?",
    [eventId]
  );
  if (countRows[0].count >= 60) {
    return res.status(400).json({ message: "Maximaal 60 deelnemers toegestaan." });
  }

  const playerRows = await query<
    Array<{ id: number; is_archived: 0 | 1 }>
  >("SELECT id, is_archived FROM players WHERE id = ?", [parsed.data.playerId]);
  if (!playerRows[0]) {
    return res.status(404).json({ message: "Speler niet gevonden." });
  }
  if (playerRows[0].is_archived) {
    return res.status(400).json({ message: "Gearchiveerde speler kan niet worden toegevoegd." });
  }

  try {
    const result = await exec(
      "INSERT INTO event_participants (event_id, player_id) VALUES (?, ?)",
      [eventId, parsed.data.playerId]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    res.status(400).json({ message: "Speler is al toegevoegd." });
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

  const updates: string[] = [];
  const params: Array<number | null> = [];
  if (parsed.data.pointsR1 !== undefined) {
    updates.push("points_r1 = ?");
    params.push(parsed.data.pointsR1 === null ? null : parsed.data.pointsR1);
  }
  if (parsed.data.pointsR2 !== undefined) {
    updates.push("points_r2 = ?");
    params.push(parsed.data.pointsR2 === null ? null : parsed.data.pointsR2);
  }
  if (parsed.data.pointsR3 !== undefined) {
    updates.push("points_r3 = ?");
    params.push(parsed.data.pointsR3 === null ? null : parsed.data.pointsR3);
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: "Geen wijzigingen opgegeven." });
  }

  params.push(Number(req.params.participantId));
  await exec(
    `UPDATE event_participants SET ${updates.join(", ")} WHERE id = ?`,
    params
  );

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
  const ranking = computeRanking(participants);
  const lockCheck = canLockEvent(ranking.participants, ranking.tieErrors);

  if (!lockCheck.allowed) {
    return res.status(400).json({
      message: "Kaartavond kan niet worden vergrendeld.",
      reasons: lockCheck.reasons
    });
  }

  await exec(
    "UPDATE events SET status = 'LOCKED', locked_at = NOW() WHERE id = ?",
    [eventId]
  );

  await exec(
    "INSERT INTO audit_log (entity_type, entity_id, action) VALUES ('event', ?, 'LOCKED')",
    [eventId]
  );

  res.json({ ok: true });
});

app.get("/api/seasons/:id/ranking", async (req, res) => {
  const seasonId = Number(req.params.id);
  const events = await query<
    Array<{ id: number; status: "OPEN" | "LOCKED"; is_archived: 0 | 1 }>
  >(
    "SELECT id, status, is_archived FROM events WHERE season_id = ?",
    [seasonId]
  );

  const relevant = events.filter((event) => !event.is_archived);
  const openEvents = relevant.filter((event) => event.status !== "LOCKED");
  if (openEvents.length > 0) {
    return res.json({
      available: false,
      message:
        "Het klassement is pas beschikbaar wanneer alle kaartavonden van dit seizoen zijn vergrendeld.",
      openEventIds: openEvents.map((event) => event.id)
    });
  }

  const rows = await query<
    Array<{ player_id: number; player_name: string; total_points: number }>
  >(
    `SELECT ep.player_id, p.name as player_name,
            (ep.points_r1 + ep.points_r2 + ep.points_r3) as total_points
     FROM event_participants ep
     JOIN events e ON e.id = ep.event_id
     JOIN players p ON p.id = ep.player_id
     WHERE e.season_id = ?
       AND e.status = 'LOCKED'
       AND e.is_archived = false
       AND ep.points_r1 IS NOT NULL
       AND ep.points_r2 IS NOT NULL
       AND ep.points_r3 IS NOT NULL`,
    [seasonId]
  );

  const totals = new Map<number, { playerId: number; playerName: string; total: number; appearances: number }>();
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

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ message: "Interne serverfout.", detail: err.message });
});

app.listen(config.port, () => {
  console.log(`API running on http://localhost:${config.port}`);
});

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});
