import {
  AppSettings,
  AudioDevicesDto,
  GpuEncoderInfo,
  HighlightMarker,
  LcuStatusDto,
  RecordingItem,
  RecordingTelemetry,
  StorageUsage,
} from "../types";

// Check if running inside Tauri webview
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  // Mock fallback for standard browser development
  return mockInvoke<T>(cmd, args);
}

export const api = {
  getLcuStatus: () => invokeTauri<LcuStatusDto>("get_lcu_status"),
  getLiveHighlights: () => invokeTauri<HighlightMarker[]>("get_live_highlights"),
  startManualRecording: () => invokeTauri<string>("start_manual_recording"),
  stopManualRecording: () => invokeTauri<string>("stop_manual_recording"),
  getRecorderTelemetry: () => invokeTauri<RecordingTelemetry>("get_recorder_telemetry"),
  getGpuEncoderInfo: () => invokeTauri<GpuEncoderInfo>("get_gpu_encoder_info"),
  getSettings: () => invokeTauri<AppSettings>("get_settings"),
  saveSettings: (settings: AppSettings) => invokeTauri<void>("save_settings", { newSettings: settings }),
  testNamingTemplate: (template: string) => invokeTauri<string>("test_naming_template", { template }),
  getAudioDevices: () => invokeTauri<AudioDevicesDto>("get_audio_devices"),
  getRecordings: () => invokeTauri<RecordingItem[]>("get_recordings"),
  getStorageUsage: () => invokeTauri<StorageUsage>("get_storage_usage"),
  deleteRecording: (filePath: string) => invokeTauri<void>("delete_recording", { filePath }),
  openFileInFolder: (filePath: string) => invokeTauri<void>("open_file_in_folder", { filePath }),
  openRecordingsFolder: () => invokeTauri<void>("open_recordings_folder"),
};

// Browser Mock Provider for instant UI preview and tests
let mockSettings: AppSettings = {
  video: {
    resolution: "1080p",
    fps: 60,
    bitrateKbps: 8000,
    encoder: "auto",
    codec: "h264",
  },
  audio: {
    outputDevice: null,
    inputDevice: null,
    outputVolume: 1.0,
    inputVolume: 0.8,
    recordMic: true,
  },
  storage: {
    outputDir: "C:\\Videos\\LoL Recordings",
    filenameTemplate: "{date}_{queue}_{champion}_{kda}_{result}.mp4",
    maxStorageGb: 50,
    autoCleanup: true,
    retentionDays: 30,
  },
  automation: {
    autoRecord: true,
    autoExport: true,
    autoStartBoot: true,
    minimizeToTray: true,
    startMinimized: false,
    notifyOnExport: true,
  },
};

let isMockRecording = false;

function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "get_lcu_status":
      return Promise.resolve({
        isConnected: true,
        phase: isMockRecording ? "InProgress" : "ChampSelect",
        auth: {
          processName: "LeagueClientUx.exe",
          pid: 14280,
          port: 52140,
          authToken: "mock_auth_token",
          protocol: "https",
        },
        summoner: {
          accountId: 10023,
          summonerId: 20045,
          displayName: "Faker#KR1",
          gameName: "Hide on bush",
          tagLine: "KR1",
          profileIconId: 588,
          summonerLevel: 568,
        },
      } as unknown as T);

    case "get_live_highlights":
      return Promise.resolve([
        {
          timestampSec: 184.5,
          eventName: "ChampionKill",
          eventType: "Kill",
          description: "You eliminated Ahri (First Blood)",
          killerName: "Hide on bush",
          victimName: "Ahri",
        },
        {
          timestampSec: 642.0,
          eventName: "Multikill",
          eventType: "Multikill",
          description: "Hide on bush scored a Double Kill!",
          killerName: "Hide on bush",
          victimName: null,
        },
        {
          timestampSec: 1220.3,
          eventName: "BaronKill",
          eventType: "Baron",
          description: "Baron Nashor secured by Hide on bush",
          killerName: "Hide on bush",
          victimName: null,
        },
      ] as unknown as T);

    case "start_manual_recording":
      isMockRecording = true;
      return Promise.resolve("C:\\Videos\\LoL Recordings\\temp_recording.mp4" as unknown as T);

    case "stop_manual_recording":
      isMockRecording = false;
      return Promise.resolve("C:\\Videos\\LoL Recordings\\2026-08-25_RankedSolo_Aatrox_12-2-5_Victory.mp4" as unknown as T);

    case "get_recorder_telemetry":
      return Promise.resolve({
        state: isMockRecording ? "Recording" : "Idle",
        elapsedSeconds: isMockRecording ? 425 : 0,
        recordedFrames: isMockRecording ? 25500 : 0,
        recordedBytes: isMockRecording ? 425 * 1024 * 1000 : 0,
        fps: 60,
        bitrateKbps: 8000,
        resolution: "1080p",
        outputFilePath: isMockRecording ? "C:\\Videos\\LoL Recordings\\temp_recording.mp4" : null,
      } as unknown as T);

    case "get_gpu_encoder_info":
      return Promise.resolve({
        name: "NVIDIA GeForce RTX 4070 Ti",
        vendor: "NVIDIA",
        nvencSupported: true,
        amfSupported: false,
        qsvSupported: false,
        supportedCodecs: ["h264", "hevc", "av1"],
      } as unknown as T);

    case "get_settings":
      return Promise.resolve(mockSettings as unknown as T);

    case "save_settings":
      if (args?.newSettings) {
        mockSettings = args.newSettings as AppSettings;
      }
      return Promise.resolve(undefined as unknown as T);

    case "test_naming_template": {
      const tpl = (args?.template as string) || "{date}_{queue}_{champion}_{kda}_{result}.mp4";
      const preview = tpl
        .replace("{date}", "2026-08-25")
        .replace("{time}", "14-30-00")
        .replace("{datetime}", "20260825_143000")
        .replace("{queue}", "RankedSolo")
        .replace("{champion}", "Aatrox")
        .replace("{kda}", "12-2-5")
        .replace("{kills}", "12")
        .replace("{deaths}", "2")
        .replace("{assists}", "5")
        .replace("{result}", "Victory")
        .replace("{duration}", "30m45s")
        .replace("{gameId}", "123456789");
      return Promise.resolve((preview.endsWith(".mp4") ? preview : `${preview}.mp4`) as unknown as T);
    }

    case "get_audio_devices":
      return Promise.resolve({
        outputDevices: [
          { id: "default_out", name: "Realtek High Definition Audio (Default)", isDefault: true, isInput: false },
          { id: "headset_out", name: "Logitech G Pro X Wireless Headset", isDefault: false, isInput: false },
        ],
        inputDevices: [
          { id: "default_in", name: "Microphone (Logitech G Pro X Wireless)", isDefault: true, isInput: true },
          { id: "aux_in", name: "Realtek Audio Line In", isDefault: false, isInput: true },
        ],
      } as unknown as T);

    case "get_recordings":
      return Promise.resolve([
        {
          filePath: "C:\\Videos\\LoL Recordings\\2026-08-25_RankedSolo_Aatrox_12-2-5_Victory.mp4",
          fileName: "2026-08-25_RankedSolo_Aatrox_12-2-5_Victory.mp4",
          fileSizeBytes: 1845 * 1024 * 1000,
          modifiedTime: Date.now() / 1000 - 3600,
          metadata: {
            gameId: 68912304,
            gameMode: "CLASSIC",
            queueId: 420,
            queueName: "RankedSolo",
            championId: 266,
            championName: "Aatrox",
            championKey: "Aatrox",
            kills: 12,
            deaths: 2,
            assists: 5,
            win: true,
            gameDurationSeconds: 1845,
            startTime: "2026-08-25T14:30:00+08:00",
            highlights: [
              {
                timestampSec: 184.5,
                eventName: "ChampionKill",
                eventType: "Kill",
                description: "You eliminated Ahri (First Blood)",
                killerName: "Hide on bush",
                victimName: "Ahri",
              },
              {
                timestampSec: 1220.3,
                eventName: "BaronKill",
                eventType: "Baron",
                description: "Baron Nashor secured by Hide on bush",
                killerName: "Hide on bush",
                victimName: null,
              },
            ],
          },
        },
        {
          filePath: "C:\\Videos\\LoL Recordings\\2026-08-25_ARAM_Ahri_18-6-20_Victory.mp4",
          fileName: "2026-08-25_ARAM_Ahri_18-6-20_Victory.mp4",
          fileSizeBytes: 1200 * 1024 * 1000,
          modifiedTime: Date.now() / 1000 - 14400,
          metadata: {
            gameId: 68912110,
            gameMode: "ARAM",
            queueId: 450,
            queueName: "ARAM",
            championId: 103,
            championName: "Ahri",
            championKey: "Ahri",
            kills: 18,
            deaths: 6,
            assists: 20,
            win: true,
            gameDurationSeconds: 1200,
            startTime: "2026-08-25T11:00:00+08:00",
            highlights: [],
          },
        },
      ] as unknown as T);

    case "get_storage_usage":
      return Promise.resolve({
        totalRecordingsBytes: 3045 * 1024 * 1000,
        recordingCount: 2,
        maxQuotaBytes: 50 * 1024 * 1024 * 1024,
      } as unknown as T);

    case "delete_recording":
    case "open_file_in_folder":
    case "open_recordings_folder":
      return Promise.resolve(undefined as unknown as T);

    default:
      return Promise.reject(`Unknown command ${cmd}`);
  }
}
