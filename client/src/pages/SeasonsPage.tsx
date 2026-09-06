import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LoadingButton } from "@/components/LoadingButton";
import { apiGet, apiSend } from "../api";
import { Season } from "../types";
import { formatEventDate } from "../utils/date";

export function SeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [name, setName] = useState("");
  const [scoreCountBySeason, setScoreCountBySeason] = useState<Record<number, string>>({});
  const [archivingSeasonIds, setArchivingSeasonIds] = useState<Set<number>>(new Set());

  const loadSeasons = async () => {
    try {
      const data = await apiGet<Season[]>(`/api/seasons?includeArchived=${includeArchived}`);
      setSeasons(data);
      setScoreCountBySeason((current) => {
        const next = { ...current };
        data.forEach((season) => {
          next[season.id] = String(season.topScoresCount);
        });
        return next;
      });
    } catch (err) {
      toast.error("Kon seizoenen niet laden.");
    }
  };

  useEffect(() => {
    void loadSeasons();
  }, [includeArchived]);

  const addSeason = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Vul een seizoensnaam in.");
      return;
    }
    try {
      const created = await apiSend<{ id: number }>("/api/seasons", "POST", { name });
      setName("");
      setSeasons((current) => [
        {
          id: created.id,
          name: trimmedName,
          topScoresCount: 7,
          startDate: null,
          endDate: null,
          isArchived: false
        },
        ...current
      ]);
      setScoreCountBySeason((current) => ({ ...current, [created.id]: "7" }));
    } catch (err) {
      toast.error("Seizoen toevoegen mislukt.");
    }
  };

  const toggleArchive = async (season: Season) => {
    setArchivingSeasonIds((current) => new Set(current).add(season.id));
    try {
      await apiSend(`/api/seasons/${season.id}`, "PATCH", { isArchived: !season.isArchived });
      await loadSeasons();
    } catch (err) {
      toast.error("Archiveren mislukt.");
    } finally {
      setArchivingSeasonIds((current) => {
        const next = new Set(current);
        next.delete(season.id);
        return next;
      });
    }
  };

  const updateScoreCount = async (season: Season, rawValue: string) => {
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < 1) {
      toast.error("Vul een geldig aantal beste scores in.");
      setScoreCountBySeason((current) => ({ ...current, [season.id]: String(season.topScoresCount) }));
      return;
    }
    if (parsed === season.topScoresCount) return;
    try {
      await apiSend(`/api/seasons/${season.id}`, "PATCH", { topScoresCount: parsed });
      await loadSeasons();
    } catch (err) {
      toast.error("Aantal beste scores opslaan mislukt.");
      setScoreCountBySeason((current) => ({ ...current, [season.id]: String(season.topScoresCount) }));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Seizoenen</h1>
        <p className="text-muted-foreground">Maak seizoenen aan en beheer archivering.</p>
      </div>

      <Card>
        <CardContent className="flex items-center gap-2 pt-6">
          <Checkbox
            id="seasons-include-archived"
            checked={includeArchived}
            onCheckedChange={(checked) => setIncludeArchived(checked === true)}
          />
          <Label htmlFor="seasons-include-archived">Toon gearchiveerde seizoenen</Label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2 pt-6 md:flex-row">
          <Input
            placeholder="Nieuw seizoen"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button onClick={addSeason}>Seizoen toevoegen</Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {seasons.map((season) => (
          <Card key={season.id}>
            <CardContent className="flex flex-col items-start justify-between gap-3 pt-6 md:flex-row md:items-center">
              <div>
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <span className="text-lg font-semibold">{season.name}</span>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`top-scores-count-${season.id}`} className="flex items-center gap-1 whitespace-nowrap">
                      Beste scores
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground"
                            aria-label="Uitleg bij aantal beste scores"
                          >
                            <Info className="size-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64">
                          Bepaalt hoeveel van de beste kaartavond-resultaten van een speler meetellen voor het
                          klassement van dit seizoen. Alleen de hoogste N totalen tellen mee; mindere avonden worden
                          niet meegerekend.
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <Input
                      id={`top-scores-count-${season.id}`}
                      className="w-24"
                      type="number"
                      min={1}
                      value={scoreCountBySeason[season.id] ?? String(season.topScoresCount)}
                      onChange={(event) =>
                        setScoreCountBySeason((current) => ({ ...current, [season.id]: event.target.value }))
                      }
                      onBlur={(event) => updateScoreCount(season, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          updateScoreCount(season, (event.target as HTMLInputElement).value);
                        }
                      }}
                      disabled={season.isArchived}
                    />
                  </div>
                </div>
                {(season.startDate || season.endDate) && (
                  <p className="text-sm text-muted-foreground">
                    {season.startDate && season.endDate
                      ? `Periode: ${formatEventDate(season.startDate)} - ${formatEventDate(season.endDate)}`
                      : season.startDate
                        ? `Start: ${formatEventDate(season.startDate)}`
                        : `Einde: ${formatEventDate(season.endDate ?? "")}`}
                  </p>
                )}
                {season.isArchived && <p className="text-sm text-muted-foreground">Gearchiveerd</p>}
              </div>
              <LoadingButton
                variant="outline"
                loading={archivingSeasonIds.has(season.id)}
                onClick={() => toggleArchive(season)}
              >
                {season.isArchived ? "Herstellen" : "Archiveren"}
              </LoadingButton>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
