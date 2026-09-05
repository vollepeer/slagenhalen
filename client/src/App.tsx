import { useEffect } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { PlayersPage } from "./pages/PlayersPage";
import { SeasonsPage } from "./pages/SeasonsPage";
import { EventsPage } from "./pages/EventsPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { RankingPage } from "./pages/RankingPage";
import { DataPage } from "./pages/DataPage";
import { LoginPage } from "./pages/LoginPage";
import { useAuth } from "./auth/AuthContext";
import { rawRequest } from "./api";
import { startAutoFlush } from "./retryQueue";
import { usePendingSyncCount } from "./usePendingSyncCount";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const mainNav = [
  { label: "Kaartavonden", path: "/events" },
  { label: "Klassement", path: "/ranking" }
];

const settingsNav = [
  { label: "Seizoenen", path: "/" },
  { label: "Spelers", path: "/players" },
  { label: "Databeheer", path: "/data" }
];

function isActivePath(pathname: string, path: string): boolean {
  return path === "/" ? pathname === "/" : pathname.startsWith(path);
}

export function App() {
  const { session, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pendingCount = usePendingSyncCount();

  useEffect(() => startAutoFlush(rawRequest), []);

  if (loading) return null;
  if (!session) return <LoginPage />;

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="gap-1 px-3 py-3">
          <span className="text-lg font-bold text-primary">KaartBuddy</span>
          <span className="truncate text-xs text-muted-foreground">{session.user.email}</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto w-fit justify-start px-0 text-foreground"
            onClick={() => void signOut()}
          >
            Uitloggen
          </Button>
          {pendingCount > 0 && (
            <Badge
              variant="outline"
              className="mt-1 w-fit border-accent bg-accent/20 text-accent-foreground"
            >
              {pendingCount} wijziging{pendingCount === 1 ? "" : "en"} wacht
              {pendingCount === 1 ? "" : "en"} op synchronisatie
            </Badge>
          )}
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Hoofd</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainNav.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActivePath(location.pathname, item.path)}
                      onClick={() => navigate(item.path)}
                    >
                      {item.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Instellingen</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {settingsNav.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActivePath(location.pathname, item.path)}
                      onClick={() => navigate(item.path)}
                    >
                      {item.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex items-center gap-2 border-b px-4 py-3 md:hidden">
          <SidebarTrigger />
          <span className="font-semibold text-primary">KaartBuddy</span>
        </header>
        <main className="flex-1 p-6">
          <Routes>
            <Route path="/" element={<SeasonsPage />} />
            <Route path="/players" element={<PlayersPage />} />
            <Route path="/data" element={<DataPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route path="/ranking" element={<RankingPage />} />
          </Routes>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
