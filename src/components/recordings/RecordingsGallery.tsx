import React, { useState } from "react";
import { RecordingItem } from "../../types";
import {
  Clock,
  Film,
  FolderOpen,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import { api } from "../../services/tauriApi";
import { VideoPlayerModal } from "./VideoPlayerModal";

interface RecordingsGalleryProps {
  recordings: RecordingItem[];
  onRefresh: () => void;
}

export const RecordingsGallery: React.FC<RecordingsGalleryProps> = ({ recordings, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterQueue, setFilterQueue] = useState<string>("all");
  const [filterResult, setFilterResult] = useState<string>("all");
  const [selectedVideo, setSelectedVideo] = useState<RecordingItem | null>(null);

  const formatBytes = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "--";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分${s}秒`;
  };

  const handleDelete = async (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("确定要删除该录像文件吗？（该操作不可撤销）")) {
      try {
        await api.deleteRecording(filePath);
        onRefresh();
      } catch (err) {
        console.error("Failed to delete recording:", err);
      }
    }
  };

  const handleOpenFolder = (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    api.openFileInFolder(filePath);
  };

  const filtered = recordings.filter((item) => {
    const meta = item.metadata;
    const matchSearch =
      item.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (meta?.championName && meta.championName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (meta?.queueName && meta.queueName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchQueue =
      filterQueue === "all" ||
      (meta?.queueName && meta.queueName.toLowerCase().includes(filterQueue.toLowerCase()));

    const matchResult =
      filterResult === "all" ||
      (filterResult === "victory" && meta?.win === true) ||
      (filterResult === "defeat" && meta?.win === false);

    return matchSearch && matchQueue && matchResult;
  });

  return (
    <div className="space-y-5">
      {/* Search and Filters Header */}
      <div className="hextech-card p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜索英雄名称、对局模式或文件名..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-hextech-dark/90 border border-hextech-border text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-hextech-gold transition-all"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center space-x-3 text-xs">
          <select
            value={filterQueue}
            onChange={(e) => setFilterQueue(e.target.value)}
            className="px-3 py-2 rounded-xl bg-hextech-dark/90 border border-hextech-border text-slate-300 focus:outline-none focus:border-hextech-gold"
          >
            <option value="all">全部模式</option>
            <option value="RankedSolo">单双排位</option>
            <option value="RankedFlex">灵活排位</option>
            <option value="ARAM">极地大乱斗</option>
            <option value="Normal">匹配模式</option>
          </select>

          <select
            value={filterResult}
            onChange={(e) => setFilterResult(e.target.value)}
            className="px-3 py-2 rounded-xl bg-hextech-dark/90 border border-hextech-border text-slate-300 focus:outline-none focus:border-hextech-gold"
          >
            <option value="all">胜负全部</option>
            <option value="victory">胜利 (Victory)</option>
            <option value="defeat">失败 (Defeat)</option>
          </select>

          <button
            onClick={() => api.openRecordingsFolder()}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-hextech-dark border border-hextech-border hover:border-hextech-gold/70 text-slate-300 hover:text-hextech-gold transition-all"
          >
            <FolderOpen className="w-4 h-4" />
            <span>打开文件夹</span>
          </button>
        </div>
      </div>

      {/* Recordings Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((item) => {
            const meta = item.metadata;
            const isVictory = meta ? meta.win : item.fileName.toLowerCase().includes("victory");

            return (
              <div
                key={item.filePath}
                onClick={() => setSelectedVideo(item)}
                className="hextech-card hextech-card-interactive p-4 rounded-2xl cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  {/* Card Header: Mode & Result Badge */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-hextech-dark border border-hextech-border text-slate-300 font-medium">
                      {meta?.queueName || "LoL 对局"}
                    </span>

                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        isVictory ? "hextech-badge-victory" : "hextech-badge-defeat"
                      }`}
                    >
                      {isVictory ? "胜利 Victory" : "失败 Defeat"}
                    </span>
                  </div>

                  {/* Thumbnail / Champion Info Banner */}
                  <div className="relative h-28 rounded-xl bg-gradient-to-r from-hextech-card to-hextech-dark border border-hextech-border/70 overflow-hidden flex items-center px-4 justify-between">
                    <div>
                      <h4 className="text-lg font-bold text-slate-100 group-hover:text-hextech-gold transition-all">
                        {meta?.championName || "英雄对局"}
                      </h4>
                      {meta && (
                        <p className="text-sm font-mono font-bold text-hextech-gold mt-0.5">
                          KDA: {meta.kills} / {meta.deaths} / {meta.assists}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-400 mt-1 flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-hextech-blue" />
                        <span>时长: {formatDuration(meta?.gameDurationSeconds)}</span>
                      </p>
                    </div>

                    <div className="w-11 h-11 rounded-full bg-hextech-dark/80 border border-hextech-gold/40 flex items-center justify-center text-hextech-gold shadow-goldGlow group-hover:scale-110 transition-transform">
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    </div>
                  </div>
                </div>

                {/* Footer details & Actions */}
                <div className="mt-4 pt-3 border-t border-hextech-border/60 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center space-x-2">
                    <Film className="w-3.5 h-3.5 text-slate-500" />
                    <span className="font-mono">{formatBytes(item.fileSizeBytes)}</span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={(e) => handleOpenFolder(item.filePath, e)}
                      title="在文件资源管理器中定位"
                      className="p-1.5 rounded-lg hover:bg-hextech-dark hover:text-hextech-gold text-slate-400 transition-all"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(item.filePath, e)}
                      title="删除该对局录像"
                      className="p-1.5 rounded-lg hover:bg-red-950/40 hover:text-red-400 text-slate-400 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="hextech-card p-12 rounded-2xl flex flex-col items-center justify-center text-center">
          <Film className="w-12 h-12 text-slate-600 mb-3" />
          <h3 className="text-base font-semibold text-slate-300">暂无匹配的录像文件</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            启动英雄联盟客户端并开始一局游戏，系统将在对局开始后自动起录并在对局结束后导出到录像库中。
          </p>
        </div>
      )}

      {/* Video Modal Player */}
      <VideoPlayerModal recording={selectedVideo} onClose={() => setSelectedVideo(null)} />
    </div>
  );
};
