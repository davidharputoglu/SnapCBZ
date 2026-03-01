import React, { useState } from "react";
import { AppProvider } from "./store";
import { Layout } from "./components/Layout";
import { DownloadView } from "./components/DownloadView";
import { SettingsView } from "./components/SettingsView";
import { AboutView } from "./components/AboutView";

export default function App() {
  const [activeTab, setActiveTab] = useState<"download" | "settings" | "about">(
    "download",
  );

  return (
    <AppProvider>
      <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
        {activeTab === "download" && <DownloadView />}
        {activeTab === "settings" && <SettingsView />}
        {activeTab === "about" && <AboutView />}
      </Layout>
    </AppProvider>
  );
}
