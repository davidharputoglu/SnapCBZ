import React, { useState } from "react";
import {
  Download,
  Link as LinkIcon,
  FileArchive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Globe2,
  FolderOpen,
} from "lucide-react";
import { useAppStore, DownloadTask } from "../store";
import { useTranslation } from "../translations";

export const DownloadView: React.FC = () => {
  const { tasks, addTasks, removeTask, clearCompleted } = useAppStore();
  const { t } = useTranslation();
  const [urls, setUrls] = useState("");
  const [mode, setMode] = useState<"cbz" | "images">("cbz");

  const handleDownload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urls.trim()) return;

    const urlList = urls
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    const validUrls = urlList.filter((u) => u.startsWith("http"));
    const invalidUrls = urlList.length - validUrls.length;

    if (validUrls.length === 0) {
      alert(t("alert_invalid_url"));
      return;
    }

    if (invalidUrls > 0) {
      alert(t("alert_skipped_urls", { count: invalidUrls }));
    }

    addTasks(validUrls, mode);
    setUrls("");
  };

  return (
    <div className="max-w-4xl mx-auto p-8 h-full flex flex-col">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          {t("dl_title")}
        </h1>
        <p className="text-muted-foreground mb-6">
          {mode === "cbz" ? t("dl_subtitle") : t("dl_subtitle_images")}
        </p>
        
        <div className="flex bg-muted p-1 rounded-xl w-fit">
          <button
            onClick={() => setMode("cbz")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === "cbz" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("mode_cbz")}
          </button>
          <button
            onClick={() => setMode("images")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === "images" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("mode_images")}
          </button>
        </div>
      </header>

      <form onSubmit={handleDownload} className="mb-8 flex flex-col gap-4">
        <div className="relative flex-1">
          <div className="absolute top-4 left-0 pl-4 flex items-center pointer-events-none">
            <LinkIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          <textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder={mode === "cbz" ? t("dl_placeholder") : t("dl_placeholder_images")}
            className="block w-full pl-11 pr-4 py-4 bg-card border border-border rounded-2xl text-foreground placeholder-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm min-h-[120px] resize-y"
            required
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-8 py-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-2xl shadow-sm transition-all flex items-center gap-2"
          >
            <Download className="w-5 h-5" />
            {urls.split(/[\n,]+/).filter(u => u.trim().startsWith("http")).length > 1 ? t("dl_button_all") : t("dl_button")}
          </button>
        </div>
      </form>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground">{t("dl_active_tasks")}</h2>
        {tasks.some(
          (t) => t.status === "completed" || t.status === "error" || t.status === "ignored",
        ) && (
          <button
            onClick={clearCompleted}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("dl_clear_completed")}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto space-y-4 pb-8">
        {tasks.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-muted-foreground bg-card/50 border border-dashed border-border rounded-3xl">
            <FileArchive className="w-12 h-12 mb-4 opacity-50" />
            <p>{t("dl_no_tasks")}</p>
            <p className="text-sm opacity-75 mt-1">
              {t("dl_paste_link")}
            </p>
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onRemove={() => removeTask(task.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

const TaskCard: React.FC<{ task: DownloadTask; onRemove: () => void }> = ({
  task,
  onRemove,
}) => {
  const { settings } = useAppStore();
  const { t } = useTranslation();

  const getStatusIcon = () => {
    switch (task.status) {
      case "completed":
        return <CheckCircle2 className="w-6 h-6 text-emerald-500" />;
      case "error":
      case "ignored":
        return <AlertCircle className="w-6 h-6 text-red-500" />;
      case "scraping":
        return <Globe2 className="w-6 h-6 text-primary animate-pulse" />;
      default:
        return <Loader2 className="w-6 h-6 text-primary animate-spin" />;
    }
  };

  const getStatusText = () => {
    switch (task.status) {
      case "queued":
        return t("status_queued");
      case "scraping":
        return t("status_scraping");
      case "downloading":
        return t("status_downloading");
      case "downloading_images":
        return t("status_downloading_images", { current: task.downloadedCount || 0, total: task.totalImages || 0 });
      case "extracting":
        return t("status_extracting");
      case "converting":
        return t("status_converting");
      case "completed":
        return t("status_completed");
      case "error":
        return t("status_error");
      case "ignored":
        return "Ignoré";
    }
  };

  const getLanguageLabel = (langId?: string) => {
    if (!langId) return t("lang_unknown");
    if (langId === "other") return t("lang_other");
    
    const languages = settings.languages || [
      { id: "fr", name: "French (Français)" },
      { id: "en", name: "English" },
      { id: "tr", name: "Turkish (Türkçe)" },
    ];
    
    const lang = languages.find((l) => l.id === langId);
    return lang ? lang.name : langId;
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-muted rounded-xl">{getStatusIcon()}</div>
          <div>
            <h3
              className="font-semibold text-foreground truncate max-w-md"
              title={task.filename}
            >
              {task.filename}
            </h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <span>{getStatusText()}</span>
              {task.currentFile && task.status === "downloading_images" && (
                <span className="text-xs font-mono opacity-75 truncate max-w-[150px]">
                  {task.currentFile}
                </span>
              )}
              {task.language && (
                <>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span className="flex items-center gap-1 text-primary">
                    <Globe2 className="w-3 h-3" />
                    {getLanguageLabel(task.language)}
                  </span>
                </>
              )}
              {task.category && (
                <>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span className="flex items-center gap-1 text-primary">
                    <FolderOpen className="w-3 h-3" />
                    {task.category}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold text-foreground min-w-[3rem] text-right">
            {Math.round(task.progress)}%
          </span>
          <button
            onClick={onRemove}
            className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
            title="Remove task"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ease-out ${
              task.status === "error" || task.status === "ignored"
                ? "bg-red-500"
                : task.status === "completed"
                  ? "bg-emerald-500"
                  : "bg-primary"
            }`}
            style={{ width: `${task.progress}%` }}
          />
        </div>

        {task.status === "completed" && task.finalPath && (
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg font-mono break-all">
            {t("saved_to")} {task.finalPath}
          </div>
        )}

        {(task.status === "error" || task.status === "ignored") && task.error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 p-2 rounded-lg">
            {task.error}
          </div>
        )}
      </div>
    </div>
  );
};

