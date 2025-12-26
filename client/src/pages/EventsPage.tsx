import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { apiGet, apiSend } from "../api";
import { EventSummary, Season } from "../types";

export function EventsPage() {
  const navigate = useNavigate();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [seasonId, setSeasonId] = useState<number | "">("");
  const [eventDate, setEventDate] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadSeasons = async () => {
    try {
      const data = await apiGet<Season[]>("/api/seasons?includeArchived=false");
      setSeasons(data.filter((season) => !season.isArchived));
      if (data.length > 0 && seasonId === "") {
        setSeasonId(data[0].id);
      }
    } catch (err) {
      setError("Kon seizoenen niet laden.");
    }
  };

  const loadEvents = async (activeSeasonId: number | "") => {
    if (activeSeasonId === "") {
      setEvents([]);
      return;
    }
    try {
      const data = await apiGet<EventSummary[]>(
        `/api/events?seasonId=${activeSeasonId}&includeArchived=false`
      );
      setEvents(data);
      setError(null);
    } catch (err) {
      setError("Kon kaartavonden niet laden.");
    }
  };

  useEffect(() => {
    void loadSeasons();
  }, []);

  useEffect(() => {
    void loadEvents(seasonId);
  }, [seasonId]);

  const addEvent = async () => {
    if (seasonId === "" || !eventDate) {
      setError("Kies een seizoen en datum.");
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
      await loadEvents(seasonId);
      navigate(`/events/${response.id}`);
    } catch (err) {
      setError("Kaartavond toevoegen mislukt.");
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          Kaartavonden
        </Typography>
        <Typography variant="body1">
          Beheer kaartavonden per seizoen en open de detailpagina.
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Stack spacing={2} direction={{ xs: "column", md: "row" }}>
            <TextField
              select
              label="Seizoen"
              value={seasonId}
              onChange={(event) => setSeasonId(Number(event.target.value))}
              fullWidth
            >
              {seasons.map((season) => (
                <MenuItem key={season.id} value={season.id}>
                  {season.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type="date"
              label="Datum"
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Titel (optioneel)"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              fullWidth
            />
            <Button variant="contained" onClick={addEvent}>
              Kaartavond toevoegen
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      <Stack spacing={2}>
        {events.map((event) => (
          <Card key={event.id} variant="outlined">
            <CardContent
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2
              }}
            >
              <Box>
                <Typography variant="h6">
                  {event.title || "Kaartavond"} · {event.eventDate}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Status: {event.status === "LOCKED" ? "Vergrendeld" : "Open"}
                </Typography>
              </Box>
              <Button variant="outlined" onClick={() => navigate(`/events/${event.id}`)}>
                Openen
              </Button>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
