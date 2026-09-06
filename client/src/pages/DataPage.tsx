import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { LoadingButton } from "@/components/LoadingButton";
import { apiGet, apiSend } from "../api";

function downloadFile(contents: string, filename: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildExportFilename() {
  const now = new Date();
  const stamp = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  return `kaartbuddy-backup-${stamp}.json`;
}

export function DataPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [playerImportText, setPlayerImportText] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [wipeDialogOpen, setWipeDialogOpen] = useState(false);
  const [importingPlayers, setImportingPlayers] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const payload = await apiGet<unknown>("/api/data/export");
      downloadFile(JSON.stringify(payload, null, 2), buildExportFilename(), "application/json");
      toast.success("Back-up opgeslagen.");
    } catch {
      toast.error("Exporteren mislukt.");
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const parsed = JSON.parse(await file.text());
      await apiSend("/api/data/import", "POST", parsed);
      toast.success("Back-up geïmporteerd.");
    } catch {
      toast.error("Importeren mislukt. Controleer het bestand.");
    } finally {
      setImporting(false);
    }
  };

  const handleReset = async () => {
    setWiping(true);
    try {
      await apiSend("/api/data/wipe", "POST");
      toast.success("Alle data is gewist.");
    } catch {
      toast.error("Wissen mislukt.");
    } finally {
      setWiping(false);
      setWipeDialogOpen(false);
    }
  };

  const handleImportPlayers = async () => {
    const lines = playerImportText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length === 0) {
      toast.error("Plak minimaal één spelersnaam.");
      return;
    }
    const normalized = new Set<string>();
    const uniqueNames: string[] = [];
    lines.forEach((name) => {
      const key = name.toLowerCase();
      if (!normalized.has(key)) {
        normalized.add(key);
        uniqueNames.push(name);
      }
    });

    setImportingPlayers(true);
    let added = 0;
    try {
      for (const name of uniqueNames) {
        try {
          await apiSend("/api/players", "POST", { name });
          added += 1;
        } catch {
          // naam bestaat al of ongeldig; overslaan
        }
      }
    } finally {
      setImportingPlayers(false);
    }

    if (added === 0) {
      toast.error("Geen nieuwe spelers toegevoegd.");
      return;
    }
    toast.success(`${added} spelers toegevoegd.`);
    setPlayerImportText("");
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Databeheer</h1>
        <p>Maak een back-up, importeer data of wis de opgeslagen data.</p>
        <p className="text-sm text-muted-foreground">Importeren vervangt de huidige data.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 pt-6 md:flex-row">
          <LoadingButton loading={exporting} onClick={handleExport}>
            Exporteer back-up
          </LoadingButton>
          <LoadingButton loading={importing} variant="outline" onClick={() => inputRef.current?.click()}>
            Importeer back-up
          </LoadingButton>
          <AlertDialog open={wipeDialogOpen} onOpenChange={(open) => !wiping && setWipeDialogOpen(open)}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Wis alle data</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Weet je zeker dat je alle data wilt wissen?</AlertDialogTitle>
                <AlertDialogDescription>Dit kan niet ongedaan worden gemaakt.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={wiping}>Annuleren</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(event) => {
                    event.preventDefault();
                    void handleReset();
                  }}
                  disabled={wiping}
                >
                  {wiping && <Loader2 className="size-4 animate-spin" />}
                  Wissen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <input
            ref={inputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImport(file);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <h2 className="text-lg font-semibold">Spelers importeren</h2>
          <p className="text-sm text-muted-foreground">Plak spelersnamen, één naam per regel.</p>
          <Textarea
            rows={6}
            placeholder={"Jan Jansen\nPiet de Vries\n..."}
            value={playerImportText}
            onChange={(event) => setPlayerImportText(event.target.value)}
          />
          <LoadingButton loading={importingPlayers} onClick={handleImportPlayers}>
            Importeer spelers
          </LoadingButton>
        </CardContent>
      </Card>
    </div>
  );
}
