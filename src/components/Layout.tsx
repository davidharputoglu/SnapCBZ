import React from "react";
import { Download, Settings, Box, Info } from "lucide-react";
import { useAppStore } from "../store";
import { useTranslation } from "../translations";

interface LayoutProps {
  children: React.ReactNode;
  activeTab: "download" | "settings" | "about";
  setActiveTab: (tab: "download" | "settings" | "about") => void;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  activeTab,
  setActiveTab,
}) => {
  const { settings, updateSettings } = useAppStore();
  const { t } = useTranslation();

  return (
    <div className="flex h-screen bg-muted/30 dark:bg-background">
      {/* Sidebar */}
      <div className="w-64 bg-card dark:bg-card border-r border-border flex flex-col">
        <div className="p-6 flex items-center gap-3 text-primary">
          <Box className="w-8 h-8" />
          <span className="text-xl font-bold tracking-tight">SnapCBZ</span>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <button
            onClick={() => setActiveTab("download")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
              activeTab === "download"
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Download className="w-5 h-5" />
            {t("nav_downloads")}
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
              activeTab === "settings"
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Settings className="w-5 h-5" />
            {t("nav_settings")}
          </button>
          <button
            onClick={() => setActiveTab("about")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
              activeTab === "about"
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Info className="w-5 h-5" />
            {t("nav_about")}
          </button>
        </nav>

        <div className="p-4 border-t border-border">
          <div className="text-xs text-center text-muted-foreground flex flex-col gap-1">
            <span>Version 1.0.3</span>
            <span className="font-medium">{t("created_by")} David HARPUTOGLU</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
};
