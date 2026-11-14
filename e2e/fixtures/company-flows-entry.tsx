import { createRoot } from "react-dom/client";
import { CompanyCampaigns } from "@/features/campaigns/components/company-campaigns";
import { CreateCampaignFlow } from "@/features/campaigns/components/create-campaign-flow";

const screens = {
  campaigns: () => <CompanyCampaigns />,
  "create-campaign": () => <CreateCampaignFlow />,
};

const name = (new URLSearchParams(location.search).get("screen") ??
  "campaigns") as keyof typeof screens;
createRoot(document.getElementById("root")!).render(
  <main className="min-h-screen bg-gray-25">{(screens[name] ?? screens.campaigns)()}</main>,
);
