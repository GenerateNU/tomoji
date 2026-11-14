import { createRoot } from "react-dom/client";
import { CampaignDashboard } from "@/features/company-opportunities/components/campaign-dashboard";

const screens = {
  campaign: () => <CampaignDashboard campaignId="campaign1" />,
};

const name = (new URLSearchParams(location.search).get("screen") ??
  "campaign") as keyof typeof screens;
createRoot(document.getElementById("root")!).render(
  <main className="min-h-screen bg-gray-0">{(screens[name] ?? screens.campaign)()}</main>,
);
