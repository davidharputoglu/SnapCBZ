import React, { useState, useEffect } from "react";
import { Info, ShieldAlert, RefreshCw, Download, CheckCircle2, AlertCircle } from "lucide-react";
import { useTranslation } from "../translations";

// Helper to safely use electron ipcRenderer
const getIpcRenderer = () => {
  if (typeof window !== "undefined" && window.require) {
    try {
      const { ipcRenderer } = window.require("electron");
      return ipcRenderer;
    } catch (e) {
      return null;
    }
  }
  return null;
};

export const AboutView: React.FC = () => {
  const { t } = useTranslation();
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error"
  >("idle");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  const ipcRenderer = getIpcRenderer();

  useEffect(() => {
    if (!ipcRenderer) return;

    const handleUpdateAvailable = () => setUpdateStatus("available");
    const handleUpdateNotAvailable = () => setUpdateStatus("not-available");
    const handleUpdateDownloaded = () => setUpdateStatus("downloaded");
    const handleDownloadProgress = (_event: any, percent: number) => {
      setUpdateStatus("downloading");
      setDownloadProgress(percent);
    };
    const handleUpdateError = (_event: any, message: string) => {
      setUpdateStatus("error");
      setErrorMessage(message);
    };

    ipcRenderer.on("update_available", handleUpdateAvailable);
    ipcRenderer.on("update_not_available", handleUpdateNotAvailable);
    ipcRenderer.on("update_downloaded", handleUpdateDownloaded);
    ipcRenderer.on("download_progress", handleDownloadProgress);
    ipcRenderer.on("update_error", handleUpdateError);

    return () => {
      ipcRenderer.removeAllListeners("update_available");
      ipcRenderer.removeAllListeners("update_not_available");
      ipcRenderer.removeAllListeners("update_downloaded");
      ipcRenderer.removeAllListeners("download_progress");
      ipcRenderer.removeAllListeners("update_error");
    };
  }, [ipcRenderer]);

  const checkForUpdates = () => {
    if (!ipcRenderer) {
      setUpdateStatus("error");
      setErrorMessage(t("about_update_web_error"));
      return;
    }
    setUpdateStatus("checking");
    ipcRenderer.send("check_for_updates");
  };

  const restartApp = () => {
    if (ipcRenderer) {
      ipcRenderer.send("restart_app");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 h-full flex flex-col">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-3">
          <Info className="w-8 h-8 text-primary" />
          {t("about_title")}
        </h1>
        <p className="text-muted-foreground">{t("about_subtitle")}</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 overflow-auto pb-8">
        {/* App Info & Updates */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary font-bold text-2xl">
                S
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">SnapCBZ</h2>
                <p className="text-sm text-muted-foreground">Version 0.0.1</p>
                <p className="text-xs text-muted-foreground mt-1">{t("created_by")} David HARPUTOGLU</p>
              </div>
            </div>

            <div className="pt-6 border-t border-border">
              <h3 className="text-sm font-medium text-foreground mb-4">{t("about_updates")}</h3>
              
              {updateStatus === "idle" || updateStatus === "not-available" || updateStatus === "error" ? (
                <button
                  onClick={checkForUpdates}
                  className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  {t("about_check_updates")}
                </button>
              ) : null}

              {updateStatus === "checking" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {t("about_checking")}
                </div>
              )}

              {updateStatus === "available" && (
                <div className="flex items-center gap-2 text-sm text-primary justify-center py-2">
                  <Download className="w-4 h-4 animate-bounce" />
                  {t("about_update_available")}
                </div>
              )}

              {updateStatus === "downloading" && (
                <div className="space-y-2 py-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("about_downloading")}</span>
                    <span>{Math.round(downloadProgress)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {updateStatus === "downloaded" && (
                <button
                  onClick={restartApp}
                  className="w-full py-2.5 px-4 bg-emerald-500 text-white rounded-xl font-medium text-sm hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {t("about_install_restart")}
                </button>
              )}

              {updateStatus === "not-available" && (
                <p className="text-xs text-center text-muted-foreground mt-3 flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {t("about_up_to_date")}
                </p>
              )}

              {updateStatus === "error" && (
                <p className="text-xs text-center text-red-500 mt-3 flex items-center justify-center gap-1">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate" title={errorMessage}>{errorMessage || t("about_update_error")}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Legal & Disclaimer */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              {t("about_disclaimer_title")}
            </h2>
            <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground space-y-4">
              <p>
                <strong>SnapCBZ</strong> {t("about_disclaimer_p1")}
              </p>
              <div>
                <strong className="text-foreground">{t("about_disclaimer_h1")}</strong>
                <p>{t("about_disclaimer_p2")}</p>
              </div>
              <div>
                <strong className="text-foreground">{t("about_disclaimer_h2")}</strong>
                <p>{t("about_disclaimer_p3")}</p>
              </div>
              <div>
                <strong className="text-foreground">{t("about_disclaimer_h3")}</strong>
                <p>{t("about_disclaimer_p4")}</p>
              </div>
              <p className="text-red-500 font-medium">
                {t("about_disclaimer_warning")}
              </p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-foreground mb-4">MIT License</h2>
            <div className="text-xs text-muted-foreground font-mono whitespace-pre-wrap bg-muted/50 p-4 rounded-xl overflow-x-auto">
{`Copyright (c) 2026 David HARPUTOGLU

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
