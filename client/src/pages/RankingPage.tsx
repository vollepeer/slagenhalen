import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "../api";
import { Season, SeasonRanking } from "../types";
import { formatPlayerId } from "../utils/playerId";
import { RANK_MEDAL_COLORS } from "../utils/medalColors";

const TIE_HIGHLIGHT_CLASSES = ["bg-accent/20", "bg-primary/10", "bg-secondary"];

export function RankingPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<number | "">("");
  const [ranking, setRanking] = useState<SeasonRanking | null>(null);

  const rankingDisplay = useMemo(() => {
    if (!ranking?.ranking) {
      return { rows: [], tieClassByScore: new Map<number, string>() };
    }

    const rows = [...ranking.ranking].sort((a, b) => a.rank - b.rank);
    const scoreCounts = new Map<number, number>();
    rows.forEach((entry) => {
      scoreCounts.set(entry.seasonTotal, (scoreCounts.get(entry.seasonTotal) ?? 0) + 1);
    });

    const tieClassByScore = new Map<number, string>();
    let tieIndex = 0;
    rows.forEach((entry) => {
      if ((scoreCounts.get(entry.seasonTotal) ?? 0) > 1) {
        if (!tieClassByScore.has(entry.seasonTotal)) {
          tieClassByScore.set(entry.seasonTotal, TIE_HIGHLIGHT_CLASSES[tieIndex % TIE_HIGHLIGHT_CLASSES.length]);
          tieIndex += 1;
        }
      }
    });

    return { rows, tieClassByScore };
  }, [ranking]);

  const loadSeasons = async () => {
    try {
      const data = await apiGet<Season[]>("/api/seasons?includeArchived=false");
      setSeasons(data.filter((season) => !season.isArchived));
      if (data.length > 0 && seasonId === "") {
        setSeasonId(data[0].id);
      }
    } catch (err) {
      toast.error("Kon seizoenen niet laden.");
    }
  };

  const loadRanking = async (activeSeasonId: number | "") => {
    if (activeSeasonId === "") {
      setRanking(null);
      return;
    }
    try {
      const data = await apiGet<SeasonRanking>(`/api/seasons/${activeSeasonId}/ranking`);
      setRanking(data);
    } catch (err) {
      toast.error("Kon klassement niet laden.");
    }
  };

  useEffect(() => {
    void loadSeasons();
  }, []);

  useEffect(() => {
    void loadRanking(seasonId);
  }, [seasonId]);

  const activeSeason = seasonId === "" ? null : seasons.find((season) => season.id === seasonId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Klassement</h1>
        <p className="text-muted-foreground">
          Het klassement wordt alleen getoond wanneer alle kaartavonden zijn vergrendeld.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Select value={seasonId === "" ? undefined : String(seasonId)} onValueChange={(value) => setSeasonId(Number(value))}>
            <SelectTrigger className="md:w-56">
              <SelectValue placeholder="Seizoen" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((season) => (
                <SelectItem key={season.id} value={String(season.id)}>
                  {season.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeSeason && (
            <p className="mt-2 text-sm text-muted-foreground">
              Beste {activeSeason.topScoresCount} scores tellen mee voor het klassement.
            </p>
          )}
        </CardContent>
      </Card>

      {ranking && !ranking.available && (
        <Card>
          <CardContent className="pt-6 text-sm">{ranking.message}</CardContent>
        </Card>
      )}

      {ranking?.available && ranking.ranking && (
        <Card>
          <CardContent className="pt-6">
            {ranking.tieWarning && (
              <p className="mb-4 text-sm font-medium text-destructive">
                Er is een gelijke stand in het klassement.
              </p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rang</TableHead>
                  <TableHead>Speler-ID</TableHead>
                  <TableHead>Speler</TableHead>
                  <TableHead>Totaal punten</TableHead>
                  <TableHead>Kaartavonden</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankingDisplay.rows.map((entry) => (
                  <TableRow key={entry.playerId} className={rankingDisplay.tieClassByScore.get(entry.seasonTotal)}>
                    <TableCell className="font-semibold">
                      {entry.rank <= 3 ? (
                        <Badge style={{ backgroundColor: RANK_MEDAL_COLORS[entry.rank - 1] }} className="text-foreground">
                          {entry.rank}
                        </Badge>
                      ) : (
                        entry.rank
                      )}
                    </TableCell>
                    <TableCell>{formatPlayerId(entry.playerId)}</TableCell>
                    <TableCell>{entry.playerName}</TableCell>
                    <TableCell>{entry.seasonTotal}</TableCell>
                    <TableCell>{entry.appearances}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
