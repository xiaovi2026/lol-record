import React, { useEffect, useState } from "react";
import { HighlightMarker, LcuStatusDto, RecordingTelemetry } from "../../types";
import {
  CheckCircle2,
  Flame,
  Gamepad2,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
} from "lucide-react";
import { api } from "../../services/tauriApi";

interface LiveGameCardProps {
  lcuStatus: LcuStatusDto | null;
  telemetry: RecordingTelemetry | null;
}

export const LiveGameCard: React.FC<LiveGameCardProps> = ({ lcuStatus, telemetry }) => {
  const [highlights, setHighlights] = useState<HighlightMarker[]>([]);
  const isRecording = telemetry?.state === "Recording";

  useEffect(() => {
    const fetchHighlights = async () => {
      if (isRecording || lcuStatus?.phase === "InProgress") {
        try {
          const list = await api.getLiveHighlights();
          setHighlights(list);
        } catch {
          // ignore
        }
      }
    };

    fetchHighlights();
    const timer = setInterval(fetchHighlights, 3000);
    return () => clearInterval(timer);
  }, [isRecording, lcuStatus?.phase]);

  const formatEventTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case "Multikill":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-500/40 flex items-center space-x-1"><Flame className="w-3 h-3 text-purple-400" /><span>多杀</span></span>;
      case "Baron":
      case "Dragon":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40 flex items-center space-x-1"><Trophy className="w-3 h-3 text-amber-400" /><span>史诗野怪</span></span>;
      case "Ace":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-500/40 flex items-center space-x-1"><Swords className="w-3 h-3 text-rose-400" /><span>团灭</span></span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950/80 text-blue-300 border border-blue-500/40">击杀</span>;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
      {/* Real-time In-game Events Stream */}
      <div className="lg:col-span-2 hextech-card p-5 rounded-2xl flex flex-col justify-between">
        <div className="flex items-center justify-between border-b border-hextech-border/50 pb-3">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-hextech-gold" />
            <h3 className="text-sm font-semibold text-slate-100">局内实时高光打点 (Live Events)</h3>
          </div>
          <span className="text-xs font-mono text-slate-400">Port :2999 In-Game API</span>
        </div>

        <div className="my-4 min-h-[160px] max-h-[220px] overflow-y-auto space-y-2 pr-1">
          {highlights.length > 0 ? (
            highlights.map((h, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-xl bg-hextech-dark/80 border border-hextech-border/70 flex items-center justify-between hover:border-hextech-gold/50 transition-all"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-xs font-mono text-hextech-blue bg-hextech-blue/10 px-2 py-0.5 rounded border border-hextech-blue/30">
                    {formatEventTime(h.timestampSec)}
                  </span>
                  <span className="text-xs font-medium text-slate-200">{h.description}</span>
                </div>
                <div>{getEventBadge(h.eventType)}</div>
              </div>
            ))
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center py-8 text-slate-500">
              <Gamepad2 className="w-8 h-8 text-slate-600 mb-2" />
              <p className="text-xs font-medium text-slate-400">对局开始后将自动捕获局内击杀/龙团/团灭等高光事件</p>
              <p className="text-[11px] text-slate-500 mt-1">导出的视频将附带专属时间戳打点标记</p>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-hextech-border/50 flex items-center justify-between text-xs text-slate-400">
          <span>打点事件数: <strong className="text-slate-200">{highlights.length}</strong></span>
          <span className="text-slate-400 text-[11px]">导出时自动生成同名 JSON 伴随数据</span>
        </div>
      </div>

      {/* System Features & Safety Assurance */}
      <div className="hextech-card p-5 rounded-2xl flex flex-col justify-between space-y-4">
        <div>
          <div className="flex items-center space-x-2 border-b border-hextech-border/50 pb-3">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-100">系统特性与反作弊安全</h3>
          </div>

          <div className="space-y-3 mt-4 text-xs text-slate-300">
            <div className="flex items-start space-x-2.5">
              <CheckCircle2 className="w-4 h-4 text-hextech-blue shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-100">零外部客户端依赖</strong>
                <p className="text-slate-400 text-[11px] mt-0.5">无需安装 OBS Studio，无需额外下载 FFmpeg，所有编码原生集成在单个二进制文件中。</p>
              </div>
            </div>

            <div className="flex items-start space-x-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-100">Vanguard 反作弊 100% 安全</strong>
                <p className="text-slate-400 text-[11px] mt-0.5">采用 Windows 官方图形捕获 API (WGC)，不注入游戏进程，零封号风险。</p>
              </div>
            </div>

            <div className="flex items-start space-x-2.5">
              <CheckCircle2 className="w-4 h-4 text-hextech-gold shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-100">全屏 / 无边框游戏支持</strong>
                <p className="text-slate-400 text-[11px] mt-0.5">DirectX 11 硬件表面捕获，完美杜绝录屏黑屏或卡顿丢帧。</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-hextech-dark/90 border border-hextech-border/80 text-[11px] text-slate-400 flex items-center justify-between">
          <span>后台守护进程</span>
          <span className="text-emerald-400 font-mono">Running (Tray)</span>
        </div>
      </div>
    </div>
  );
};
