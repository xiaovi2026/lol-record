export interface VideoSettings {
  resolution: string;
  fps: number;
  bitrateKbps: number;
  encoder: string;
  codec: string;
}

export interface AudioSettings {
  outputDevice: string | null;
  inputDevice: string | null;
  outputVolume: number;
  inputVolume: number;
  recordMic: boolean;
}

export interface StorageSettings {
  outputDir: string;
  filenameTemplate: string;
  maxStorageGb: number;
  autoCleanup: boolean;
  retentionDays: number;
}

export interface AutomationSettings {
  autoRecord: boolean;
  autoExport: boolean;
  autoStartBoot: boolean;
  minimizeToTray: boolean;
  startMinimized: boolean;
  notifyOnExport: boolean;
}

export interface AppSettings {
  video: VideoSettings;
  audio: AudioSettings;
  storage: StorageSettings;
  automation: AutomationSettings;
}

export interface CurrentSummoner {
  accountId?: number;
  summonerId?: number;
  displayName?: string;
  gameName?: string;
  tagLine?: string;
  profileIconId?: number;
  summonerLevel?: number;
}

export interface LcuAuth {
  processName: string;
  pid: number;
  port: number;
  authToken: string;
  protocol: string;
}

export interface LcuStatusDto {
  isConnected: boolean;
  phase: string;
  auth: LcuAuth | null;
  summoner: CurrentSummoner | null;
}

export type RecordingState = "Idle" | "Recording" | "Paused" | "Finalizing";

export interface RecordingTelemetry {
  state: RecordingState;
  elapsedSeconds: number;
  recordedFrames: number;
  recordedBytes: number;
  fps: number;
  bitrateKbps: number;
  resolution: string;
  outputFilePath: string | null;
}

export interface GpuEncoderInfo {
  name: string;
  vendor: string;
  nvencSupported: boolean;
  amfSupported: boolean;
  qsvSupported: boolean;
  supportedCodecs: string[];
}

export interface AudioDeviceInfo {
  id: string;
  name: string;
  isDefault: boolean;
  isInput: boolean;
}

export interface AudioDevicesDto {
  outputDevices: AudioDeviceInfo[];
  inputDevices: AudioDeviceInfo[];
}

export interface HighlightMarker {
  timestampSec: number;
  eventName: string;
  eventType: string;
  description: string;
  killerName: string | null;
  victimName: string | null;
}

export interface MatchMetadata {
  gameId?: number;
  gameMode: string;
  queueId: number;
  queueName: string;
  championId: number;
  championName: string;
  championKey: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  gameDurationSeconds: number;
  startTime: string;
  endTime?: string;
  highlights: HighlightMarker[];
}

export interface RecordingItem {
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  modifiedTime: number;
  metadata: MatchMetadata | null;
}

export interface StorageUsage {
  totalRecordingsBytes: number;
  recordingCount: number;
  maxQuotaBytes: number;
}
