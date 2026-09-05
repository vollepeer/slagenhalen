import { useEffect, useState } from "react";
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

  const loadEvents = async (activeSeasonId: number | "", showArchived: boolean) => {
    if (activeSeasonId === "") {
      setEvents([]);
      return;
    }
    try {
      const data = await apiGet<EventSummary[]>(
        `/api/events?seasonId=${activeSeasonId}&includeArchived=${showArchived}`
      );
      setEvents(data);
    } catch (err) {
      toast.error("Kon kaartavonden niet laden.");
    }
  };

  useEffect(() => {
    void loadSeasons();
  }, []);

  useEffect(() => {
    void loadEvents(seasonId, includeArchived);
  }, [seasonId, includeArchived]);

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
      await loadEvents(seasonId, includeArchived);
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

      <div className="flex flex-col gap-3">
        {events.map((event) => (
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
                      await loadEvents(seasonId, includeArchived);
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
    </div>
  );
}
