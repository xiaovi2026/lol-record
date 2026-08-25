import React, { useRef } from "react";
import { RecordingItem } from "../../types";
import { Flame, Play, X } from "lucide-react";

interface VideoPlayerModalProps {
  recording: RecordingItem | null;
  onClose: () => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({ recording, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!recording) return null;

  const highlights = recording.metadata?.highlights || [];

  const jumpToTime = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, seconds - 2); // jump 2s prior
      videoRef.current.play();
    }
  };

  const formatEventTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
      <div className="hextech-card w-full max-w-5xl rounded-2xl overflow-hidden border border-hextech-gold/40 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 bg-hextech-dark/90 border-b border-hextech-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-100">{recording.fileName}</h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{recording.filePath}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Player & Timeline Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 flex-1 overflow-hidden bg-black">
          {/* Main Video Viewport */}
          <div className="lg:col-span-2 relative flex items-center justify-center bg-black min-h-[360px]">
            <video
              ref={videoRef}
              controls
              autoPlay
              className="w-full h-full max-h-[520px] object-contain"
              src={`asset://${recording.filePath}`}
            >
              您的浏览器不支持内嵌视频播放。
            </video>
          </div>

          {/* Highlights & Markers Sidebar */}
          <div className="p-4 bg-hextech-card flex flex-col justify-between border-l border-hextech-border overflow-y-auto">
            <div>
              <div className="flex items-center space-x-2 pb-3 border-b border-hextech-border/60">
                <Flame className="w-4 h-4 text-hextech-gold" />
                <h3 className="text-sm font-semibold text-slate-200">高光打点标记 ({highlights.length})</h3>
              </div>

              <div className="mt-3 space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {highlights.length > 0 ? (
                  highlights.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => jumpToTime(h.timestampSec)}
                      className="w-full text-left p-2.5 rounded-xl bg-hextech-dark/80 hover:bg-hextech-cardHover border border-hextech-border hover:border-hextech-gold/60 transition-all flex items-center justify-between group"
                    >
                      <div className="flex items-center space-x-2.5">
                        <span className="text-xs font-mono font-semibold text-hextech-blue bg-hextech-blue/10 px-2 py-0.5 rounded border border-hextech-blue/30 group-hover:bg-hextech-blue group-hover:text-black transition-all">
                          {formatEventTime(h.timestampSec)}
                        </span>
                        <span className="text-xs text-slate-300 group-hover:text-slate-100">{h.description}</span>
                      </div>
                      <Play className="w-3.5 h-3.5 text-slate-500 group-hover:text-hextech-gold" />
                    </button>
                  ))
                ) : (
                  <div className="text-center py-10 text-slate-500 text-xs">
                    该对局无特殊高光打点事件
                  </div>
                )}
              </div>
            </div>

            {recording.metadata && (
              <div className="pt-3 border-t border-hextech-border/60 text-xs text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>英雄 / 模式:</span>
                  <span className="text-slate-200">{recording.metadata.championName} ({recording.metadata.queueName})</span>
                </div>
                <div className="flex justify-between">
                  <span>战绩 KDA:</span>
                  <span className="text-hextech-gold font-mono font-bold">
                    {recording.metadata.kills}/{recording.metadata.deaths}/{recording.metadata.assists}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
