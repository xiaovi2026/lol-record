# lol-record: 英雄联盟无感对局录像与自动导出系统

一个基于 **Tauri v2** 开发的轻量级、零外部客户端依赖的英雄联盟对局自动录像与导出工具。

---

## ✨ 核心特性

1. **零外部客户端依赖 (No FFmpeg)**:
   * 采用纯 Rust 原生方案（调用 Windows 系统的 **WGC (Windows Graphics Capture)** 媒体接口进行高性能画面捕获）。
   * 采用 **Windows Media Foundation (WMF)** 接口在系统底层调用显卡硬件进行 H.264/H.265 视频编码。
   * 软件安装包仅有 **~5MB** 左右，无需用户打包或下载几十兆的 `ffmpeg.exe` 即可工作。
2. **完全无感录像**:
   * 后台自动扫描 LOL 客户端，连接到 **LCU (League Client Update) API**。
   * 游戏对局开始（Gameflow 进入 `InProgress`）时自动拉起静默录制。
   * 游戏对局结束时自动停止录制，并通过 LCU 自动查询你本场对局的**英雄、KDA、胜负结果**，对录制的视频进行重命名并移动到输出目录中（例如：`20260826_1130_无极剑圣_12_3_8_胜利.mp4`）。
3. **开机自启与静默后台**:
   * 系统支持开机自启并在系统托盘（System Tray）静默运行。
   * 点击关闭按钮时自动隐藏到托盘，不占用任务栏空间。
4. **自定义音频与画面参数**:
   * 支持通过系统音频服务（`cpal`）读取系统音频并进行环回监听录像（可以自由选择录制哪些播放器/麦克风音轨）。
   * 支持自定义导出路径、视频分辨率、画面编码码率。

---

## 🛠 目录结构说明

```text
lol-record/
├── src/                        # 前端 Webview 界面 (HTML / CSS / JS)
│   ├── index.html              # 仪表盘与配置主界面
│   ├── main.js                 # 前端 Tauri API 调用与 LCU 自动重命名模块
│   └── styles.css              # Hextech 科技暗色风样式表
└── src-tauri/                  # 后端 Rust Core 代码
    ├── src/
    │   ├── lib.rs              # 托盘创建、命令注册与后台 LCU 监听
    │   ├── lcu.rs              # LOL 进程检测与 LCU 认证端口参数读取
    │   ├── audio.rs            # 基于 cpal 的 Windows WASAPI 音频设备查询
    │   └── record.rs           # 基于 windows-capture 驱动的 WGC 硬件加速编码流控制
    ├── Cargo.toml              # Rust 包定义与 Windows 原生底层接口依赖
    └── tauri.conf.json         # Tauri v2 系统配置 (配置跳过任务栏与 NSIS 打包参数)
```

---

## 🚀 开发者指南

### 1. 环境依赖
* **Rust**: 安装最新版本 Rust (https://rustup.rs/)。
* **C++ 生成工具**: 安装 Visual Studio Community（选择 "C++ 桌面开发" 工作负载）。

### 2. 启动开发模式
在项目根目录下运行：
```powershell
cargo tauri dev
```
项目会编译后端 Rust 代码并自动热重载运行调试。

### 3. 打包生成 exe 安装包
```powershell
cargo tauri build
```
打包成功后，单文件 exe 安装包会生成在 `src-tauri/target/release/bundle/nsis/` 目录下。

---

## 📄 开源许可证

本项目基于 **[MIT License](LICENSE)** 开源。
