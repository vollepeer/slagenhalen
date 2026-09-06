import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiSend } from "../api";
import { EventSummary, Season } from "../types";
import { formatEventDate } from "../utils/date";

export function EventsPage() {
  const navigate = useNavigate();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [seasonId, setSeasonId] = useState<number | "">("");
  const [eventDate, setEventDate] = useState("");
  const [title, setTitle] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  // Seasons here includes archived ones — the events list below is grouped by season and an
  // event can belong to a season that's since been archived, so its name still needs to be
  // resolvable. The "new event" dropdown filters this down to active seasons only (see
  // activeSeasons below); archiving a season doesn't affect which seasons its past events
  // are grouped under.
  const loadSeasons = async () => {
    try {
      const data = await apiGet<Season[]>("/api/seasons?includeArchived=true");
      setSeasons(data);
      const firstActive = data.find((season) => !season.isArchived);
      if (firstActive && seasonId === "") {
        setSeasonId(firstActive.id);
      }
    } catch (err) {
      toast.error("Kon seizoenen niet laden.");
    }
  };

  const activeSeasons = useMemo(() => seasons.filter((season) => !season.isArchived), [seasons]);

  const seasonNameById = useMemo(() => {
    const map = new Map<number, string>();
    seasons.forEach((season) => map.set(season.id, season.name));
    return map;
  }, [seasons]);

  // The events list always shows every season's events (grouped below) — the season picker
  // above only controls which season a newly created event is added to.
  const loadEvents = async (showArchived: boolean) => {
    try {
      const data = await apiGet<EventSummary[]>(`/api/events?includeArchived=${showArchived}`);
      setEvents(data);
    } catch (err) {
      toast.error("Kon kaartavonden niet laden.");
    }
  };

  useEffect(() => {
    void loadSeasons();
  }, []);

  useEffect(() => {
    void loadEvents(includeArchived);
  }, [includeArchived]);

  // Groups events by season and sorts the groups alphabetically by season name. Events within
  // each group keep the order the backend already returns them in (date descending) — not
  // re-sorted here.
  const eventsBySeason = useMemo(() => {
    const groups = new Map<number, EventSummary[]>();
    events.forEach((event) => {
      const group = groups.get(event.seasonId) ?? [];
      group.push(event);
      groups.set(event.seasonId, group);
    });
    return Array.from(groups.entries())
      .map(([seasonIdKey, seasonEvents]) => ({
        seasonId: seasonIdKey,
        seasonName: seasonNameById.get(seasonIdKey) ?? "Onbekend seizoen",
        events: seasonEvents
      }))
      .sort((a, b) => a.seasonName.localeCompare(b.seasonName));
  }, [events, seasonNameById]);

  const addEvent = async () => {
    if (seasonId === "" || !eventDate) {
      toast.error("Kies een seizoen en datum.");
      return;
    }
    try {
      const response = await apiSend<{ id: number }>("/api/events", "POST", {
        seasonId,
        eventDate,
        title: title.trim() || null
      });
      setEventDate("");
      setTitle("");
      await loadEvents(includeArchived);
      navigate(`/events/${response.id}`);
    } catch (err) {
      toast.error("Kaartavond toevoegen mislukt.");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Kaartavonden</h1>
        <p className="text-muted-foreground">Beheer kaartavonden per seizoen en open de detailpagina.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center">
          <Select value={seasonId === "" ? "" : String(seasonId)} onValueChange={(value) => setSeasonId(Number(value))}>
            <SelectTrigger className="md:w-56">
              <SelectValue placeholder="Seizoen" />
            </SelectTrigger>
            <SelectContent>
              {activeSeasons.map((season) => (
                <SelectItem key={season.id} value={String(season.id)}>
                  {season.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={eventDate}
            onChange={(event) => setEventDate(event.target.value)}
            className="md:w-48"
          />
          <Input
            placeholder="Titel (optioneel)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button onClick={addEvent}>Voeg toe</Button>
          <div className="flex items-center gap-2">
            <Checkbox
              id="events-include-archived"
              checked={includeArchived}
              onCheckedChange={(checked) => setIncludeArchived(checked === true)}
            />
            <Label htmlFor="events-include-archived">Toon gearchiveerde kaartavonden</Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        {eventsBySeason.map((group) => (
          <div key={group.seasonId} className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">{group.seasonName}</h2>
            {group.events.map((event) => (
              <Card key={event.id}>
                <CardContent className="flex items-center justify-between gap-3 pt-6">
                  <div>
                    <span className="text-lg font-semibold">
                      {event.title || "Kaartavond"} · {formatEventDate(event.eventDate)}
                    </span>
                    <p className="text-sm text-muted-foreground">
                      Status: {event.status === "LOCKED" ? "Vergrendeld" : "Open"}
                    </p>
                    {event.isArchived && <p className="text-sm text-muted-foreground">Gearchiveerd</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => navigate(`/events/${event.id}`)}>
                      Openen
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          await apiSend(`/api/events/${event.id}`, "PATCH", { isArchived: !event.isArchived });
                          await loadEvents(includeArchived);
                        } catch (err) {
                          toast.error("Archiveren mislukt.");
                        }
                      }}
                    >
                      {event.isArchived ? "Herstellen" : "Archiveren"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
