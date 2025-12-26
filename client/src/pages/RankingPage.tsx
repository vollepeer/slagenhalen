import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import { apiGet } from "../api";
import { Season, SeasonRanking } from "../types";

export function RankingPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<number | "">("");
  const [ranking, setRanking] = useState<SeasonRanking | null>(null);
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

  const loadRanking = async (activeSeasonId: number | "") => {
    if (activeSeasonId === "") {
      setRanking(null);
      return;
    }
    try {
      const data = await apiGet<SeasonRanking>(
        `/api/seasons/${activeSeasonId}/ranking`
      );
      setRanking(data);
      setError(null);
    } catch (err) {
      setError("Kon klassement niet laden.");
    }
  };

  useEffect(() => {
    void loadSeasons();
  }, []);

  useEffect(() => {
    void loadRanking(seasonId);
  }, [seasonId]);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          Klassement
        </Typography>
        <Typography variant="body1">
          Het klassement wordt alleen getoond wanneer alle kaartavonden zijn vergrendeld.
        </Typography>
      </Box>

      <Card>
        <CardContent>
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
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      {ranking && !ranking.available && (
        <Alert severity="info">{ranking.message}</Alert>
      )}

      {ranking?.available && ranking.ranking && (
        <Card>
          <CardContent>
            {ranking.tieWarning && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Er is een gelijke stand in het klassement.
              </Alert>
            )}
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Rang</TableCell>
                  <TableCell>Speler</TableCell>
                  <TableCell>Totaal punten</TableCell>
                  <TableCell>Kaartavonden</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ranking.ranking.map((entry) => (
                  <TableRow key={entry.playerId}>
                    <TableCell>{entry.rank}</TableCell>
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
    </Stack>
  );
}
