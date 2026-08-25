import React, { useEffect, useState } from "react";
import { AppSettings, LcuStatusDto, RecordingItem, RecordingTelemetry, StorageUsage } from "./types";
import { api } from "./services/tauriApi";
import { Navbar } from "./components/layout/Navbar";
import { StatusBanner } from "./components/dashboard/StatusBanner";
import { LiveGameCard } from "./components/dashboard/LiveGameCard";
import { RecordingsGallery } from "./components/recordings/RecordingsGallery";
import { SettingsPanel } from "./components/settings/SettingsPanel";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"dashboard" | "recordings" | "settings">("dashboard");
  const [lcuStatus, setLcuStatus] = useState<LcuStatusDto | null>(null);
  const [telemetry, setTelemetry] = useState<RecordingTelemetry | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);

  const refreshData = async () => {
    try {
      const [lcu, tel, stor, recs, setts] = await Promise.all([
        api.getLcuStatus(),
        api.getRecorderTelemetry(),
        api.getStorageUsage(),
        api.getRecordings(),
        settings ? Promise.resolve(settings) : api.getSettings(),
      ]);

      setLcuStatus(lcu);
      setTelemetry(tel);
      setStorageUsage(stor);
      setRecordings(recs);
      if (!settings && setts) {
        setSettings(setts);
      }
    } catch (e) {
      console.error("Data refresh error:", e);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-hextech-dark text-slate-100 flex flex-col selection:bg-hextech-blue selection:text-black">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        lcuStatus={lcuStatus}
        telemetry={telemetry}
        settings={settings}
        onUpdateSettings={setSettings}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 overflow-y-auto">
        {activeTab === "dashboard" && (
          <div className="space-y-6 animate-fadeIn">
            <StatusBanner
              lcuStatus={lcuStatus}
              telemetry={telemetry}
              settings={settings}
              storageUsage={storageUsage}
              onRefresh={refreshData}
            />
            <LiveGameCard lcuStatus={lcuStatus} telemetry={telemetry} />
          </div>
        )}

        {activeTab === "recordings" && (
          <div className="animate-fadeIn">
            <RecordingsGallery recordings={recordings} onRefresh={refreshData} />
          </div>
        )}

        {activeTab === "settings" && (
          <div className="animate-fadeIn">
            <SettingsPanel settings={settings} onSaveSettings={setSettings} />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
