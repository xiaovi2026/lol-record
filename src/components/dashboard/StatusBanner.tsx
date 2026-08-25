import React, { useState } from "react";
import { AppSettings, LcuStatusDto, RecordingTelemetry, StorageUsage } from "../../types";
import {
  Clock,
  HardDrive,
  Monitor,
  Play,
  Square,
  Wifi,
  WifiOff,
} from "lucide-react";
import { api } from "../../services/tauriApi";

interface StatusBannerProps {
  lcuStatus: LcuStatusDto | null;
  telemetry: RecordingTelemetry | null;
  settings: AppSettings | null;
  storageUsage: StorageUsage | null;
  onRefresh: () => void;
}

export const StatusBanner: React.FC<StatusBannerProps> = ({
  lcuStatus,
  telemetry,
  settings,
  storageUsage,
  onRefresh,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const isRecording = telemetry?.state === "Recording";

  const handleToggleManualRecord = async () => {
    try {
      setIsProcessing(true);
      if (isRecording) {
        await api.stopManualRecording();
      } else {
        await api.startManualRecording();
      }
      onRefresh();
    } catch (err) {
      console.error("Failed to toggle manual recording:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  const usedPercent = storageUsage
    ? Math.min(100, Math.round((storageUsage.totalRecordingsBytes / Math.max(1, storageUsage.maxQuotaBytes)) * 100))
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {/* 1. LCU Client Status Card */}
      <div className="hextech-card p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            LCU 客户端状态
          </span>
          {lcuStatus?.isConnected ? (
            <div className="flex items-center space-x-1 text-emerald-400 text-xs font-medium">
              <Wifi className="w-3.5 h-3.5" />
              <span>已连接</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1 text-amber-400 text-xs font-medium">
              <WifiOff className="w-3.5 h-3.5" />
              <span>未检测到客户端</span>
            </div>
          )}
        </div>

        <div className="my-4">
          {lcuStatus?.isConnected ? (
            <div>
              <div className="text-xl font-bold text-slate-100 flex items-center space-x-2">
                <span>{lcuStatus.summoner?.displayName || lcuStatus.summoner?.gameName || "召唤师"}</span>
                {lcuStatus.summoner?.summonerLevel && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-hextech-gold/20 text-hextech-gold border border-hextech-gold/40">
                    Lv.{lcuStatus.summoner.summonerLevel}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                端口: {lcuStatus.auth?.port} | 阶段: <span className="text-hextech-blue font-mono">{lcuStatus.phase}</span>
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-slate-300 font-medium">等待英雄联盟启动...</p>
              <p className="text-xs text-slate-500 mt-1">
                客户端启动后将自动获取 LCU 通信凭据并进入就绪状态。
              </p>
            </div>
          )}
        </div>

        <div className="text-[11px] text-slate-400 pt-2 border-t border-hextech-border/50 flex items-center justify-between">
          <span>无感监测生命周期</span>
          <span className="text-hextech-gold font-mono">LCU WAMP v1.0</span>
        </div>
      </div>

      {/* 2. Recording Telemetry & Control Card */}
      <div
        className={`hextech-card p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between border-2 transition-all ${
          isRecording ? "border-red-500/60 bg-red-950/10 shadow-glow" : "border-hextech-border"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              录像引擎
            </span>
            {isRecording && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white animate-pulse">
                REC
              </span>
            )}
          </div>

          <button
            onClick={handleToggleManualRecord}
            disabled={isProcessing}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              isRecording
                ? "bg-red-600 hover:bg-red-500 text-white shadow-[0_0_10px_#ef4444]"
                : "bg-hextech-gold hover:bg-hextech-goldHover text-black shadow-goldGlow"
            }`}
          >
            {isRecording ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>手动停止</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>手动起录</span>
              </>
            )}
          </button>
        </div>

        <div className="my-3 grid grid-cols-2 gap-3">
          <div>
            <span className="text-[11px] text-slate-400 flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-hextech-blue" />
              <span>录制时长</span>
            </span>
            <p className="text-2xl font-mono font-bold text-slate-100 mt-0.5">
              {formatSeconds(telemetry?.elapsedSeconds || 0)}
            </p>
          </div>

          <div>
            <span className="text-[11px] text-slate-400 flex items-center space-x-1">
              <Monitor className="w-3.5 h-3.5 text-hextech-gold" />
              <span>分辨率 & 帧率</span>
            </span>
            <p className="text-base font-mono font-semibold text-slate-200 mt-1">
              {settings?.video.resolution || "1080p"} @ {settings?.video.fps || 60} FPS
            </p>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 pt-2 border-t border-hextech-border/50 flex items-center justify-between">
          <span>编码引擎: <strong className="text-slate-200 uppercase">{settings?.video.encoder}</strong> ({settings?.video.codec})</span>
          <span>码率: <strong className="text-slate-200">{settings?.video.bitrateKbps} kbps</strong></span>
        </div>
      </div>

      {/* 3. Storage Usage & Quota Card */}
      <div className="hextech-card p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            录像存储空间
          </span>
          <div className="flex items-center space-x-1 text-slate-300 text-xs">
            <HardDrive className="w-3.5 h-3.5 text-hextech-gold" />
            <span>共 {storageUsage?.recordingCount || 0} 个对局</span>
          </div>
        </div>

        <div className="my-3">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {formatBytes(storageUsage?.totalRecordingsBytes || 0)}
            </span>
            <span className="text-xs text-slate-400">
              配额上限: {settings?.storage.maxStorageGb || 50} GB
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-slate-800 rounded-full mt-2 overflow-hidden border border-hextech-border">
            <div
              className={`h-full transition-all rounded-full ${
                usedPercent > 85 ? "bg-red-500" : usedPercent > 60 ? "bg-amber-400" : "bg-hextech-blue"
              }`}
              style={{ width: `${usedPercent}%` }}
            />
          </div>
        </div>

        <div className="text-[11px] text-slate-400 pt-2 border-t border-hextech-border/50 flex items-center justify-between">
          <span>自动清理老旧录像</span>
          <span className={settings?.storage.autoCleanup ? "text-emerald-400" : "text-slate-500"}>
            {settings?.storage.autoCleanup ? `保留 ${settings.storage.retentionDays} 天内` : "已关闭"}
          </span>
        </div>
      </div>
    </div>
  );
};
