const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// Global state
let currentFilePath = null;
let isRecording = false;
let lcuCredentials = null;
let recordStartTime = null;
let recordTimerInterval = null;

// DOM Elements
let lcuStatusText, recordStatusText;
let btnStartRecord, btnStopRecord;
let saveDirInput, videoResSelect, videoBitrateSelect;
let audioOutputSelect, audioInputSelect, autostartToggle;

// Load config from localStorage or default
function getSettings() {
  return {
    saveDir: localStorage.getItem("saveDir") || "D:\\LoL-Records",
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
    const currentOutput = audioOutputSelect.value || localStorage.getItem("audioOutput") || "Default";
    const currentInput = audioInputSelect.value || localStorage.getItem("audioInput") || "None";
    
    audioOutputSelect.innerHTML = '<option value="Default">系统默认输出设备</option><option value="None">不录制系统音</option>';
    audioInputSelect.innerHTML = '<option value="Default">系统默认麦克风</option><option value="None">不录制麦克风</option>';
    
    devices.outputs.forEach(dev => {
      const opt = document.createElement("option");
      opt.value = dev.name;
      opt.textContent = dev.name + (dev.is_default ? " (默认)" : "");
      audioOutputSelect.appendChild(opt);
    });
    
    devices.inputs.forEach(dev => {
      const opt = document.createElement("option");
      opt.value = dev.name;
      opt.textContent = dev.name + (dev.is_default ? " (默认)" : "");
      audioInputSelect.appendChild(opt);
    });
    
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
    const actualRecording = await invoke("get_recording_status");
    const indicator = document.getElementById("lcu-indicator");
    const lcuBadge = document.getElementById("lcu-badge");
    const lcuPlaceholder = document.getElementById("lcu-placeholder");
    const lcuDetails = document.getElementById("lcu-details");
    
    // Sync UI with actual backend recording state
    if (!actualRecording && isRecording) {
      console.log("Backend recording stopped, syncing UI...");
      updateRecordingUI(false);
    }
    
    if (creds) {
      lcuCredentials = creds;
      lcuStatusText.textContent = `已连接 (通信端口: ${creds.port})`;
      
      if (indicator) indicator.className = "card-icon-circle icon-success";
      if (lcuBadge) {
        lcuBadge.className = "badge badge-success";
        lcuBadge.textContent = "已连接";
      }
      if (lcuPlaceholder) lcuPlaceholder.style.display = "none";
      if (lcuDetails) lcuDetails.style.display = "flex";

      // Fetch Summoner Info
      try {
        const summoner = await invoke("request_lcu", { method: "GET", endpoint: "/lol-summoner/v1/current-summoner" });
        if (summoner && (summoner.displayName || summoner.gameName)) {
          const profileBox = document.getElementById("summoner-profile-box");
          const nameEl = document.getElementById("summoner-name");
          const levelEl = document.getElementById("summoner-level");
          if (profileBox) profileBox.style.display = "flex";
          if (nameEl) nameEl.textContent = summoner.gameName ? `${summoner.gameName} #${summoner.tagLine || ""}` : summoner.displayName;
          if (levelEl) levelEl.textContent = `等级: Lv.${summoner.summonerLevel || 1}`;
        }
      } catch (e) {
        // Summoner info might be pending
      }
      
      // Fetch Gameflow Phase & Session
      try {
        const phase = await invoke("request_lcu", { method: "GET", endpoint: "/lol-gameflow/v1/gameflow-phase" });
        if (phase) {
          const phaseTranslations = {
            "None": "大厅空闲",
            "Lobby": "组队房间中",
            "Matchmaking": "正在匹配对局",
            "ReadyCheck": "找到对局 (就绪确认)",
            "ChampSelect": "英雄选择中",
            "GameStart": "游戏载入启动中",
            "InProgress": "🎮 游戏进行中 (录像中)",
            "PreEndOfGame": "对局即将结束",
            "EndOfGame": "对局结算中",
            "WaitingForStats": "等待战绩数据",
          };
          const cleanPhase = phase.replace(/"/g, "");
          const phaseEl = document.getElementById("game-phase");
          if (phaseEl) phaseEl.textContent = phaseTranslations[cleanPhase] || cleanPhase;
          
          // Auto start / stop sync based on gameflow phase
          if (cleanPhase === "InProgress" && !isRecording && !actualRecording) {
            console.log("Gameflow is InProgress, auto-starting recording...");
            await startRecordingAction();
          } else if (cleanPhase !== "InProgress" && (isRecording || actualRecording)) {
            console.log("Gameflow phase changed to", cleanPhase, "auto-stopping recording...");
            await stopRecordingAction();
          }
        }

        const session = await invoke("request_lcu", { method: "GET", endpoint: "/lol-gameflow/v1/session" });
        const modeEl = document.getElementById("game-mode");
        if (session && session.gameData && modeEl) {
          modeEl.textContent = session.gameData.queue?.name || session.gameData.gameMode || "匹配/排位模式";
        } else if (modeEl) {
          modeEl.textContent = "大厅就绪";
        }
      } catch (e) {
        // Ignored
      }
    } else {
      lcuCredentials = null;
      lcuStatusText.textContent = "未检测到客户端运行";
      
      if (indicator) indicator.className = "card-icon-circle icon-danger";
      if (lcuBadge) {
        lcuBadge.className = "badge badge-danger";
        lcuBadge.textContent = "未连接";
      }
      if (lcuPlaceholder) lcuPlaceholder.style.display = "flex";
      if (lcuDetails) lcuDetails.style.display = "none";
      const profileBox = document.getElementById("summoner-profile-box");
      if (profileBox) profileBox.style.display = "none";

      // If client closed while recording, stop recording immediately
      if (isRecording || actualRecording) {
        console.log("LOL client disconnected, stopping recording...");
        await stopRecordingAction();
      }
    }
  } catch (err) {
    console.error(err);
  }
}

// Timer helper for recording
function startRecordTimer() {
  recordStartTime = Date.now();
  const timerEl = document.getElementById("rec-duration");
  if (recordTimerInterval) clearInterval(recordTimerInterval);
  
  recordTimerInterval = setInterval(() => {
    if (!recordStartTime) return;
    const diff = Math.floor((Date.now() - recordStartTime) / 1000);
    const mins = String(Math.floor(diff / 60)).padStart(2, "0");
    const secs = String(diff % 60).padStart(2, "0");
    if (timerEl) timerEl.textContent = `录制中: ${mins}:${secs}`;
  }, 1000);
}

function stopRecordTimer() {
  if (recordTimerInterval) {
    clearInterval(recordTimerInterval);
    recordTimerInterval = null;
  }
  recordStartTime = null;
}

// Update recording status in UI
function updateRecordingUI(recording, filename = "") {
  isRecording = recording;
  const indicator = document.getElementById("record-indicator");
  const recordBadge = document.getElementById("record-badge");
  const recordDetails = document.getElementById("record-details");
  const recordPlaceholder = document.getElementById("record-placeholder");
  const sidebarRecordDot = document.getElementById("sidebar-record-dot");
  const sidebarRecordText = document.getElementById("sidebar-record-text");
  
  const settings = getSettings();
  
  if (recording) {
    recordStatusText.textContent = "正在实时录制中";
    if (indicator) indicator.className = "card-icon-circle icon-success";
    if (recordBadge) {
      recordBadge.className = "badge badge-success";
      recordBadge.textContent = "录制中";
    }
    if (sidebarRecordDot) sidebarRecordDot.className = "status-dot dot-success";
    if (sidebarRecordText) sidebarRecordText.textContent = "🔴 录制中...";
    
    btnStartRecord.disabled = true;
    btnStopRecord.disabled = false;
    
    if (recordDetails) recordDetails.style.display = "flex";
    if (recordPlaceholder) recordPlaceholder.style.display = "none";
    
    document.getElementById("record-source").textContent = lcuCredentials ? "英雄联盟对局 (全自动)" : "手动控制录像";
    document.getElementById("record-specs").textContent = `${settings.resolution} @ ${settings.bitrate}Mbps`;
    document.getElementById("game-filepath").textContent = filename;
    
    startRecordTimer();
  } else {
    recordStatusText.textContent = "待命中 (对局开始自动触发)";
    if (indicator) indicator.className = "card-icon-circle icon-gray";
    if (recordBadge) {
      recordBadge.className = "badge badge-gray";
      recordBadge.textContent = "空闲";
    }
    if (sidebarRecordDot) sidebarRecordDot.className = "status-dot dot-gray";
    if (sidebarRecordText) sidebarRecordText.textContent = "录像待命中";
    
    btnStartRecord.disabled = false;
    btnStopRecord.disabled = true;
    
    if (recordDetails) recordDetails.style.display = "none";
    if (recordPlaceholder) recordPlaceholder.style.display = "flex";
    
    stopRecordTimer();
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
    if (field) field.disabled = recording;
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
    
    // Auto rename match
    setTimeout(() => handleMatchRename(origPath), 3000);
  } catch (err) {
    alert("停止录像失败: " + err);
  }
}

// Fetch match stats from LCU and rename the file
async function handleMatchRename(filePath) {
  if (!lcuCredentials) return;
  
  try {
    const summoner = await invoke("request_lcu", { method: "GET", endpoint: "/lol-summoner/v1/current-summoner" });
    if (summoner && summoner.summonerId) {
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const matchData = await invoke("request_lcu", {
          method: "GET",
          endpoint: "/lol-match-history/v1/products/lol/current-summoner/matches",
        });
        
        if (matchData && matchData.games && matchData.games.games && matchData.games.games.length > 0) {
          const lastGame = matchData.games.games[0];
          const identity = lastGame.participantIdentities.find(id => id.player && id.player.summonerId === summoner.summonerId);
          if (identity) {
            const myPartId = identity.participantId;
            const myPart = lastGame.participants.find(p => p.participantId === myPartId);
            
            if (myPart && myPart.stats) {
              const stats = myPart.stats;
              const winText = stats.win ? "胜利" : "败北";
              const kda = `${stats.kills}_${stats.deaths}_${stats.assists}`;
              
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
              
              const dir = PathGetDirectoryName(filePath);
              const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
              const timeStr = new Date().toTimeString().slice(0, 5).replace(/:/g, "");
              const newFilename = `${dateStr}_${timeStr}_${championName}_${kda}_${winText}.mp4`;
              const newPath = `${dir}\\${newFilename}`;
              
              await invoke("rename_file", { oldPath: filePath, newPath });
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

// Directory Helpers
function PathGetDirectoryName(path) {
  return path.substring(0, path.lastIndexOf("\\"));
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
      const statusEl = document.getElementById("autostart-status");
      if (statusEl) {
        statusEl.textContent = finalState ? "已开启" : "已关闭";
        statusEl.style.color = finalState ? "var(--success)" : "var(--text-dim)";
      }
    }
  } catch (err) {
    console.error("Autostart error:", err);
  }
}

// Auto-save Settings Action
async function autoSaveSettings() {
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
  
  const settings = getSettings();
  saveDirInput.value = settings.saveDir;
  videoResSelect.value = settings.resolution;
  videoBitrateSelect.value = settings.bitrate;
  autostartToggle.checked = settings.autostart;
  
  await loadAudioDevices();
  
  checkLcuStatus();
  setInterval(checkLcuStatus, 3000);
  
  setTimeout(() => setupAutostart(settings.autostart), 1000);

  document.getElementById("settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
  });
  
  saveDirInput.addEventListener("input", autoSaveSettings);
  videoResSelect.addEventListener("change", autoSaveSettings);
  videoBitrateSelect.addEventListener("change", autoSaveSettings);
  audioOutputSelect.addEventListener("change", autoSaveSettings);
  audioInputSelect.addEventListener("change", autoSaveSettings);
  autostartToggle.addEventListener("change", autoSaveSettings);
  
  // Select directory button
  document.getElementById("btn-select-dir").addEventListener("click", async () => {
    try {
      const selected = await invoke("select_directory");
      if (selected) {
        saveDirInput.value = selected;
        autoSaveSettings();
      }
    } catch (err) {
      console.error("Failed to select directory:", err);
    }
  });

  // Open directory buttons
  const openSaveDirHandler = async () => {
    const path = saveDirInput.value;
    if (path) {
      try {
        await invoke("open_path", { path });
      } catch (err) {
        console.error("Failed to open directory:", err);
      }
    }
  };
  
  document.getElementById("btn-open-dir").addEventListener("click", openSaveDirHandler);
  
  const quickOpen = document.getElementById("btn-quick-open-dir");
  if (quickOpen) quickOpen.addEventListener("click", openSaveDirHandler);
  
  // Refresh status button
  const refreshBtn = document.getElementById("btn-refresh-status");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      await checkLcuStatus();
      await loadAudioDevices();
    });
  }
  
  // Manual actions
  btnStartRecord.addEventListener("click", startRecordingAction);
  btnStopRecord.addEventListener("click", stopRecordingAction);

  // Hidden developer recording control panel toggle (5 consecutive clicks on version text)
  let versionClickCount = 0;
  let lastVersionClickTime = 0;
  
  const versionTextEl = document.getElementById("version-text");
  if (versionTextEl) {
    versionTextEl.addEventListener("click", () => {
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
            devCard.style.display = "block";
            alert("开发者手动录像控制面板已开启！");
          } else {
            devCard.style.display = "none";
            alert("开发者手动录像控制面板已隐藏！");
          }
        }
        versionClickCount = 0;
      }
    });
  }

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
