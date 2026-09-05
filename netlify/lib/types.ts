export type PlayerRow = {
  id: number;
  name: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type Player = { id: number; name: string; isArchived: boolean };

export function mapPlayer(row: PlayerRow): Player {
  return { id: row.id, name: row.name, isArchived: row.is_archived };
}

export type SeasonRow = {
  id: number;
  name: string;
  top_scores_count: number;
  start_date: string | null;
  end_date: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type Season = {
  id: number;
  name: string;
  topScoresCount: number;
  startDate: string | null;
  endDate: string | null;
  isArchived: boolean;
};

export function mapSeason(row: SeasonRow): Season {
  return {
    id: row.id,
    name: row.name,
    topScoresCount: row.top_scores_count,
    startDate: row.start_date,
    endDate: row.end_date,
    isArchived: row.is_archived
  };
}

export type EventRow = {
  id: number;
  season_id: number;
  event_date: string;
  title: string | null;
  notes: string | null;
  prize_rank_1: number;
  prize_rank_2: number;
  prize_rank_3: number;
  status: "OPEN" | "LOCKED";
  locked_at: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type EventSummary = {
  id: number;
  seasonId: number;
  eventDate: string;
  title: string | null;
  notes: string | null;
  status: "OPEN" | "LOCKED";
  isArchived: boolean;
};

export function mapEventSummary(row: EventRow): EventSummary {
  return {
    id: row.id,
    seasonId: row.season_id,
    eventDate: row.event_date,
    title: row.title,
    notes: row.notes,
    status: row.status,
    isArchived: row.is_archived
  };
}
