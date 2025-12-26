export type ParticipantRow = {
  id: number;
  player_id: number;
  player_name: string;
  points_r1: number | null;
  points_r2: number | null;
  points_r3: number | null;
};

export type RankedParticipant = ParticipantRow & {
  total_points: number | null;
  rank_r1: number | null;
  rank_r2: number | null;
  rank_r3: number | null;
};

export type RankingResult = {
  participants: RankedParticipant[];
  tieErrors: string[];
  winners: Array<{ rank: number; playerName: string }>;
};

function hasAll(values: Array<number | null>) {
  return values.every((value) => value !== null);
}

function computeRanks(
  participants: RankedParticipant[],
  round: 1 | 2 | 3
): { ranks: Map<number, number>; tie: boolean } {
  const required = (p: RankedParticipant) => {
    if (round === 1) return hasAll([p.points_r1]);
    if (round === 2) return hasAll([p.points_r1, p.points_r2]);
    return hasAll([p.points_r1, p.points_r2, p.points_r3]);
  };
  const score = (p: RankedParticipant) => {
    if (round === 1) return p.points_r1 ?? null;
    if (round === 2) return (p.points_r1 ?? 0) + (p.points_r2 ?? 0);
    return (p.points_r1 ?? 0) + (p.points_r2 ?? 0) + (p.points_r3 ?? 0);
  };

  const eligible = participants
    .filter(required)
    .map((p) => ({ id: p.id, score: score(p) as number }));

  const seen = new Set<number>();
  let tie = false;
  for (const entry of eligible) {
    if (seen.has(entry.score)) {
      tie = true;
      break;
    }
    seen.add(entry.score);
  }

  const sorted = [...eligible].sort((a, b) => b.score - a.score);
  const ranks = new Map<number, number>();
  sorted.forEach((entry, index) => {
    ranks.set(entry.id, index + 1);
  });

  return { ranks, tie };
}

export function computeRanking(rows: ParticipantRow[]): RankingResult {
  const participants: RankedParticipant[] = rows.map((row) => {
    const totalPoints = hasAll([row.points_r1, row.points_r2, row.points_r3])
      ? (row.points_r1 ?? 0) + (row.points_r2 ?? 0) + (row.points_r3 ?? 0)
      : null;

    return {
      ...row,
      total_points: totalPoints,
      rank_r1: null,
      rank_r2: null,
      rank_r3: null
    };
  });

  const tieErrors: string[] = [];
  const round1 = computeRanks(participants, 1);
  const round2 = computeRanks(participants, 2);
  const round3 = computeRanks(participants, 3);

  if (round3.tie) tieErrors.push("Ties detected in final totals");

  participants.forEach((p) => {
    p.rank_r1 = round1.ranks.get(p.id) ?? null;
    p.rank_r2 = round2.ranks.get(p.id) ?? null;
    p.rank_r3 = round3.ranks.get(p.id) ?? null;
  });

  const winners: Array<{ rank: number; playerName: string }> = [];
  const finalRanks = participants
    .filter((p) => p.rank_r3 !== null)
    .sort((a, b) => (a.rank_r3 ?? 0) - (b.rank_r3 ?? 0));

  const winnerRanks = new Set([1, 18, 25]);
  for (const p of finalRanks) {
    if (p.rank_r3 && winnerRanks.has(p.rank_r3)) {
      winners.push({ rank: p.rank_r3, playerName: p.player_name });
    }
  }

  return { participants, tieErrors, winners };
}

export function canLockEvent(participants: RankedParticipant[], tieErrors: string[]) {
  const reasons: string[] = [];

  if (participants.length < 1 || participants.length > 60) {
    reasons.push("Participant count must be between 1 and 60");
  }

  const missingScores = participants.some((p) =>
    [p.points_r1, p.points_r2, p.points_r3].some((value) => value === null)
  );
  if (missingScores) {
    reasons.push("Missing scores for one or more rounds");
  }

  if (tieErrors.length > 0) {
    reasons.push("Gelijke totaalscores in de eindstand");
  }

  return { allowed: reasons.length === 0, reasons };
}
