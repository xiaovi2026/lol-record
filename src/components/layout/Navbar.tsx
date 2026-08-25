import React from "react";
import { AppSettings, LcuStatusDto, RecordingTelemetry } from "../../types";
import {
  Activity,
  FolderOpen,
  Radio,
  Settings as SettingsIcon,
  Video,
  Zap,
} from "lucide-react";
import { api } from "../../services/tauriApi";

interface NavbarProps {
  activeTab: "dashboard" | "recordings" | "settings";
  setActiveTab: (tab: "dashboard" | "recordings" | "settings") => void;
  lcuStatus: LcuStatusDto | null;
  telemetry: RecordingTelemetry | null;
  settings: AppSettings | null;
  onUpdateSettings: (newSettings: AppSettings) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  lcuStatus,
  telemetry,
  settings,
  onUpdateSettings,
}) => {
  const isRecording = telemetry?.state === "Recording";
  const isLcuConnected = lcuStatus?.isConnected ?? false;

  const toggleAutoRecord = () => {
    if (!settings) return;
    const updated = {
      ...settings,
      automation: {
        ...settings.automation,
        autoRecord: !settings.automation.autoRecord,
      },
    };
    onUpdateSettings(updated);
    api.saveSettings(updated);
  };

  const getPhaseText = (phase: string) => {
    switch (phase) {
      case "InProgress":
        return "对局进行中 (录制中)";
      case "ChampSelect":
        return "英雄选择中";
      case "ReadyCheck":
        return "对局匹配确认";
      case "Matchmaking":
        return "排队中";
      case "Lobby":
        return "房间准备中";
      case "EndOfGame":
      case "WaitingForStats":
        return "对局结算中";
      default:
        return "客户端待机";
    }
  };

  return (
    <header className="h-16 border-b border-hextech-border bg-hextech-card/90 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-50">
      {/* Brand Title */}
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-hextech-blue to-hextech-blueDark flex items-center justify-center shadow-glow">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-base tracking-wider bg-gradient-to-r from-hextech-gold via-slate-100 to-hextech-blue bg-clip-text text-transparent">
              LoL Record
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-hextech-blue/10 text-hextech-blue font-mono border border-hextech-blue/30">
              v0.1.1
            </span>
          </div>
          <p className="text-[11px] text-slate-400">英雄联盟无感录像与自动导出系统</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="flex items-center space-x-1 bg-hextech-dark/60 p-1 rounded-xl border border-hextech-border/80">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === "dashboard"
              ? "bg-hextech-blue/20 text-hextech-blue border border-hextech-blue/40 shadow-glow"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>仪表盘</span>
        </button>

        <button
          onClick={() => setActiveTab("recordings")}
          className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === "recordings"
              ? "bg-hextech-blue/20 text-hextech-blue border border-hextech-blue/40 shadow-glow"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          }`}
        >
          <Video className="w-4 h-4" />
          <span>录像库</span>
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === "settings"
              ? "bg-hextech-blue/20 text-hextech-blue border border-hextech-blue/40 shadow-glow"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
          <span>系统设置</span>
        </button>
      </nav>

      {/* Status & Quick Actions */}
      <div className="flex items-center space-x-4">
        {/* LCU Status Indicator */}
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-hextech-dark/80 border border-hextech-border text-xs">
          <div
            className={`w-2 h-2 rounded-full ${
              isLcuConnected
                ? isRecording
                  ? "bg-red-500 animate-ping"
                  : "bg-emerald-400 shadow-[0_0_8px_#34d399]"
                : "bg-amber-400 animate-pulse"
            }`}
          />
          <span className="text-slate-300 font-mono text-[11px]">
            {isLcuConnected ? getPhaseText(lcuStatus?.phase || "None") : "等待 LOL 客户端启动"}
          </span>
        </div>

        {/* Quick Auto-Record Toggle */}
        <button
          onClick={toggleAutoRecord}
          title="点击切换自动无感录像开关"
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
            settings?.automation.autoRecord
              ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-400 hover:bg-emerald-900/50"
              : "bg-slate-800/40 border-slate-700 text-slate-400 hover:bg-slate-800"
          }`}
        >
          <Radio className={`w-3.5 h-3.5 ${settings?.automation.autoRecord ? "animate-pulse" : ""}`} />
          <span>{settings?.automation.autoRecord ? "自动录制已开启" : "自动录制已暂停"}</span>
        </button>

        {/* Open Folder Action */}
        <button
          onClick={() => api.openRecordingsFolder()}
          title="打开录像存放文件夹"
          className="p-2 rounded-lg bg-hextech-dark hover:bg-hextech-border/60 text-slate-300 hover:text-hextech-gold border border-hextech-border transition-all"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
