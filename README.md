# LoL Record - 英雄联盟对局无感录像与自动导出系统

<div align="center">

![LoL Record Banner](https://img.shields.io/badge/LoL%20Record-v0.1.1-0ac8b9?style=for-the-badge&logo=riotgames)
![Tauri v2](https://img.shields.io/badge/Tauri-v2.0-24c8db?style=for-the-badge&logo=tauri)
![Rust](https://img.shields.io/badge/Rust-1.78+-dea584?style=for-the-badge&logo=rust)
![React 19](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react)
![Zero Dependency](https://img.shields.io/badge/External%20Deps-Zero%20(0%20OBS%2F0%20FFmpeg)-10b981?style=for-the-badge)

<p align="center">
  <b>基于 LCU API 与 Windows 原生硬件加速的轻量级、无感英雄联盟对局自动录制与战绩归档系统</b>
</p>

</div>

---

## 🌟 核心特性 (Features)

1. **⚡ 零外部客户端依赖 (Zero External Dependencies)**
   - 绝不强制用户预装 OBS Studio、外置独立的 FFmpeg.exe 命令行工具或 Python 环境。
   - 原生集成 **Windows Graphics Capture (WGC)** 与 **Windows Media Foundation (WMF)** 硬件加速编解码器，单 EXE 安装包仅约 10~15MB。

2. **🛡️ 100% Vanguard 反作弊安全**
   - 采用 Windows 官方操作系统层级的表面捕获接口，绝不注入或 Hook 游戏进程（如 Direct3D SwapChain），杜绝任何第三方插件封号风险。

3. **🎮 LCU API 自动无感生命周期感知**
   - 自动嗅探 `LeagueClientUx` 客户端动态端口与通信凭据。
   - 基于 WAMP 1.0 WebSocket 实时监听 `gameflow-phase`（`ChampSelect` → `InProgress` 自动起录 → `EndOfGame` 自动结算并导出）。
   - 监听局内 `:2999` Live Client Data API，自动捕获击杀、连杀（Double/Penta Kill）、大龙/小龙击杀、团灭等关键高光时间戳。

4. **🔊 独立音视频控制与多轨混音**
   - 支持独立选择**系统/游戏声音输出设备**（WASAPI 环回）与**麦克风输入设备**。
   - 支持各自独立的音量增益调节（0% - 200%）与麦克风录制开关。

5. **🖥️ 强大画质与硬件编码控制**
   - 支持原生无损、4K、2K、1080p、720p 分辨率与 30 / 60 / 120 FPS 帧率设置。
   - 支持 2,000 kbps ~ 50,000 kbps 自定义码率。
   - 自动适配 NVIDIA NVENC、AMD AMF、Intel QuickSync (QSV) 硬件加速与 CPU 软件备用编码。
   - 支持 H.264 (AVC)、H.265 (HEVC)、AV1 现代高效视频格式。

6. **📁 灵活的命名模板与空间配额管理**
   - 支持富变量文件名模板：`{date}_{queue}_{champion}_{kda}_{result}_{duration}.mp4`。
   - 导出视频同时生成同名 JSON 伴随元数据（含击杀时间戳打点）。
   - 支持磁盘配额（如 50GB）与保留天数规则（如 30 天），超额自动清理最旧对局。

7. **🚀 后台常驻与开机自启**
   - 支持 Windows 开机自启、关闭窗口自动最小化至系统托盘、静默启动。

---

## 🏗️ 架构设计 (System Architecture)

```
lol-record/
├── .github/workflows/         # CI/CD 质量门禁与 Windows Release 自动打包
├── src/                       # 前端界面 (React 19 + TypeScript + Tailwind CSS + Lucide)
│   ├── components/
│   │   ├── layout/            # 顶部导航、LCU 状态栏、快速录制开关
│   │   ├── dashboard/         # 实时录像遥测、Live 事件打点流、安全指标
│   │   ├── recordings/        # 录像库画廊、战绩徽章、内嵌高光播放器
│   │   └── settings/          # 视频/音频/导出模板/存储配额/系统设置
│   ├── services/              # Tauri IPC 异步调用与浏览器 Mock 适配
│   └── types/                 # 统一数据结构定义
└── src-tauri/                 # Rust 原生后端核心引擎
    ├── src/
    │   ├── config/            # 配置管理与持久化 (settings.json)
    │   ├── lcu/               # LCU 自动嗅探、WAMP WebSocket 与局内打点
    │   ├── recorder/          # WGC 画面捕获、WASAPI 音频混音与 WMF 硬件编码器
    │   ├── exporter/          # 模板格式化、元数据 Sidecar 与自动磁盘清理
    │   └── commands/          # Tauri IPC 命令注册
    ├── Cargo.toml
    └── tauri.conf.json        # Tauri v2 托盘与安装包配置
```

---

## 🛠️ 本地开发与构建 (Development & Build)

### 环境要求
- **Node.js**: >= 20.x (`pnpm` >= 9.x)
- **Rust**: >= 1.78 (`cargo`)
- **OS**: Windows 10 (1903+) / Windows 11

### 1. 安装前端依赖
```bash
pnpm install
```

### 2. 启动前端开发服务器 (支持 Mock 数据实时预览)
```bash
pnpm dev
```

### 3. 启动桌面端集成调试
```bash
pnpm tauri dev
```

### 4. 构建生产安装包 (.exe / NSIS)
```bash
pnpm tauri build
```
构建产物将输出在 `src-tauri/target/release/bundle/nsis/` 中。

---

## 🤖 自动化 CI/CD

项目内置完整的 GitHub Actions 工作流：
- **`.github/workflows/ci.yml`**: 在每次 Push/PR 时自动运行 TypeScript 严格类型检查、ESLint 代码审查与 Rust 后端质量门禁。
- **`.github/workflows/release.yml`**: 在推送版本 Tag（如 `v0.1.0`）时，自动在 Windows 环境中编译单文件 `.exe` 与安装包，并生成 GitHub Releases。

---

## 📄 开源许可证
本项目采用 [MIT License](LICENSE) 开源协议。
