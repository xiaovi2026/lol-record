const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// Global state
let currentFilePath = null;
let isRecording = false;
let lcuCredentials = null;

// DOM Elements
let lcuStatusText, recordStatusText;
let btnStartRecord, btnStopRecord;
let saveDirInput, videoResSelect, videoBitrateSelect;
let audioOutputSelect, audioInputSelect, autostartToggle;

// Load config from localStorage or default
function getSettings() {
  return {
    saveDir: localStorage.getItem("saveDir") || "C:\\LoL-Records",
    resolution: localStorage.getItem("resolution") || "1920x1080",
    bitrate: parseInt(localStorage.getItem("bitrate") || "6"),
    audioOutput: localStorage.getItem("audioOutput") || "Default",
    audioInput: localStorage.getItem("audioInput") || "None",
    autostart: localStorage.getItem("autostart") === "true",
  };
}

// Save config
function saveSettings(settings) {
  localStorage.setItem("saveDir", settings.saveDir);
  localStorage.setItem("resolution", settings.resolution);
  localStorage.setItem("bitrate", settings.bitrate.toString());
  localStorage.setItem("audioOutput", settings.audioOutput);
  localStorage.setItem("audioInput", settings.audioInput);
  localStorage.setItem("autostart", settings.autostart.toString());
}

// Refresh audio devices list
async function loadAudioDevices() {
  try {
    const devices = await invoke("get_audio_devices");
    
    // Remember current user values before replacing options
    const currentOutput = audioOutputSelect.value || localStorage.getItem("audioOutput") || "Default";
    const currentInput = audioInputSelect.value || localStorage.getItem("audioInput") || "None";
    
    // Clear previous dynamic options (keep default/none)
    audioOutputSelect.innerHTML = '<option value="Default">系统默认输出</option><option value="None">不录制系统音</option>';
    audioInputSelect.innerHTML = '<option value="None">不录制麦克风</option><option value="Default">系统默认输入</option>';
    
    // Populate outputs
    devices.outputs.forEach(dev => {
      const opt = document.createElement("option");
      opt.value = dev.name;
      opt.textContent = dev.name + (dev.is_default ? " (默认)" : "");
      audioOutputSelect.appendChild(opt);
    });
    
    // Populate inputs
    devices.inputs.forEach(dev => {
      const opt = document.createElement("option");
      opt.value = dev.name;
      opt.textContent = dev.name + (dev.is_default ? " (默认)" : "");
      audioInputSelect.appendChild(opt);
    });
    
    // Restore selections if they exist in the new options list
    if ([...audioOutputSelect.options].some(o => o.value === currentOutput)) {
      audioOutputSelect.value = currentOutput;
    } else {
      audioOutputSelect.value = "Default";
    }
    
    if ([...audioInputSelect.options].some(o => o.value === currentInput)) {
      audioInputSelect.value = currentInput;
    } else {
      audioInputSelect.value = "None";
    }
  } catch (err) {
    console.error("Failed to load audio devices:", err);
  }
}

// Check LCU connection state and details
async function checkLcuStatus() {
  try {
    const creds = await invoke("get_lcu_status");
    const indicator = document.getElementById("lcu-indicator");
    if (creds) {
      lcuCredentials = creds;
      lcuStatusText.textContent = `已连接 (端口: ${creds.port})`;
      lcuStatusText.className = "status-desc text-success";
      if (indicator) {
        indicator.className = "status-indicator-circle state-success";
      }
      
      // Fetch current game details
      try {
        const session = await invoke("request_lcu", { method: "GET", endpoint: "/lol-gameflow/v1/session" });
        if (session && session.gameData) {
          document.getElementById("game-mode").textContent = session.gameData.queue?.name || "自定义/其他对局";
        } else {
          document.getElementById("game-mode").textContent = "无活动对局";
        }
        
        const phase = await invoke("request_lcu", { method: "GET", endpoint: "/lol-gameflow/v1/gameflow-phase" });
        if (phase) {
          const phaseTranslations = {
            "None": "大厅/空闲",
            "Lobby": "房间中",
            "Matchmaking": "正在匹配",
            "ReadyCheck": "找到对局/准备就绪",
            "ChampSelect": "选英雄中",
            "GameStart": "游戏启动中",
            "InProgress": "游戏进行中 (自动录像中)",
            "PreEndOfGame": "对局即将结束",
            "EndOfGame": "对局结束结算",
            "WaitingForStats": "等待战绩数据",
          };
          const cleanPhase = phase.replace(/"/g, "");
          document.getElementById("game-phase").textContent = phaseTranslations[cleanPhase] || cleanPhase;
        }
      } catch (e) {
        document.getElementById("game-mode").textContent = "获取中...";
        document.getElementById("game-phase").textContent = "获取中...";
      }
      
      document.getElementById("lcu-details").style.display = "flex";
    } else {
      lcuCredentials = null;
      lcuStatusText.textContent = "未检测到客户端运行";
      lcuStatusText.className = "status-desc text-danger";
      if (indicator) {
        indicator.className = "status-indicator-circle state-danger";
      }
      document.getElementById("lcu-details").style.display = "none";
    }
  } catch (err) {
    console.error(err);
  }
}

// Update recording status in UI
function updateRecordingUI(recording, filename = "") {
  isRecording = recording;
  const indicator = document.getElementById("record-indicator");
  if (recording) {
    recordStatusText.textContent = "正在录制中";
    recordStatusText.className = "status-desc text-success recording-blink";
    if (indicator) {
      indicator.className = "status-indicator-circle state-success";
    }
    btnStartRecord.disabled = true;
    btnStopRecord.disabled = false;
    
    document.getElementById("record-details").style.display = "flex";
    document.getElementById("record-source").textContent = lcuCredentials ? "英雄联盟对局 (自动)" : "手动录像";
    document.getElementById("game-filepath").textContent = filename;
  } else {
    recordStatusText.textContent = "未开始录制";
    recordStatusText.className = "status-desc text-gray";
    if (indicator) {
      indicator.className = "status-indicator-circle state-gray";
    }
    btnStartRecord.disabled = false;
    btnStopRecord.disabled = true;
    document.getElementById("record-details").style.display = "none";
  }
  
  // Disable / Enable settings panel changes depending on recording state
  const settingsFields = [
    saveDirInput,
    document.getElementById("btn-select-dir"),
    document.getElementById("btn-open-dir"),
    videoResSelect,
    videoBitrateSelect,
    audioOutputSelect,
    audioInputSelect,
    autostartToggle
  ];
  settingsFields.forEach(field => {
    if (field) {
      field.disabled = recording;
    }
  });
}

// Start Recording Action
async function startRecordingAction() {
  const settings = getSettings();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `LoL_Record_${timestamp}.mp4`;
  currentFilePath = `${settings.saveDir}\\${filename}`;
  
  const [width, height] = settings.resolution.split("x").map(Number);
  
  try {
    await invoke("start_manual_record", {
      path: currentFilePath,
      width,
      height,
      bitrateMbps: settings.bitrate,
      audioOutput: settings.audioOutput,
      audioInput: settings.audioInput,
    });
    updateRecordingUI(true, filename);
  } catch (err) {
    alert("开始录像失败: " + err);
  }
}

// Stop Recording Action
async function stopRecordingAction() {
  try {
    await invoke("stop_manual_record");
    const origPath = currentFilePath;
    currentFilePath = null;
    updateRecordingUI(false);
    
    // Save to history & try LCU renaming
    setTimeout(() => handleMatchRenameAndHistory(origPath), 3000);
  } catch (err) {
    alert("停止录像失败: " + err);
  }
}

// Fetch match stats from LCU and rename the file
async function handleMatchRenameAndHistory(filePath) {
  let finalPath = filePath;
  let recordName = PathGetFileName(filePath);
  let metadata = null;
  
  if (lcuCredentials) {
    try {
      // 1. Get current summoner
      const summoner = await invoke("request_lcu", { method: "GET", endpoint: "/lol-summoner/v1/current-summoner" });
      if (summoner && summoner.summonerId) {
        // Retry loop to allow LCU to update match history (typically takes a few seconds)
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          const matchData = await invoke("request_lcu", {
            method: "GET",
            endpoint: "/lol-match-history/v1/products/lol/current-summoner/matches",
          });
          
          if (matchData && matchData.games && matchData.games.games && matchData.games.games.length > 0) {
            const lastGame = matchData.games.games[0];
            
            // Map identities to find participant ID
            const identity = lastGame.participantIdentities.find(id => id.player && id.player.summonerId === summoner.summonerId);
            if (identity) {
              const myPartId = identity.participantId;
              const myPart = lastGame.participants.find(p => p.participantId === myPartId);
              
              if (myPart && myPart.stats) {
                const stats = myPart.stats;
                const winText = stats.win ? "胜利" : "败北";
                const kda = `${stats.kills}_${stats.deaths}_${stats.assists}`;
                
                // Get champion name
                let championName = `英雄_${myPart.championId}`;
                try {
                  const champJson = await invoke("request_lcu", {
                    method: "GET",
                    endpoint: `/lol-game-data/assets/v1/champions/${myPart.championId}.json`,
                  });
                  if (champJson && champJson.name) {
                    championName = champJson.name;
                  }
                } catch (e) {}
                
                metadata = {
                  champion: championName,
                  kda: kda.replace(/_/g, "-"),
                  win: stats.win,
                  mode: lastGame.gameMode,
                };
                
                // Rename video file
                const dir = PathGetDirectoryName(filePath);
                const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "") + "_" + new Date().toTimeString().slice(0, 5).replace(/:/g, "");
                const newFilename = `${timestamp}_${championName}_${kda}_${winText}.mp4`;
                const newPath = `${dir}\\${newFilename}`;
                
                await invoke("rename_file", { oldPath: filePath, newPath });
                finalPath = newPath;
                recordName = newFilename;
                break;
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("LCU rename failed, keeping original name:", e);
    }
  }
  
  // Add to local history list in localStorage
  const history = JSON.parse(localStorage.getItem("historyRecords") || "[]");
  history.unshift({
    name: recordName,
    path: finalPath,
    date: new Date().toLocaleString(),
    champion: metadata?.champion || "自定义录制",
    kda: metadata?.kda || "-",
    win: metadata?.win,
  });
  localStorage.setItem("historyRecords", JSON.stringify(history));
}

// Path Helpers
function PathGetFileName(path) {
  return path.substring(path.lastIndexOf("\\") + 1);
}

// Directory Helpers
function PathGetDirectoryName(path) {
  return path.substring(0, path.lastIndexOf("\\"));
}

// Tab Switching
function setupTabs() {
  document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(btn => btn.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove("active"));
      
      button.classList.add("active");
      const tabId = "tab-" + button.getAttribute("data-tab");
      document.getElementById(tabId).classList.add("active");
      
      // Auto-refresh audio devices when switching to the settings tab
      if (button.getAttribute("data-tab") === "settings") {
        loadAudioDevices();
      }
    });
  });
}

// Autostart setup via Plugin
async function setupAutostart(enableFlag) {
  try {
    const autostart = window.__TAURI__?.autostart;
    if (autostart) {
      const isEnabled = await autostart.isEnabled();
      if (enableFlag && !isEnabled) {
        await autostart.enable();
      } else if (!enableFlag && isEnabled) {
        await autostart.disable();
      }
      const finalState = await autostart.isEnabled();
      document.getElementById("autostart-status").textContent = finalState ? "已开启" : "已关闭";
      document.getElementById("autostart-status").style.color = finalState ? "var(--success)" : "var(--gray)";
    }
  } catch (err) {
    console.error("Autostart error:", err);
  }
}

// Auto-save Settings Action
async function autoSaveSettings() {
  // If currently recording, do not allow saving settings
  if (isRecording) return;
  
  const newSettings = {
    saveDir: saveDirInput.value,
    resolution: videoResSelect.value,
    bitrate: parseInt(videoBitrateSelect.value),
    audioOutput: audioOutputSelect.value,
    audioInput: audioInputSelect.value,
    autostart: autostartToggle.checked,
  };
  saveSettings(newSettings);
  await setupAutostart(newSettings.autostart);
}

// Initialization on DOM load
window.addEventListener("DOMContentLoaded", async () => {
  lcuStatusText = document.getElementById("lcu-status-text");
  recordStatusText = document.getElementById("record-status-text");
  btnStartRecord = document.getElementById("btn-start-record");
  btnStopRecord = document.getElementById("btn-stop-record");
  
  saveDirInput = document.getElementById("save-dir");
  videoResSelect = document.getElementById("video-res");
  videoBitrateSelect = document.getElementById("video-bitrate");
  audioOutputSelect = document.getElementById("audio-output");
  audioInputSelect = document.getElementById("audio-input");
  autostartToggle = document.getElementById("autostart-toggle");
  
  // Set up Tabs
  setupTabs();
  
  // Set up settings
  const settings = getSettings();
  saveDirInput.value = settings.saveDir;
  videoResSelect.value = settings.resolution;
  videoBitrateSelect.value = settings.bitrate;
  autostartToggle.checked = settings.autostart;
  
  // Load audio list
  await loadAudioDevices();
  
  // Setup LCU status checker polling
  checkLcuStatus();
  setInterval(checkLcuStatus, 3000);
  
  // Setup Autostart status on startup
  setTimeout(() => setupAutostart(settings.autostart), 1000);

  // Prevent settings form from submitting on enter key
  document.getElementById("settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
  });
  
  // Attach auto-save event listeners on settings controls
  saveDirInput.addEventListener("input", autoSaveSettings);
  videoResSelect.addEventListener("change", autoSaveSettings);
  videoBitrateSelect.addEventListener("change", autoSaveSettings);
  audioOutputSelect.addEventListener("change", autoSaveSettings);
  audioInputSelect.addEventListener("change", autoSaveSettings);
  autostartToggle.addEventListener("change", autoSaveSettings);
  
  // Choose save directory button
  document.getElementById("btn-select-dir").addEventListener("click", async () => {
    try {
      const selected = await invoke("select_directory");
      if (selected) {
        saveDirInput.value = selected;
        autoSaveSettings(); // Trigger autosave after directory select
      }
    } catch (err) {
      console.error("Failed to select directory:", err);
    }
  });

  // Open save directory button
  document.getElementById("btn-open-dir").addEventListener("click", async () => {
    const path = saveDirInput.value;
    if (path) {
      try {
        await invoke("open_path", { path });
      } catch (err) {
        console.error("Failed to open directory:", err);
      }
    }
  });
  
  // Manual actions
  btnStartRecord.addEventListener("click", startRecordingAction);
  btnStopRecord.addEventListener("click", stopRecordingAction);

  // Hidden developer recording control panel toggle (5 consecutive clicks on version text)
  let versionClickCount = 0;
  let lastVersionClickTime = 0;
  
  document.getElementById("version-text").addEventListener("click", () => {
    const currentTime = Date.now();
    if (currentTime - lastVersionClickTime < 1500) {
      versionClickCount++;
    } else {
      versionClickCount = 1;
    }
    lastVersionClickTime = currentTime;
    
    if (versionClickCount === 5) {
      const devCard = document.getElementById("card-developer-control");
      if (devCard) {
        if (devCard.style.display === "none") {
          devCard.style.display = "flex";
          alert("开发者手动录像控制面板已开启！");
        } else {
          devCard.style.display = "none";
          alert("开发者手动录像控制面板已关闭！");
        }
      }
      versionClickCount = 0;
    }
  });

  // Listen to LCU monitor events emitted by Rust background monitor
  await listen("lcu-game-start", async () => {
    if (!isRecording) {
      console.log("Detect Gameflow InProgress, auto-start recording...");
      await startRecordingAction();
    }
  });
  
  await listen("lcu-game-end", async () => {
    if (isRecording) {
      console.log("Detect Gameflow finished, auto-stop recording...");
      await stopRecordingAction();
    }
  });
});
