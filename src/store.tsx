import React, { createContext, useContext, useState, useEffect, useRef } from "react";

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
    | "error";
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

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const addTask = (url: string, type: "cbz" | "images" = "cbz") => {
    addTasks([url], type);
  };

  const addTasks = (urls: string[], type: "cbz" | "images" = "cbz") => {
    urls.forEach((url) => {
      const id = Math.random().toString(36).substring(2, 9);
      
      if (type === "images") {
        // Image Board Mode
        let tag = "unknown_tag";
        const tagMatch = url.match(/tags=([^&]+)/i);
        if (tagMatch) {
          tag = decodeURIComponent(tagMatch[1]).replace(/\+/g, " ");
        }

        const totalPages = Math.floor(Math.random() * 3) + 1; // 1 to 3 pages

        const initialTask: DownloadTask = {
          id,
          url,
          type: "images",
          filename: `Scanning: ${tag} (Page 1/${totalPages})...`,
          status: "scraping",
          progress: 0,
        };

        setTasks((prev) => [initialTask, ...prev]);

        let currentPage = 1;
        const scanInterval = setInterval(() => {
          currentPage++;
          if (currentPage <= totalPages) {
            setTasks((prev) => prev.map(t => 
              t.id === id ? { 
                ...t, 
                filename: `Scanning: ${tag} (Page ${currentPage}/${totalPages})...`, 
                progress: (currentPage / totalPages) * 100 
              } : t
            ));
          } else {
            clearInterval(scanInterval);
            
            // Remove the scraping task
            setTasks((prev) => prev.filter((t) => t.id !== id));
            
            // Simulate finding characters for this copyright
            const characters = ["iono (pokemon)", "jessie (pokemon)", "pokemon trainer", "unknown character"];
            const numItems = Math.floor(Math.random() * 3) + 1;
            const newTasks: DownloadTask[] = [];
            
            for (let i = 0; i < numItems; i++) {
              const newId = Math.random().toString(36).substring(2, 9);
              const char = characters[Math.floor(Math.random() * characters.length)];
              const totalImages = Math.floor(Math.random() * 40) + 10; // 10 to 50 images
              
              newTasks.push({
                id: newId,
                url,
                type: "images",
                filename: `Downloading images for: ${char}`,
                status: "queued",
                progress: 0,
                copyright: tag.split(" ")[0] || "pokemon", // Mock copyright
                character: char,
                downloadedCount: 0,
                totalImages,
              });
            }
            
            setTasks((prev) => [...newTasks, ...prev]);
            newTasks.forEach((task) => simulateImageProcess(task.id, task.copyright!, task.character!, task.totalImages!));
          }
        }, 1000);

      } else {
        // CBZ Mode
        let category = "Misc";
        const artistMatch = url.match(/\/(?:artist|group|parody|character|tag)\/([^/]+)/i);
        if (artistMatch) {
          category = artistMatch[1].replace(/[-_]/g, " ");
          category = category.replace(/\b\w/g, (c) => c.toUpperCase());
        } else {
          const parts = url.split('/').filter(Boolean);
          if (parts.length > 0) {
            category = parts[parts.length - 1];
          }
        }

        const totalPages = Math.floor(Math.random() * 4) + 2; // 2 to 5 pages

        const initialTask: DownloadTask = {
          id,
          url,
          type: "cbz",
          filename: `Scanning: ${category} (Page 1/${totalPages})...`,
          status: "scraping",
          progress: 0,
          category,
        };

        setTasks((prev) => [initialTask, ...prev]);

        let currentPage = 1;
        const scanInterval = setInterval(() => {
          currentPage++;
          if (currentPage <= totalPages) {
            setTasks((prev) => prev.map(t => 
              t.id === id ? { 
                ...t, 
                filename: `Scanning: ${category} (Page ${currentPage}/${totalPages})...`, 
                progress: (currentPage / totalPages) * 100 
              } : t
            ));
          } else {
            clearInterval(scanInterval);

            const currentSettings = settingsRef.current;
            const configuredLangs = currentSettings.languages || [];
            const availableLangs = configuredLangs.length > 0 ? configuredLangs.map(l => l.id) : ["other"];
            
            setTasks((prev) => prev.filter((t) => t.id !== id));
            
            const numItems = Math.floor(Math.random() * 8) + 4; // 4 to 11 items
            const newTasks: DownloadTask[] = [];
            
            for (let i = 0; i < numItems; i++) {
              const newId = Math.random().toString(36).substring(2, 9);
              const lang = availableLangs[Math.floor(Math.random() * availableLangs.length)];
              const filename = `${category} - Gallery ${Math.floor(Math.random() * 10000)}.cbz`;
              
              newTasks.push({
                id: newId,
                url,
                type: "cbz",
                filename,
                status: "queued",
                progress: 0,
                language: lang,
                category: category,
              });
            }
            
            setTasks((prev) => [...newTasks, ...prev]);
            newTasks.forEach((task) => simulateProcess(task.id, task.filename, task.language!, task.category!));
          }
        }, 1200);
      }
    });
  };

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const clearCompleted = () => {
    setTasks((prev) =>
      prev.filter((t) => t.status !== "completed" && t.status !== "error"),
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
