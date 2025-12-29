import { Box, Container, Drawer, Tab, Tabs, Typography } from "@mui/material";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { PlayersPage } from "./pages/PlayersPage";
import { SeasonsPage } from "./pages/SeasonsPage";
import { EventsPage } from "./pages/EventsPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { RankingPage } from "./pages/RankingPage";
import { DataPage } from "./pages/DataPage";

const mainTabs = [
  { label: "Kaartavonden", path: "/events" },
  { label: "Klassement", path: "/ranking" }
];

const settingsTabs = [
  { label: "Seizoenen", path: "/" },
  { label: "Spelers", path: "/players" },
  { label: "Databeheer", path: "/data" }
];

export function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const currentMainTab = mainTabs.findIndex((tab) =>
    location.pathname.startsWith(tab.path)
  );
  const currentSettingsTab = settingsTabs.findIndex((tab) => {
    if (tab.path === "/") return location.pathname === "/";
    return location.pathname.startsWith(tab.path);
  });

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f4f1ea", display: "flex" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: 260,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: 260,
            boxSizing: "border-box",
            bgcolor: "#f0e6d6",
            borderRight: "1px solid #e2d7c5"
          }
        }}
      >
        <Box sx={{ px: 2.5, py: 2 }}>
          <Typography variant="h6" sx={{ color: "#1f3a5f", fontWeight: 700 }}>
            Slagen halen
          </Typography>
        </Box>
        <Box sx={{ px: 2.5, pb: 2 }}>
          <Typography
            variant="caption"
            sx={{ color: "#6b5e50", fontWeight: 700, textTransform: "uppercase" }}
          >
            Hoofd
          </Typography>
          <Tabs
            orientation="vertical"
            value={currentMainTab === -1 ? false : currentMainTab}
            onChange={(_event, value) => navigate(mainTabs[value].path)}
            textColor="primary"
            indicatorColor="secondary"
            sx={{ mt: 1 }}
          >
            {mainTabs.map((tab) => (
              <Tab key={tab.path} label={tab.label} sx={{ alignItems: "flex-start" }} />
            ))}
          </Tabs>
          <Typography
            variant="caption"
            sx={{ color: "#6b5e50", fontWeight: 700, textTransform: "uppercase", mt: 2 }}
          >
            Instellingen
          </Typography>
          <Tabs
            orientation="vertical"
            value={currentSettingsTab === -1 ? false : currentSettingsTab}
            onChange={(_event, value) => navigate(settingsTabs[value].path)}
            textColor="primary"
            indicatorColor="secondary"
            sx={{ mt: 1 }}
          >
            {settingsTabs.map((tab) => (
              <Tab key={tab.path} label={tab.label} sx={{ alignItems: "flex-start" }} />
            ))}
          </Tabs>
        </Box>
      </Drawer>
      <Container sx={{ py: 4, flex: 1 }}>
        <Routes>
          <Route path="/" element={<SeasonsPage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/ranking" element={<RankingPage />} />
        </Routes>
      </Container>
    </Box>
  );
}
