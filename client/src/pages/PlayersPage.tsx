import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/LoadingButton";
import { apiGet, apiSend } from "../api";
import { Player } from "../types";
import { formatPlayerId } from "../utils/playerId";

export function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [name, setName] = useState("");
  const [editingPlayerId, setEditingPlayerId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [archivingPlayerIds, setArchivingPlayerIds] = useState<Set<number>>(new Set());
  const [savingEdit, setSavingEdit] = useState(false);

  const loadPlayers = async () => {
    try {
      const data = await apiGet<Player[]>(
        `/api/players?query=${encodeURIComponent(query)}&includeArchived=${includeArchived}`
      );
      setPlayers(data);
    } catch (err) {
      toast.error("Kon spelers niet laden.");
    }
  };

  useEffect(() => {
    void loadPlayers();
  }, [query, includeArchived]);

  const addPlayer = async () => {
    if (!name.trim()) {
      toast.error("Vul een naam in.");
      return;
    }
    try {
      const created = await apiSend<{ id: number; name: string }>("/api/players", "POST", { name });
      setName("");
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery || created.name.toLowerCase().includes(normalizedQuery)) {
        setPlayers((current) =>
          [...current, { id: created.id, name: created.name, isArchived: false }].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        );
      }
    } catch (err) {
      toast.error("Toevoegen mislukt. Controleer of de naam uniek is.");
    }
  };

  const toggleArchive = async (player: Player) => {
    setArchivingPlayerIds((current) => new Set(current).add(player.id));
    try {
      await apiSend(`/api/players/${player.id}`, "PATCH", { isArchived: !player.isArchived });
      await loadPlayers();
    } catch (err) {
      toast.error("Archiveren mislukt.");
    } finally {
      setArchivingPlayerIds((current) => {
        const next = new Set(current);
        next.delete(player.id);
        return next;
      });
    }
  };

  const startEdit = (player: Player) => {
    setEditingPlayerId(player.id);
    setEditingName(player.name);
  };

  const cancelEdit = () => {
    setEditingPlayerId(null);
    setEditingName("");
  };

  const saveEdit = async (player: Player) => {
    if (!editingName.trim()) {
      toast.error("Vul een naam in.");
      return;
    }
    setSavingEdit(true);
    try {
      await apiSend(`/api/players/${player.id}`, "PATCH", { name: editingName });
      await loadPlayers();
      cancelEdit();
    } catch (err) {
      toast.error("Bewerken mislukt. Controleer of de naam uniek is.");
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Spelers</h1>
        <p className="text-muted-foreground">Beheer spelers en zorg dat namen uniek blijven.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center">
          <Input placeholder="Zoeken" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="flex items-center gap-2">
            <Checkbox
              id="players-include-archived"
              checked={includeArchived}
              onCheckedChange={(checked) => setIncludeArchived(checked === true)}
            />
            <Label htmlFor="players-include-archived">Toon gearchiveerde spelers</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2 pt-6 md:flex-row">
          <Input
            placeholder="Nieuwe speler"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button onClick={addPlayer}>Speler toevoegen</Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {players.map((player) => (
          <Card key={player.id}>
            <CardContent className="flex flex-col justify-between gap-3 pt-6 md:flex-row md:items-center">
              <div>
                {editingPlayerId === player.id ? (
                  <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} />
                ) : (
                  <span className="text-lg font-semibold">{player.name}</span>
                )}
                <p className="text-sm text-muted-foreground">Speler-ID: {formatPlayerId(player.id)}</p>
                {player.isArchived && <p className="text-sm text-muted-foreground">Gearchiveerd</p>}
              </div>
              <div className="flex gap-2">
                {editingPlayerId === player.id ? (
                  <>
                    <LoadingButton
                      loading={savingEdit}
                      onClick={() => saveEdit(player)}
                      disabled={editingName.trim() === ""}
                    >
                      Opslaan
                    </LoadingButton>
                    <Button variant="outline" onClick={cancelEdit} disabled={savingEdit}>
                      Annuleren
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => startEdit(player)}>
                      Bewerken
                    </Button>
                    <LoadingButton
                      variant="outline"
                      loading={archivingPlayerIds.has(player.id)}
                      onClick={() => toggleArchive(player)}
                    >
                      {player.isArchived ? "Herstellen" : "Archiveren"}
                    </LoadingButton>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
