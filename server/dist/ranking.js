function hasAll(values) {
    return values.every((value) => value !== null);
}
function computeRanks(participants, round) {
    const required = (p) => {
        if (round === 1)
            return hasAll([p.points_r1]);
        if (round === 2)
            return hasAll([p.points_r2]);
        return hasAll([p.points_r3]);
    };
    const score = (p) => {
        if (round === 1)
            return p.points_r1 ?? null;
        if (round === 2)
            return p.points_r2 ?? null;
        return p.points_r3 ?? null;
    };
    const eligible = participants
        .filter(required)
        .map((p) => ({ id: p.id, score: score(p) }));
    const seen = new Set();
    let tie = false;
    for (const entry of eligible) {
        if (seen.has(entry.score)) {
            tie = true;
            break;
        }
        seen.add(entry.score);
    }
    const sorted = [...eligible].sort((a, b) => b.score - a.score);
    const ranks = new Map();
    sorted.forEach((entry, index) => {
        ranks.set(entry.id, index + 1);
    });
    return { ranks, tie };
}
export function computeRanking(rows, prizeRanks = [1, 18, 25]) {
    const participants = rows.map((row) => {
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
    const tieErrors = [];
    const round1 = computeRanks(participants, 1);
    const round2 = computeRanks(participants, 2);
    const round3 = computeRanks(participants, 3);
    const totalEligible = participants
        .filter((p) => hasAll([p.points_r1, p.points_r2, p.points_r3]))
        .map((p) => ({ id: p.id, total: p.total_points }));
    const seenTotals = new Set();
    let totalTie = false;
    for (const entry of totalEligible) {
        if (seenTotals.has(entry.total)) {
            totalTie = true;
            break;
        }
        seenTotals.add(entry.total);
    }
    if (totalTie)
        tieErrors.push("Ties detected in final totals");
    participants.forEach((p) => {
        p.rank_r1 = round1.ranks.get(p.id) ?? null;
        p.rank_r2 = round2.ranks.get(p.id) ?? null;
        p.rank_r3 = round3.ranks.get(p.id) ?? null;
    });
    const roundWinners = [1, 2, 3].map((round) => {
        const winners = [];
        const getScore = (p) => {
            if (round === 1)
                return p.points_r1;
            if (round === 2)
                return p.points_r2;
            return p.points_r3;
        };
        const seenNames = new Set();
        for (const rank of prizeRanks) {
            const match = participants.find((p) => {
                if (round === 1)
                    return p.rank_r1 === rank;
                if (round === 2)
                    return p.rank_r2 === rank;
                return p.rank_r3 === rank;
            });
            const targetScore = match ? getScore(match) : null;
            if (targetScore === null || targetScore === undefined) {
                continue;
            }
            participants.forEach((p) => {
                if (getScore(p) === targetScore && !seenNames.has(p.player_name)) {
                    winners.push({ rank, playerName: p.player_name });
                    seenNames.add(p.player_name);
                }
            });
        }
        return { round, winners };
    });
    const highestTotal = totalEligible.reduce((currentMax, entry) => {
        if (currentMax === null || entry.total > currentMax) {
            return entry.total;
        }
        return currentMax;
    }, null);
    const eventWinners = highestTotal === null
        ? []
        : participants
            .filter((participant) => participant.total_points === highestTotal)
            .map((participant) => ({ rank: 1, playerName: participant.player_name }));
    return {
        participants,
        tieErrors,
        roundWinners,
        eventWinners,
        eventWinner: eventWinners[0] ?? null
    };
}
export function canLockEvent(participants, tieErrors) {
    const reasons = [];
    if (participants.length < 1 || participants.length > 60) {
        reasons.push("Participant count must be between 1 and 60");
    }
    const missingScores = participants.some((p) => [p.points_r1, p.points_r2, p.points_r3].some((value) => value === null));
    if (missingScores) {
        reasons.push("Ontbrekende scores voor een of meer rondes");
    }
    return { allowed: reasons.length === 0, reasons };
}
