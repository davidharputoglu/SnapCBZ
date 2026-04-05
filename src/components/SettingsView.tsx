import React, { useState } from "react";
import {
  Folder,
  Globe2,
  Languages,
  Monitor,
  Moon,
  Sun,
  Plus,
  Trash2,
  Palette,
  MoonStar,
  Image as ImageIcon,
  BookOpen,
  ShieldAlert,
  Wrench,
  Cookie,
  RefreshCw
} from "lucide-react";
import { useAppStore, ThemeColor } from "../store";
import { useTranslation, AppLanguage } from "../translations";

export const SettingsView: React.FC = () => {
  const { settings, updateSettings } = useAppStore();
  const { t } = useTranslation();
  const [newLangName, setNewLangName] = useState("");
  const [newColorHex, setNewColorHex] = useState("#14b8a6");
  const [customSiteUrl, setCustomSiteUrl] = useState("");

  const [newAccountUrl, setNewAccountUrl] = useState("");
  const [newAccountUsername, setNewAccountUsername] = useState("");
  const [newAccountPassword, setNewAccountPassword] = useState("");

  // Ensure languages exists (fallback for older local storage data)
  const languages = settings.languages || [
    { id: "fr", name: "French (Français)" },
    { id: "en", name: "English" },
    { id: "tr", name: "Turkish (Türkçe)" },
  ];

  const handleDirectoryChange = (langId: string, value: string) => {
    updateSettings({
      directories: {
        ...settings.directories,
        [langId]: value,
      },
    });
  };

  const handleAddLanguage = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newLangName.trim();
    if (!name) return;

    const id = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    if (languages.some((l) => l.id === id) || id === "other") {
      alert(t("alert_lang_exists"));
      return;
    }

    updateSettings({
      languages: [...languages, { id, name }],
      directories: {
        ...settings.directories,
        [id]: `C:\\SnapCBZ\\${name}`,
      },
    });
    setNewLangName("");
  };

  const handleRemoveLanguage = (id: string) => {
    if (confirm(t("alert_remove_lang"))) {
      const newLangs = languages.filter((l) => l.id !== id);
      const newDirs = { ...settings.directories };
      delete newDirs[id];
      updateSettings({ languages: newLangs, directories: newDirs });
    }
  };

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountUrl || !newAccountUsername) return;
    
    let url = newAccountUrl;
    if (!url.startsWith('http')) url = 'https://' + url;
    
    const newAccount = {
      id: Math.random().toString(36).substring(2, 9),
      url,
      username: newAccountUsername,
      password: newAccountPassword
    };
    
    updateSettings({
      accounts: [...(settings.accounts || []), newAccount]
    });
    
    setNewAccountUrl("");
    setNewAccountUsername("");
    setNewAccountPassword("");
  };

  const handleRemoveAccount = (id: string) => {
    updateSettings({
      accounts: (settings.accounts || []).filter(a => a.id !== id)
    });
  };

  const handleAddCustomColor = () => {
    const id = `custom_${Date.now()}`;
    updateSettings({
      customColors: [...(settings.customColors || []), { id, hex: newColorHex }],
      themeColor: id,
    });
  };

  const handleWallpaperUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateSettings({ lightWallpaper: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearCookies = async () => {
    if (confirm(t("alert_clear_cookies") || "Êtes-vous sûr de vouloir effacer les cookies et le cache ? Cela vous déconnectera de tous les sites.")) {
      try {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        const success = await ipcRenderer.invoke('clear-cookies');
        if (success) {
          alert(t("success_clear_cookies") || "Cookies et cache effacés avec succès !");
        } else {
          alert(t("error_clear_cookies") || "Erreur lors de l'effacement des cookies.");
        }
      } catch (error) {
        console.error('Failed to clear cookies:', error);
        alert(t("error_clear_cookies") || "Erreur lors de l'effacement des cookies.");
      }
    }
  };

  const themeColors: { id: ThemeColor; nameKey: string; colorClass: string }[] = [
    { id: "turquoise", nameKey: "color_turquoise", colorClass: "bg-[#14b8a6]" },
    { id: "blue", nameKey: "color_blue", colorClass: "bg-[#3b82f6]" },
    { id: "purple", nameKey: "color_purple", colorClass: "bg-[#8b5cf6]" },
    { id: "rose", nameKey: "color_rose", colorClass: "bg-[#f43f5e]" },
    { id: "orange", nameKey: "color_orange", colorClass: "bg-[#f97316]" },
    { id: "emerald", nameKey: "color_emerald", colorClass: "bg-[#10b981]" },
  ];

  return (
    <div className="max-w-4xl mx-auto p-8 h-full flex flex-col">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">{t("set_title")}</h1>
        <p className="text-muted-foreground">
          {t("set_subtitle")}
        </p>
      </header>

      <div className="space-y-8 pb-8">
        <section className="bg-card border border-border rounded-3xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Globe2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {t("set_app_lang")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("set_app_lang_desc")}
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(["en", "fr", "tr", "de", "es", "pt", "it", "ar"] as AppLanguage[]).map((lang) => (
              <button
                key={lang}
                onClick={() => updateSettings({ appLanguage: lang })}
                className={`flex-1 py-3 px-4 rounded-xl border-2 font-medium transition-all ${
                  (settings.appLanguage || "en") === lang
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:bg-muted/50"
                }`}
              >
                {lang === "en" ? "English" : 
                 lang === "fr" ? "Français" : 
                 lang === "tr" ? "Türkçe" : 
                 lang === "de" ? "Deutsch" : 
                 lang === "es" ? "Español" : 
                 lang === "pt" ? "Português" : 
                 lang === "it" ? "Italiano" : 
                 "العربية"}
              </button>
            ))}
          </div>
        </section>

        <section className="bg-card border border-border rounded-3xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Languages className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {t("set_lang_dirs")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("set_lang_dirs_desc")}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {languages.map((lang) => (
              <div key={lang.id} className="relative group">
                <DirectoryInput
                  label={lang.name}
                  value={settings.directories[lang.id] || ""}
                  onChange={(v) => handleDirectoryChange(lang.id, v)}
                  icon={<Globe2 className="w-5 h-5 text-primary" />}
                />
                <button
                  onClick={() => handleRemoveLanguage(lang.id)}
                  className="absolute top-0 right-0 p-2 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove language"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            <form onSubmit={handleAddLanguage} className="flex gap-2 pt-2">
              <input
                type="text"
                value={newLangName}
                onChange={(e) => setNewLangName(e.target.value)}
                placeholder={t("set_add_lang_placeholder")}
                className="flex-1 px-4 py-3 bg-muted/30 border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
              <button
                type="submit"
                disabled={!newLangName.trim()}
                className="px-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-5 h-5" />
                {t("set_add_btn")}
              </button>
            </form>

            <div className="pt-6 border-t border-border space-y-4">
              <DirectoryInput
                label={t("set_other_unknown")}
                value={settings.directories.other}
                onChange={(v) => handleDirectoryChange("other", v)}
                icon={<Folder className="w-5 h-5 text-muted-foreground" />}
              />
              <DirectoryInput
                label={t("set_images_dir")}
                value={settings.imageBoardDirectory || "C:\\SnapCBZ\\ImageBoards"}
                onChange={(v) => updateSettings({ imageBoardDirectory: v })}
                icon={<Folder className="w-5 h-5 text-muted-foreground" />}
              />
            </div>
          </div>
        </section>

        <section className="bg-card border border-border rounded-3xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Globe2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {t("set_accounts")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("set_accounts_desc")}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-4">
              {(settings.accounts || []).map((account) => (
                <div key={account.id} className="flex items-center justify-between p-3 bg-muted/30 border border-border rounded-xl">
                  <div className="flex flex-col overflow-hidden">
                    <span className="font-medium text-sm text-foreground truncate">{account.url}</span>
                    <span className="text-xs text-muted-foreground truncate">{account.username}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveAccount(account.id)}
                    className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors shrink-0 ml-2"
                    title={(t("set_account_delete") as string) || "Delete"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              
              <form onSubmit={handleAddAccount} className="flex flex-col gap-2 mt-4 pt-4 border-t border-border">
                <input
                  type="url"
                  value={newAccountUrl}
                  onChange={(e) => setNewAccountUrl(e.target.value)}
                  placeholder={(t("set_account_url") as string) || "Site URL (https://...)"}
                  className="px-4 py-2 bg-muted/30 border border-border rounded-lg text-sm text-foreground focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  required
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAccountUsername}
                    onChange={(e) => setNewAccountUsername(e.target.value)}
                    placeholder={(t("set_account_username") as string) || "Username"}
                    className="flex-1 px-4 py-2 bg-muted/30 border border-border rounded-lg text-sm text-foreground focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    required
                  />
                  <input
                    type="password"
                    value={newAccountPassword}
                    onChange={(e) => setNewAccountPassword(e.target.value)}
                    placeholder={(t("set_account_password") as string) || "Password"}
                    className="flex-1 px-4 py-2 bg-muted/30 border border-border rounded-lg text-sm text-foreground focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={!newAccountUrl.trim() || !newAccountUsername.trim()}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                >
                  <Plus className="w-4 h-4" />
                  {(t("set_add_account") as string) || "Add Account"}
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="bg-card border border-border rounded-3xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {t("set_manhwa_title")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("set_manhwa_desc")}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-2xl border border-border">
              <div>
                <h3 className="font-medium text-foreground">
                  {t("set_manhwa_enable")}
                </h3>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings.enableManhwa ?? true}
                  onChange={(e) =>
                    updateSettings({ enableManhwa: e.target.checked })
                  }
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="p-4 bg-muted/50 rounded-2xl border border-border">
              <h3 className="font-medium text-foreground mb-4">
                {t("set_manhwa_format")}
              </h3>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="manhwaFormat"
                    value="cbz"
                    checked={(settings.manhwaFormat || "cbz") === "cbz"}
                    onChange={() => updateSettings({ manhwaFormat: "cbz" })}
                    className="w-4 h-4 text-primary bg-background border-border focus:ring-primary accent-primary"
                  />
                  <span className="text-sm text-foreground">
                    {t("set_manhwa_format_cbz")}
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="manhwaFormat"
                    value="images"
                    checked={settings.manhwaFormat === "images"}
                    onChange={() => updateSettings({ manhwaFormat: "images" })}
                    className="w-4 h-4 text-primary bg-background border-border focus:ring-primary accent-primary"
                  />
                  <span className="text-sm text-foreground">
                    {t("set_manhwa_format_images")}
                  </span>
                </label>
              </div>
            </div>

            <div className="p-4 bg-muted/50 rounded-2xl border border-border">
              <DirectoryInput
                label={t("set_manhwa_dir")}
                value={settings.manhwaDirectory || ""}
                onChange={(v) => updateSettings({ manhwaDirectory: v })}
                icon={<Folder className="w-5 h-5 text-muted-foreground" />}
              />
            </div>
          </div>
        </section>

        <section className="bg-card border border-border rounded-3xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Monitor className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {t("set_appearance")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("set_appearance_desc")}
              </p>
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <h3 className="text-sm font-medium text-foreground mb-4">{t("set_mode")}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <ThemeOption
                  icon={<Sun className="w-6 h-6" />}
                  label={t("theme_light")}
                  active={settings.theme === "light"}
                  onClick={() => updateSettings({ theme: "light" })}
                />
                <ThemeOption
                  icon={<Moon className="w-6 h-6" />}
                  label={t("theme_dark")}
                  active={settings.theme === "dark"}
                  onClick={() => updateSettings({ theme: "dark" })}
                />
                <ThemeOption
                  icon={<MoonStar className="w-6 h-6" />}
                  label={t("theme_black")}
                  active={settings.theme === "black"}
                  onClick={() => updateSettings({ theme: "black" })}
                />
                <ThemeOption
                  icon={<Monitor className="w-6 h-6" />}
                  label={t("theme_system")}
                  active={settings.theme === "system"}
                  onClick={() => updateSettings({ theme: "system" })}
                />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
                <Palette className="w-4 h-4" />
                {t("set_accent_color")}
              </h3>
              <div className="flex flex-wrap gap-4 mb-4">
                {themeColors.map((color) => (
                  <button
                    key={color.id}
                    onClick={() => updateSettings({ themeColor: color.id })}
                    className={`group relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                      (settings.themeColor || "turquoise") === color.id
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:bg-muted"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full shadow-sm ${color.colorClass} ${
                        (settings.themeColor || "turquoise") === color.id
                          ? "ring-2 ring-offset-2 ring-offset-card ring-primary"
                          : ""
                      }`}
                    />
                    <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                      {t(color.nameKey as any)}
                    </span>
                  </button>
                ))}
                
                {settings.customColors?.map((color) => (
                  <button
                    key={color.id}
                    onClick={() => updateSettings({ themeColor: color.id })}
                    className={`group relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                      settings.themeColor === color.id
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:bg-muted"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full shadow-sm ${
                        settings.themeColor === color.id
                          ? "ring-2 ring-offset-2 ring-offset-card ring-primary"
                          : ""
                      }`}
                      style={{ backgroundColor: color.hex }}
                    />
                    <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                      {t("set_custom_color")}
                    </span>
                  </button>
                ))}
              </div>
              
              <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl border border-border w-fit">
                <input
                  type="color"
                  value={newColorHex}
                  onChange={(e) => setNewColorHex(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border-0 p-0 bg-transparent"
                />
                <button
                  onClick={handleAddCustomColor}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  {t("set_add_custom_color")}
                </button>
              </div>
            </div>

            <div className="pt-8 border-t border-border">
              <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                {t("set_light_wallpaper")}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t("set_light_wallpaper_desc")}
              </p>
              <div className="flex flex-wrap gap-4 items-center">
                <label className="px-4 py-2 bg-primary text-primary-foreground rounded-xl cursor-pointer hover:bg-primary/90 transition-colors font-medium text-sm">
                  {t("set_choose_image")}
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.gif,.webp"
                    className="hidden"
                    onChange={handleWallpaperUpload}
                  />
                </label>
                {settings.lightWallpaper && (
                  <button
                    onClick={() => updateSettings({ lightWallpaper: null })}
                    className="px-4 py-2 bg-destructive/10 text-destructive rounded-xl hover:bg-destructive/20 transition-colors font-medium text-sm"
                  >
                    {t("set_remove_image")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-card border border-border rounded-3xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Wrench className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {t("set_advanced")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("set_advanced_desc")}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 bg-muted/30 rounded-2xl border border-border gap-4 transition-colors hover:bg-muted/50">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-background rounded-lg border border-border shadow-sm mt-0.5">
                  <Cookie className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">
                    {t("set_clear_cookies")}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    {t("set_clear_cookies_desc")}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClearCookies}
                className="px-5 py-2.5 bg-background border border-border hover:bg-muted hover:text-foreground text-muted-foreground rounded-xl font-medium transition-all whitespace-nowrap shadow-sm flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                {t("set_clear_btn")}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const DirectoryInput: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
  icon: React.ReactNode;
}> = ({ label, value, onChange, icon }) => {
  const { t } = useTranslation();

  const handleBrowse = async () => {
    try {
      // @ts-ignore
      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('dialog:openDirectory');
      if (result) {
        onChange(result);
      }
    } catch (error) {
      console.error('Failed to open directory dialog:', error);
      alert(t("alert_browse"));
    }
  };

  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
        {icon}
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
          placeholder="C:\Path\To\Directory"
        />
        <button
          type="button"
          className="px-4 py-3 bg-muted hover:bg-muted/80 text-foreground rounded-xl border border-border transition-colors flex items-center gap-2"
          onClick={handleBrowse}
        >
          <Folder className="w-5 h-5" />
          {t("set_browse")}
        </button>
      </div>
    </div>
  );
};

const ThemeOption: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon, label, active, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all ${
        active
          ? "border-primary bg-primary/5 text-primary"
          : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:bg-muted/50"
      }`}
    >
      <div className="mb-3">{icon}</div>
      <span className="font-medium">{label}</span>
    </button>
  );
};
