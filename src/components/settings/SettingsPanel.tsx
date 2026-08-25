import React, { useEffect, useState } from "react";
import { AppSettings, AudioDevicesDto, GpuEncoderInfo } from "../../types";
import {
  AudioWaveform,
  Check,
  Cpu,
  FolderOpen,
  HardDrive,
  Mic,
  Monitor,
  Save,
  Sliders,
  Tag,
  Volume2,
} from "lucide-react";
import { api } from "../../services/tauriApi";

interface SettingsPanelProps {
  settings: AppSettings | null;
  onSaveSettings: (newSettings: AppSettings) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onSaveSettings }) => {
  const [formData, setFormData] = useState<AppSettings | null>(settings);
  const [audioDevices, setAudioDevices] = useState<AudioDevicesDto>({ outputDevices: [], inputDevices: [] });
  const [gpuInfo, setGpuInfo] = useState<GpuEncoderInfo | null>(null);
  const [templatePreview, setTemplatePreview] = useState<string>("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"video" | "audio" | "export" | "storage" | "system">("video");

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  useEffect(() => {
    // Fetch system devices & GPU specs
    api.getAudioDevices().then(setAudioDevices).catch(console.error);
    api.getGpuEncoderInfo().then(setGpuInfo).catch(console.error);
  }, []);

  useEffect(() => {
    if (formData?.storage.filenameTemplate) {
      api.testNamingTemplate(formData.storage.filenameTemplate)
        .then(setTemplatePreview)
        .catch(console.error);
    }
  }, [formData?.storage.filenameTemplate]);

  if (!formData) return null;

  const handleSave = async () => {
    try {
      await api.saveSettings(formData);
      onSaveSettings(formData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  };

  const insertToken = (token: string) => {
    const current = formData.storage.filenameTemplate;
    const updated = current + token;
    setFormData({
      ...formData,
      storage: {
        ...formData.storage,
        filenameTemplate: updated,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Subtab Navigation & Save Header */}
      <div className="hextech-card p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveSubTab("video")}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
              activeSubTab === "video"
                ? "bg-hextech-blue/20 text-hextech-blue border border-hextech-blue/40 shadow-glow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>视频画质与编码</span>
          </button>

          <button
            onClick={() => setActiveSubTab("audio")}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
              activeSubTab === "audio"
                ? "bg-hextech-blue/20 text-hextech-blue border border-hextech-blue/40 shadow-glow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>输入与输出音频</span>
          </button>

          <button
            onClick={() => setActiveSubTab("export")}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
              activeSubTab === "export"
                ? "bg-hextech-blue/20 text-hextech-blue border border-hextech-blue/40 shadow-glow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>模板与自动导出</span>
          </button>

          <button
            onClick={() => setActiveSubTab("storage")}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
              activeSubTab === "storage"
                ? "bg-hextech-blue/20 text-hextech-blue border border-hextech-blue/40 shadow-glow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>存储空间与清理</span>
          </button>

          <button
            onClick={() => setActiveSubTab("system")}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
              activeSubTab === "system"
                ? "bg-hextech-blue/20 text-hextech-blue border border-hextech-blue/40 shadow-glow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>后台常驻与系统</span>
          </button>
        </div>

        <button
          onClick={handleSave}
          className={`flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${
            saveSuccess
              ? "bg-emerald-600 text-white"
              : "bg-hextech-gold hover:bg-hextech-goldHover text-black shadow-goldGlow"
          }`}
        >
          {saveSuccess ? (
            <>
              <Check className="w-4 h-4" />
              <span>设置已保存</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>保存配置</span>
            </>
          )}
        </button>
      </div>

      {/* 1. Video Settings Tab */}
      {activeSubTab === "video" && (
        <div className="space-y-5">
          {/* GPU Hardware Info Box */}
          {gpuInfo && (
            <div className="hextech-card p-4 rounded-2xl flex items-center justify-between border-hextech-border">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-hextech-dark border border-hextech-border text-hextech-gold">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">{gpuInfo.name}</h4>
                  <p className="text-[11px] text-slate-400">
                    显卡厂商: {gpuInfo.vendor} | 硬件加速:{" "}
                    <span className="text-emerald-400">
                      {gpuInfo.nvencSupported ? "NVIDIA NVENC" : gpuInfo.amfSupported ? "AMD AMF" : gpuInfo.qsvSupported ? "Intel QSV" : "Media Foundation"}
                    </span>
                  </p>
                </div>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-500/40">
                硬件加速就绪
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Resolution */}
            <div className="hextech-card p-5 rounded-2xl space-y-3">
              <label className="text-xs font-bold text-slate-200 block">录制分辨率 (Resolution)</label>
              <select
                value={formData.video.resolution}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    video: { ...formData.video, resolution: e.target.value },
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-hextech-dark/90 border border-hextech-border text-xs text-slate-200 focus:outline-none focus:border-hextech-gold"
              >
                <option value="source">原生无损 (跟随游戏全屏分辨率)</option>
                <option value="2160p">4K 超高清 (3840x2160)</option>
                <option value="1440p">2K 极清 (2560x1440)</option>
                <option value="1080p">1080p 全高清 (1920x1080 - 推荐)</option>
                <option value="720p">720p 高清 (1280x720 - 低占用)</option>
              </select>
              <p className="text-[11px] text-slate-400">支持全屏模式 DirectX 11 表面无感采样</p>
            </div>

            {/* Framerate */}
            <div className="hextech-card p-5 rounded-2xl space-y-3">
              <label className="text-xs font-bold text-slate-200 block">录制帧率 (FPS)</label>
              <div className="grid grid-cols-3 gap-2">
                {[30, 60, 120].map((fps) => (
                  <button
                    key={fps}
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        video: { ...formData.video, fps },
                      })
                    }
                    className={`py-2 rounded-xl text-xs font-mono font-bold border transition-all ${
                      formData.video.fps === fps
                        ? "bg-hextech-blue/20 text-hextech-blue border-hextech-blue/60 shadow-glow"
                        : "bg-hextech-dark/80 text-slate-400 border-hextech-border hover:bg-hextech-dark"
                    }`}
                  >
                    {fps} FPS
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">高刷显示器建议选择 60 或 120 FPS 以获得丝滑录像</p>
            </div>

            {/* Bitrate Slider */}
            <div className="hextech-card p-5 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200">视频编码码率 (Bitrate)</label>
                <span className="text-xs font-mono font-bold text-hextech-gold">
                  {formData.video.bitrateKbps} kbps ({Math.round(formData.video.bitrateKbps / 1000)} Mbps)
                </span>
              </div>
              <input
                type="range"
                min="2000"
                max="30000"
                step="1000"
                value={formData.video.bitrateKbps}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    video: { ...formData.video, bitrateKbps: Number(e.target.value) },
                  })
                }
                className="w-full accent-hextech-gold bg-slate-800 h-2 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>2 Mbps (紧凑)</span>
                <span>8 Mbps (1080p标准)</span>
                <span>16 Mbps (极清)</span>
                <span>30 Mbps (电竞无损)</span>
              </div>
            </div>

            {/* Encoder & Codec */}
            <div className="hextech-card p-5 rounded-2xl space-y-3">
              <label className="text-xs font-bold text-slate-200 block">编码方式与格式 (Codec)</label>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={formData.video.encoder}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      video: { ...formData.video, encoder: e.target.value },
                    })
                  }
                  className="px-3 py-2 rounded-xl bg-hextech-dark/90 border border-hextech-border text-xs text-slate-200 focus:outline-none focus:border-hextech-gold"
                >
                  <option value="auto">自动选择最佳 GPU 硬件</option>
                  <option value="nvenc">NVIDIA NVENC</option>
                  <option value="amf">AMD AMF</option>
                  <option value="qsv">Intel QuickSync (QSV)</option>
                  <option value="software">CPU 软件编码 (Software)</option>
                </select>

                <select
                  value={formData.video.codec}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      video: { ...formData.video, codec: e.target.value },
                    })
                  }
                  className="px-3 py-2 rounded-xl bg-hextech-dark/90 border border-hextech-border text-xs text-slate-200 focus:outline-none focus:border-hextech-gold"
                >
                  <option value="h264">H.264 (AVC - 兼容性最佳)</option>
                  <option value="hevc">H.265 (HEVC - 高压缩比)</option>
                  <option value="av1">AV1 (下一代高效编码)</option>
                </select>
              </div>
              <p className="text-[11px] text-slate-400">基于 Windows Media Foundation 原生硬件 SinkWriter 封装</p>
            </div>
          </div>
        </div>
      )}

      {/* 2. Audio Settings Tab */}
      {activeSubTab === "audio" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Output Device (Game / System sound) */}
          <div className="hextech-card p-5 rounded-2xl space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b border-hextech-border/50">
              <AudioWaveform className="w-4 h-4 text-hextech-blue" />
              <h3 className="text-xs font-bold text-slate-200">系统 / 游戏声音 (WASAPI 环回)</h3>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400">输出声卡设备</label>
              <select
                value={formData.audio.outputDevice || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    audio: { ...formData.audio, outputDevice: e.target.value || null },
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-hextech-dark/90 border border-hextech-border text-xs text-slate-200 focus:outline-none focus:border-hextech-gold"
              >
                <option value="">默认音频输出设备 (系统主声音)</option>
                {audioDevices.outputDevices.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name} {d.isDefault ? "(当前默认)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">游戏音量增益</span>
                <span className="font-mono text-hextech-gold font-bold">
                  {Math.round(formData.audio.outputVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2.0"
                step="0.05"
                value={formData.audio.outputVolume}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    audio: { ...formData.audio, outputVolume: Number(e.target.value) },
                  })
                }
                className="w-full accent-hextech-blue bg-slate-800 h-2 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Input Device (Microphone) */}
          <div className="hextech-card p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-hextech-border/50">
              <div className="flex items-center space-x-2">
                <Mic className="w-4 h-4 text-hextech-gold" />
                <h3 className="text-xs font-bold text-slate-200">麦克风语音输入</h3>
              </div>

              <label className="flex items-center space-x-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={formData.audio.recordMic}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      audio: { ...formData.audio, recordMic: e.target.checked },
                    })
                  }
                  className="rounded accent-hextech-gold"
                />
                <span className="text-slate-300">录制麦克风</span>
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400">麦克风设备</label>
              <select
                disabled={!formData.audio.recordMic}
                value={formData.audio.inputDevice || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    audio: { ...formData.audio, inputDevice: e.target.value || null },
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-hextech-dark/90 border border-hextech-border text-xs text-slate-200 focus:outline-none focus:border-hextech-gold disabled:opacity-40"
              >
                <option value="">默认麦克风输入设备</option>
                {audioDevices.inputDevices.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name} {d.isDefault ? "(当前默认)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">麦克风音量增益</span>
                <span className="font-mono text-hextech-gold font-bold">
                  {Math.round(formData.audio.inputVolume * 100)}%
                </span>
              </div>
              <input
                disabled={!formData.audio.recordMic}
                type="range"
                min="0"
                max="2.0"
                step="0.05"
                value={formData.audio.inputVolume}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    audio: { ...formData.audio, inputVolume: Number(e.target.value) },
                  })
                }
                className="w-full accent-hextech-gold bg-slate-800 h-2 rounded-lg cursor-pointer disabled:opacity-40"
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. Export & Template Settings Tab */}
      {activeSubTab === "export" && (
        <div className="space-y-5">
          <div className="hextech-card p-5 rounded-2xl space-y-4">
            <label className="text-xs font-bold text-slate-200 block">
              自动重命名文件名模板 (Filename Pattern)
            </label>
            <input
              type="text"
              value={formData.storage.filenameTemplate}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  storage: { ...formData.storage, filenameTemplate: e.target.value },
                })
              }
              className="w-full px-4 py-2.5 rounded-xl bg-hextech-dark/90 border border-hextech-border text-xs font-mono text-slate-200 focus:outline-none focus:border-hextech-gold"
            />

            {/* Tag Pills */}
            <div className="space-y-1.5">
              <span className="text-[11px] text-slate-400">点击下方变量标签快速插入到模板：</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { tag: "{date}", label: "日期 (2026-08-25)" },
                  { tag: "{time}", label: "时间 (14-30-00)" },
                  { tag: "{queue}", label: "模式 (RankedSolo)" },
                  { tag: "{champion}", label: "英雄 (Aatrox)" },
                  { tag: "{kda}", label: "战绩 (12-2-5)" },
                  { tag: "{result}", label: "胜负 (Victory/Defeat)" },
                  { tag: "{duration}", label: "时长 (30m45s)" },
                  { tag: "{gameId}", label: "对局ID" },
                ].map((item) => (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => insertToken(item.tag)}
                    className="px-2.5 py-1 rounded-lg bg-hextech-dark border border-hextech-border hover:border-hextech-gold/70 text-xs font-mono text-hextech-gold hover:bg-hextech-card transition-all"
                  >
                    + {item.tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Template Preview Box */}
            <div className="p-3.5 rounded-xl bg-hextech-dark/90 border border-hextech-blue/40 mt-4">
              <span className="text-[11px] text-hextech-blue font-semibold uppercase tracking-wider block">
                导出文件名实时预览：
              </span>
              <p className="text-xs font-mono font-bold text-slate-100 mt-1 break-all">
                {templatePreview || "预览加载中..."}
              </p>
            </div>
          </div>

          <div className="hextech-card p-5 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center justify-between p-3 rounded-xl bg-hextech-dark/80 border border-hextech-border cursor-pointer">
              <div>
                <strong className="text-xs text-slate-200 block">自动导出与元数据嵌入</strong>
                <span className="text-[11px] text-slate-400">对局结束后自动调用 LCU 查询战绩并生成同名 JSON 伴随数据</span>
              </div>
              <input
                type="checkbox"
                checked={formData.automation.autoExport}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    automation: { ...formData.automation, autoExport: e.target.checked },
                  })
                }
                className="rounded accent-hextech-gold w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-hextech-dark/80 border border-hextech-border cursor-pointer">
              <div>
                <strong className="text-xs text-slate-200 block">导出完成桌面通知</strong>
                <span className="text-[11px] text-slate-400">在 Windows 右下角推送录制完成及战绩概览通知</span>
              </div>
              <input
                type="checkbox"
                checked={formData.automation.notifyOnExport}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    automation: { ...formData.automation, notifyOnExport: e.target.checked },
                  })
                }
                className="rounded accent-hextech-gold w-4 h-4"
              />
            </label>
          </div>
        </div>
      )}

      {/* 4. Storage Settings Tab */}
      {activeSubTab === "storage" && (
        <div className="space-y-5">
          <div className="hextech-card p-5 rounded-2xl space-y-4">
            <label className="text-xs font-bold text-slate-200 block">录像存放目录 (Output Directory)</label>
            <div className="flex items-center space-x-3">
              <input
                type="text"
                value={formData.storage.outputDir}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    storage: { ...formData.storage, outputDir: e.target.value },
                  })
                }
                className="flex-1 px-4 py-2.5 rounded-xl bg-hextech-dark/90 border border-hextech-border text-xs font-mono text-slate-200 focus:outline-none focus:border-hextech-gold"
              />
              <button
                type="button"
                onClick={() => api.openRecordingsFolder()}
                className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-hextech-dark border border-hextech-border hover:border-hextech-gold text-xs text-slate-300 hover:text-hextech-gold transition-all"
              >
                <FolderOpen className="w-4 h-4" />
                <span>浏览</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="hextech-card p-5 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200">存储空间配额上限</label>
                <span className="text-xs font-mono font-bold text-hextech-gold">{formData.storage.maxStorageGb} GB</span>
              </div>
              <input
                type="range"
                min="10"
                max="200"
                step="10"
                value={formData.storage.maxStorageGb}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    storage: { ...formData.storage, maxStorageGb: Number(e.target.value) },
                  })
                }
                className="w-full accent-hextech-gold bg-slate-800 h-2 rounded-lg cursor-pointer"
              />
              <p className="text-[11px] text-slate-400">超出配额后将自动清理最旧的历史对局录像</p>
            </div>

            <div className="hextech-card p-5 rounded-2xl space-y-3">
              <label className="text-xs font-bold text-slate-200 block">录像保留天数策略</label>
              <select
                value={formData.storage.retentionDays}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    storage: { ...formData.storage, retentionDays: Number(e.target.value) },
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-hextech-dark/90 border border-hextech-border text-xs text-slate-200 focus:outline-none focus:border-hextech-gold"
              >
                <option value="7">自动清理 7 天前的录像</option>
                <option value="15">自动清理 15 天前的录像</option>
                <option value="30">自动清理 30 天前的录像 (推荐)</option>
                <option value="90">自动清理 90 天前的录像</option>
                <option value="0">永久保留 (仅受空间配额约束)</option>
              </select>
              <p className="text-[11px] text-slate-400">后台将在每次对局导出后自动触发清理规则</p>
            </div>
          </div>
        </div>
      )}

      {/* 5. System Settings Tab */}
      {activeSubTab === "system" && (
        <div className="hextech-card p-5 rounded-2xl space-y-4">
          <label className="flex items-center justify-between p-3.5 rounded-xl bg-hextech-dark/80 border border-hextech-border cursor-pointer">
            <div>
              <strong className="text-xs text-slate-200 block">开机自动启动 (Auto-Start on Boot)</strong>
              <span className="text-[11px] text-slate-400">随 Windows 系统开机静默启动并在后台待机</span>
            </div>
            <input
              type="checkbox"
              checked={formData.automation.autoStartBoot}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  automation: { ...formData.automation, autoStartBoot: e.target.checked },
                })
              }
              className="rounded accent-hextech-gold w-4 h-4"
            />
          </label>

          <label className="flex items-center justify-between p-3.5 rounded-xl bg-hextech-dark/80 border border-hextech-border cursor-pointer">
            <div>
              <strong className="text-xs text-slate-200 block">关闭窗口时最小化到系统托盘 (Minimize to Tray)</strong>
              <span className="text-[11px] text-slate-400">点击右上角关闭按钮不退出程序，保持后台无感运行</span>
            </div>
            <input
              type="checkbox"
              checked={formData.automation.minimizeToTray}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  automation: { ...formData.automation, minimizeToTray: e.target.checked },
                })
              }
              className="rounded accent-hextech-gold w-4 h-4"
            />
          </label>

          <label className="flex items-center justify-between p-3.5 rounded-xl bg-hextech-dark/80 border border-hextech-border cursor-pointer">
            <div>
              <strong className="text-xs text-slate-200 block">启动时静默进入托盘 (Start Minimized)</strong>
              <span className="text-[11px] text-slate-400">开机或启动时不弹出主窗口，不占用任务栏空间</span>
            </div>
            <input
              type="checkbox"
              checked={formData.automation.startMinimized}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  automation: { ...formData.automation, startMinimized: e.target.checked },
                })
              }
              className="rounded accent-hextech-gold w-4 h-4"
            />
          </label>
        </div>
      )}
    </div>
  );
};
