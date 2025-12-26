export type Player = {
  id: number;
  name: string;
  isArchived: boolean;
};

export type Season = {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  isArchived: boolean;
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

export type EventParticipant = {
  id: number;
  playerId: number;
  playerName: string;
  pointsR1: number | null;
  pointsR2: number | null;
  pointsR3: number | null;
  totalPoints: number | null;
  rankR1: number | null;
  rankR2: number | null;
  rankR3: number | null;
};

export type EventDetail = {
  id: number;
  seasonId: number;
  eventDate: string;
  title: string | null;
  notes: string | null;
  prizeRanks: number[];
  status: "OPEN" | "LOCKED";
  isArchived: boolean;
  lockedAt: string | null;
  participants: EventParticipant[];
  roundWinners: Array<{
    round: 1 | 2 | 3;
    winners: Array<{ rank: number; playerName: string }>;
  }>;
  eventWinner: { rank: number; playerName: string } | null;
  tieErrors: string[];
  canLock: boolean;
  lockReasons: string[];
};

export type SeasonRanking = {
  available: boolean;
  message?: string;
  openEventIds?: number[];
  tieWarning?: boolean;
  ranking?: Array<{
    rank: number;
    playerId: number;
    playerName: string;
    seasonTotal: number;
    appearances: number;
  }>;
};
