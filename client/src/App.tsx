import { AppBar, Box, Container, Tab, Tabs, Toolbar, Typography } from "@mui/material";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { PlayersPage } from "./pages/PlayersPage";
import { SeasonsPage } from "./pages/SeasonsPage";
import { EventsPage } from "./pages/EventsPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { RankingPage } from "./pages/RankingPage";

const tabs = [
  { label: "Seizoenen", path: "/" },
  { label: "Kaartavonden", path: "/events" },
  { label: "Spelers", path: "/players" },
  { label: "Klassement", path: "/ranking" }
];

export function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const currentTab = tabs.findIndex((tab) => {
    if (tab.path === "/") return location.pathname === "/";
    return location.pathname.startsWith(tab.path);
  });

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f4f1ea" }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: "#f0e6d6" }}>
        <Toolbar sx={{ justifyContent: "space-between" }}>
          <Typography variant="h6" sx={{ color: "#1f3a5f", fontWeight: 700 }}>
            Filip Card
          </Typography>
        </Toolbar>
        <Tabs
          value={currentTab === -1 ? 0 : currentTab}
          onChange={(_event, value) => navigate(tabs[value].path)}
          textColor="primary"
          indicatorColor="secondary"
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 2 }}
        >
          {tabs.map((tab) => (
            <Tab key={tab.path} label={tab.label} />
          ))}
        </Tabs>
      </AppBar>
      <Container sx={{ py: 4 }}>
        <Routes>
          <Route path="/" element={<SeasonsPage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/ranking" element={<RankingPage />} />
        </Routes>
      </Container>
    </Box>
  );
}
