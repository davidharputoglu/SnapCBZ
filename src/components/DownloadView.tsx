import React, { useState } from "react";
import {
  Download,
  Link as LinkIcon,
  FileArchive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  RefreshCw,
  Globe2,
  FolderOpen,
  XCircle,
} from "lucide-react";
import { useAppStore, DownloadTask } from "../store";
import { useTranslation } from "../translations";

export const DownloadView: React.FC = () => {
  const { tasks, addTasks, removeTask, cancelTask, clearCompleted } = useAppStore();
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
              onCancel={() => cancelTask(task.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

const TaskCard: React.FC<{ task: DownloadTask; onRemove: () => void; onCancel: () => void }> = ({
  task,
  onRemove,
  onCancel,
}) => {
  const { settings, resumeTask } = useAppStore();
  const { t } = useTranslation();

  const translateDynamicString = (str: string | undefined) => {
    if (!str) return "";
    if (str === "Language not configured") return t("error_lang_not_configured" as any);
    if (str === "Cancelled by user") return t("error_cancelled" as any);
    if (str === "Scraping cancelled by user") return t("error_scraping_cancelled" as any);
    if (str === "Download cancelled by user") return t("error_dl_cancelled" as any);
    if (str === "Cloudflare window closed by user") return t("error_cf_closed" as any);
    if (str === "No images found on this page.") return t("error_no_images" as any);
    if (str === "Cannot download images. The site blocks access or requires a Referer.") return t("error_dl_blocked" as any);
    if (str === "status_scraping_site" || str === "Scraping site...") return t("status_scraping_site" as any);
    if (str === "Please wait or solve the captcha if necessary...") return t("cf_wait" as any);
    if (str === "status_extracting_html" || str === "Extracting HTML...") return t("status_extracting_html" as any);
    if (str === "status_parsing_html" || str === "Parsing HTML...") return t("status_parsing_html" as any) || "Parsing HTML...";
    if (str === "status_extracting_html_cdp" || str === "Extracting HTML (CDP)...") return t("status_extracting_html_cdp" as any) || "Extracting HTML (CDP)...";
    if (str === "status_extracting_html_fallback" || str === "Extracting HTML (fallback)...") return t("status_extracting_html_fallback" as any);
    if (str === "status_extracting_html_safe" || str === "Extracting HTML (safe fallback)...") return t("status_extracting_html_safe" as any);
    if (str === "status_extracting_metadata" || str === "Extracting metadata...") return t("status_extracting_metadata" as any) || "Extracting metadata...";
    if (str === "Extracting image data..." || str === "status_extracting_image_data") return t("status_extracting_image_data" as any) || "Extracting image data...";
    
    if (str === "status_clearing_cookies" || str === "Access denied. Clearing cookies and retrying...") return t("status_clearing_cookies" as any) || "Access denied. Clearing cookies and retrying...";
    if (str === "status_clearing_cookies_bypass" || str === "Clearing cookies to bypass block...") return t("status_clearing_cookies_bypass" as any) || "Clearing cookies to bypass block...";
    if (str === "status_executing_js_chapters" || str === "Executing JavaScript to find chapters...") return t("status_executing_js_chapters" as any) || "Executing JavaScript to find chapters...";
    if (str === "status_extraction_stuck" || str === "Extraction stuck. Reloading...") return t("status_extraction_stuck" as any) || "Extraction stuck. Reloading...";
    
    if (str.startsWith("Retrying HTML extraction")) {
      const time = str.match(/\d+/)?.[0] || "0";
      return t("status_retrying_html" as any, { time });
    }
    
    if (str.startsWith("Timeout waiting for Cloudflare bypass")) return t("error_cf_timeout" as any);
    
    if (str === "Empty buffer") return t("error_empty_buffer" as any);
    
    if (str === "Unknown") return t("status_unknown" as any);
    if (str === "Gallery") return t("status_gallery" as any);
    if (str === "Analyzing links & filtering...") return t("status_analyzing" as any);
    
    const downloadingImagesMatch = str.match(/^Downloading images for: (.*)$/);
    if (downloadingImagesMatch) return t("status_downloading_images_tag" as any, { tag: downloadingImagesMatch[1] });

    const galleryFromMatch = str.match(/^Gallery from (.*)$/);
    if (galleryFromMatch) return t("status_gallery_from" as any, { hostname: galleryFromMatch[1] });

    const imagesMatch = str.match(/^Images: (.*)$/);
    if (imagesMatch) return t("status_images" as any, { name: imagesMatch[1] === 'Unknown' ? t("status_unknown" as any) : imagesMatch[1] });

    if (str === "No links found. Cloudflare might have blocked access or the page is empty.") return t("error_no_links_cf" as any);
    
    const parseErrorMatch = str.match(/^Parse error: (.*)$/);
    if (parseErrorMatch) return t("error_parse" as any, { path: parseErrorMatch[1] });

    const httpErrorMatch = str.match(/^HTTP error! status: (.*)$/);
    if (httpErrorMatch) return t("error_http" as any, { status: httpErrorMatch[1] });

    const siteErrorMatch = str.match(/^Site error: (.*)$/);
    if (siteErrorMatch) return t("error_site" as any, { title: siteErrorMatch[1] });
    
    const nhentaiErrorMatch = str.match(/^Error parsing nhentai\.net: (.*)$/);
    if (nhentaiErrorMatch) return t("error_nhentai" as any, { message: nhentaiErrorMatch[1] });
    
    const noLinksMatch = str.match(/^No links found\. Title: "(.*)"\. Content: "(.*)"$/);
    if (noLinksMatch) return t("error_no_links" as any, { title: noLinksMatch[1], content: noLinksMatch[2] });
    
    const cf403Match = str.match(/^Access denied \(Error 403\)\. The site (.*) uses Cloudflare protection which blocks the application\.$/);
    if (cf403Match) return t("error_403_cf" as any, { hostname: cf403Match[1] });
    
    const scrapingPageMatch = str.match(/^Scraping links \(page (\d+)\)\.\.\.$/);
    if (scrapingPageMatch) return t("status_scraping_page" as any, { page: scrapingPageMatch[1] });
    
    const bypassingCfMatch = str.match(/^Bypassing Cloudflare \((\d+)s\)\.\.\.$/);
    if (bypassingCfMatch) return t("status_bypassing_cf" as any, { time: bypassingCfMatch[1] });
    
    const loadingPageMatch = str.match(/^Loading page \((\d+)s\)\.\.\.$/);
    if (loadingPageMatch) return t("status_loading_page" as any, { time: loadingPageMatch[1] });
    
    const waitingMatch = str.match(/^Waiting for window response \((\d+)s\)\.\.\.$/);
    if (waitingMatch) return t("status_waiting_window" as any, { time: waitingMatch[1] });
    
    const retryingHtmlMatch = str.match(/^Retrying HTML extraction \((\d+)s\)\.\.\.$/);
    if (retryingHtmlMatch) return t("status_retrying_html" as any, { time: retryingHtmlMatch[1] });
    
    if (str === "status_logging_in" || str === "Logging in...") return t("status_logging_in" as any);
    if (str === "status_cf_init" || str === "Initializing Cloudflare bypass...") return t("status_cf_init" as any);
    if (str === "status_fetching_fast" || str === "Fetching HTML (fast)...") return t("status_fetching_fast" as any);
    if (str === "status_fetching_existing" || str === "Fetching HTML via existing window...") return t("status_fetching_existing" as any);
    if (str === "status_fetching_safe" || str === "Fetching HTML (safe fallback)...") return t("status_fetching_safe" as any);
    if (str === "status_queued_scraping" || str === "Queued for scraping...") return t("status_queued_scraping" as any);
    
    return str;
  };

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
        return t("status_ignored" as any);
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
              title={translateDynamicString(task.filename)}
            >
              {translateDynamicString(task.filename)}
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
          {task.status !== "completed" && task.status !== "error" && task.status !== "ignored" ? (
            <button
              onClick={onCancel}
              className="p-2 text-muted-foreground hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30 rounded-lg transition-colors"
              title="Cancel task"
            >
              <XCircle className="w-5 h-5" />
            </button>
          ) : (
            <div className="flex items-center">
              {(task.status === "error" || task.status === "ignored" || task.status === "completed") && (
                <button
                  onClick={() => resumeTask(task.id)}
                  className="p-2 text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors"
                  title={task.status === "completed" ? "Rescan for new images" : "Retry task"}
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={onRemove}
                className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                title="Remove task"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          )}
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
            {translateDynamicString(task.error)}
          </div>
        )}
      </div>
    </div>
  );
};
