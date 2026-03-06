import React, { createContext, useContext, useState, useEffect, useRef } from "react";
const { ipcRenderer } = window.require ? window.require("electron") : { ipcRenderer: null };

export interface CustomLanguage {
  id: string;
  name: string;
}

export type ThemeColor = "turquoise" | "blue" | "purple" | "rose" | "orange" | "emerald";

export interface CustomColor {
  id: string;
  hex: string;
}

export interface Settings {
  appLanguage: string;
  directories: Record<string, string>;
  imageBoardDirectory: string;
  languages: CustomLanguage[];
  theme: "light" | "dark" | "black" | "system";
  themeColor: string;
  customColors?: CustomColor[];
  lightWallpaper?: string | null;
}

export interface DownloadTask {
  id: string;
  url: string;
  filename: string;
  type: "cbz" | "images";
  status:
    | "queued"
    | "scraping"
    | "downloading"
    | "downloading_images"
    | "extracting"
    | "converting"
    | "completed"
    | "error"
    | "ignored";
  progress: number;
  language?: string;
  category?: string;
  copyright?: string;
  character?: string;
  downloadedCount?: number;
  totalImages?: number;
  currentFile?: string;
  finalPath?: string;
  error?: string;
}

interface AppState {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  tasks: DownloadTask[];
  addTask: (url: string, type?: "cbz" | "images") => void;
  addTasks: (urls: string[], type?: "cbz" | "images") => void;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
}

const defaultSettings: Settings = {
  appLanguage: "en",
  directories: {
    fr: "C:\\SnapCBZ\\French",
    en: "C:\\SnapCBZ\\English",
    tr: "C:\\SnapCBZ\\Turkish",
    other: "C:\\SnapCBZ\\Other",
  },
  imageBoardDirectory: "C:\\SnapCBZ\\ImageBoards",
  languages: [
    { id: "fr", name: "French (Français)" },
    { id: "en", name: "English" },
    { id: "tr", name: "Turkish (Türkçe)" },
  ],
  theme: "system",
  themeColor: "turquoise",
  customColors: [],
  lightWallpaper: null,
};

const AppContext = createContext<AppState | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem("snapcbz_settings");
    return saved ? JSON.parse(saved) : defaultSettings;
  });

  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
    try {
      localStorage.setItem("snapcbz_settings", JSON.stringify(settings));
    } catch (e) {
      console.error("Failed to save settings to localStorage", e);
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        alert("Image is too large to save in settings. Please choose a smaller image.");
        setSettings((prev) => ({ ...prev, lightWallpaper: null }));
      }
    }

    const isDark =
      settings.theme === "dark" ||
      settings.theme === "black" ||
      (settings.theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    if (settings.theme === "black") {
      document.documentElement.classList.add("black-theme");
    } else {
      document.documentElement.classList.remove("black-theme");
    }

    // Apply color theme
    const themeColor = settings.themeColor || "turquoise";
    document.documentElement.setAttribute("data-theme-color", themeColor);

    // Apply custom color if selected
    const customColor = settings.customColors?.find((c) => c.id === themeColor);
    if (customColor) {
      document.documentElement.style.setProperty("--primary", customColor.hex);
    } else {
      document.documentElement.style.removeProperty("--primary");
    }

    // Apply light theme wallpaper
    const isDarkTheme = document.documentElement.classList.contains("dark") || document.documentElement.classList.contains("black-theme");
    if (!isDarkTheme && settings.lightWallpaper) {
      document.body.style.backgroundImage = `url(${settings.lightWallpaper})`;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundPosition = "center";
      document.body.style.backgroundAttachment = "fixed";
    } else {
      document.body.style.backgroundImage = "";
    }

    // Apply RTL for Arabic
    document.documentElement.dir = settings.appLanguage === "ar" ? "rtl" : "ltr";
  }, [settings]);

  useEffect(() => {
    if (!ipcRenderer) return;

    const handleProgress = (event: any, data: any) => {
      setTasks((prev) => {
        // If the language is ignored, mark it as ignored so the user understands why it was skipped
        if (data.status === 'ignored_language') {
          return prev.map((t) => (t.id === data.id ? { ...t, status: 'ignored', error: 'Langue non configurée' } : t));
        }
        
        return prev.map((t) => (t.id === data.id ? { ...t, ...data } : t));
      });
    };

    ipcRenderer.on("download-progress", handleProgress);
    return () => {
      ipcRenderer.removeListener("download-progress", handleProgress);
    };
  }, []);

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const addTask = (url: string, type: "cbz" | "images" = "cbz") => {
    addTasks([url], type);
  };

  const addTasks = async (urls: string[], type: "cbz" | "images" = "cbz") => {
    for (const url of urls) {
      if (type === "images") {
        const id = Math.random().toString(36).substring(2, 9);
        // Image Board Mode
        let tag = "unknown_tag";
        const tagMatch = url.match(/tags=([^&]+)/i);
        if (tagMatch) {
          tag = decodeURIComponent(tagMatch[1]).replace(/\+/g, " ");
        }

        const initialTask: DownloadTask = {
          id,
          url,
          type: "images",
          filename: `Downloading images for: ${tag}`,
          status: "queued",
          progress: 0,
          copyright: tag.split(" ")[0] || "unknown",
          character: tag,
        };

        setTasks((prev) => [initialTask, ...prev]);
        
        if (ipcRenderer) {
          ipcRenderer.send("start-download", { task: initialTask, settings: settingsRef.current });
        } else {
          simulateImageProcess(initialTask.id, initialTask.copyright!, initialTask.character!, 10);
        }

      } else {
        // CBZ Mode
        
        // Check if it's an artist/tag page that needs expanding
        let urlsToProcess = [url];
        
        if (ipcRenderer && (url.includes('/artist/') || url.includes('/tag/') || url.includes('/search/'))) {
          try {
            const galleryLinks = await ipcRenderer.invoke('fetch-gallery-links', url);
            if (galleryLinks && galleryLinks.length > 0) {
              urlsToProcess = galleryLinks;
            }
          } catch (e) {
            console.error("Failed to fetch gallery links", e);
          }
        }

        urlsToProcess.forEach(galleryUrl => {
          const id = Math.random().toString(36).substring(2, 9);
          let category = "Misc";
          
          // Optimistic category extraction for the UI (will be overwritten by the real scraper in Electron)
          try {
            const match = galleryUrl.match(/\/(?:artist|group|parody|character|tag)\/([^/]+)/i);
            if (match) {
              category = decodeURIComponent(match[1]).replace(/[-_ ]+/g, "-").replace(/\b\w/g, c => c.toUpperCase());
            }
          } catch (e) {}
          
          const currentSettings = settingsRef.current;
          const configuredLangs = currentSettings.languages || [];
          const availableLangs = configuredLangs.length > 0 ? configuredLangs.map(l => l.id) : ["other"];
          
          // Try to detect language from URL or tags (simplified for now)
          let lang = undefined;
          if (galleryUrl.toLowerCase().includes('french') || galleryUrl.toLowerCase().includes('francais')) {
            lang = "fr";
          } else if (galleryUrl.toLowerCase().includes('english')) {
            lang = "en";
          } else if (galleryUrl.toLowerCase().includes('turkish')) {
            lang = "tr";
          }

          const initialTask: DownloadTask = {
            id,
            url: galleryUrl,
            type: "cbz",
            filename: `Gallery from ${new URL(galleryUrl).hostname}`,
            status: "queued",
            progress: 0,
            language: lang,
            category,
          };

          setTasks((prev) => [initialTask, ...prev]);
          
          if (ipcRenderer) {
            ipcRenderer.send("start-download", { task: initialTask, settings: settingsRef.current });
          } else {
            simulateProcess(initialTask.id, initialTask.filename, initialTask.language!, initialTask.category!);
          }
        });
      }
    }
  };

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const clearCompleted = () => {
    setTasks((prev) =>
      prev.filter((t) => t.status !== "completed" && t.status !== "error" && t.status !== "ignored"),
    );
  };

  const simulateImageProcess = (id: string, copyright: string, character: string, totalImages: number) => {
    const updateTask = (updates: Partial<DownloadTask>) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      );
    };

    updateTask({ status: "downloading_images", progress: 0, downloadedCount: 0 });

    let current = 0;
    const downloadInterval = setInterval(() => {
      current += 1; // Download 1 image at a time to show per-file progress
      
      // Simulate collision & rename silently
      const isCollision = Math.random() > 0.8;
      const isDifferentSize = Math.random() > 0.5;
      let fileName = `image_${current.toString().padStart(3, '0')}.jpg`;
      
      if (isCollision && isDifferentSize) {
        fileName = `image_${current.toString().padStart(3, '0')}_${Math.floor(Math.random() * 1000)}.jpg`;
      }

      if (current >= totalImages) {
        clearInterval(downloadInterval);
        
        const currentSettings = settingsRef.current;
        const baseDir = currentSettings.imageBoardDirectory || "C:\\SnapCBZ\\ImageBoards";
        
        // Final Path: [BaseDir]\[Copyright]\[Character]\
        const dir = `${baseDir}\\${copyright}\\${character}`;

        updateTask({
          status: "completed",
          progress: 100,
          downloadedCount: current,
          currentFile: fileName,
          finalPath: dir,
        });
      } else {
        updateTask({
          progress: (current / totalImages) * 100,
          downloadedCount: current,
          currentFile: fileName,
        });
      }
    }, 150); // Update faster to show individual files
  };

  const simulateProcess = (id: string, filename: string, language: string, category: string) => {
    const updateTask = (updates: Partial<DownloadTask>) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      );
    };

    setTimeout(() => updateTask({ status: "downloading", progress: 20 }), 500);
    setTimeout(() => updateTask({ progress: 60 }), 1500);
    setTimeout(() => updateTask({ status: "extracting", progress: 75 }), 2500);
    setTimeout(() => updateTask({ status: "converting", progress: 90 }), 3500);

    setTimeout(() => {
      setTasks((prev) => {
        const task = prev.find((t) => t.id === id);
        if (!task) return prev;

        const currentSettings = settingsRef.current;
        const baseDir =
          currentSettings.directories[language] ||
          currentSettings.directories.other ||
          "C:\\SnapCBZ\\Other";
        
        // Final Path: [LangDir]\[Category]\[Filename]
        const dir = `${baseDir}\\${category}`;

        // Simulate collision & rename silently
        const isCollision = Math.random() > 0.7;
        const isDifferentSize = Math.random() > 0.5;
        let finalFilename = filename;
        
        if (isCollision && isDifferentSize) {
          finalFilename = filename.replace('.cbz', `_${Math.floor(Math.random() * 1000)}.cbz`);
        }

        return prev.map((t) =>
          t.id === id
            ? {
                ...t,
                status: "completed",
                progress: 100,
                finalPath: `${dir}\\${finalFilename}`,
              }
            : t,
        );
      });
    }, 4500);
  };

  return (
    <AppContext.Provider
      value={{
        settings,
        updateSettings,
        tasks,
        addTask,
        addTasks,
        removeTask,
        clearCompleted,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppStore = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppStore must be used within AppProvider");
  return context;
};
