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
let recordsList;

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
    
    // Restore settings
    const settings = getSettings();
    audioOutputSelect.value = settings.audioOutput;
    audioInputSelect.value = settings.audioInput;
  } catch (err) {
    console.error("Failed to load audio devices:", err);
  }
}

// Check LCU connection state
async function checkLcuStatus() {
  try {
    const creds = await invoke("get_lcu_status");
    if (creds) {
      lcuCredentials = creds;
      lcuStatusText.textContent = `已连接 (端口: ${creds.port})`;
      lcuStatusText.className = "status-text text-success";
      document.getElementById("card-lcu").style.borderColor = "var(--success)";
    } else {
      lcuCredentials = null;
      lcuStatusText.textContent = "未检测到客户端运行";
      lcuStatusText.className = "status-text text-danger";
      document.getElementById("card-lcu").style.borderColor = "var(--border-color)";
    }
  } catch (err) {
    console.error(err);
  }
}

// Update recording status in UI
function updateRecordingUI(recording, filename = "") {
  isRecording = recording;
  if (recording) {
    recordStatusText.textContent = "正在录制中";
    recordStatusText.className = "status-text text-success recording-blink";
    document.getElementById("card-record").style.borderColor = "var(--success)";
    btnStartRecord.disabled = true;
    btnStopRecord.disabled = false;
    
    document.getElementById("game-info-box").style.display = "block";
    document.getElementById("game-mode").textContent = lcuCredentials ? "英雄联盟对局" : "手动录像";
    document.getElementById("game-phase").textContent = "录像进行中";
    document.getElementById("game-filepath").textContent = filename;
  } else {
    recordStatusText.textContent = "未开始录制";
    recordStatusText.className = "status-text text-gray";
    document.getElementById("card-record").style.borderColor = "var(--border-color)";
    btnStartRecord.disabled = false;
    btnStopRecord.disabled = true;
    document.getElementById("game-info-box").style.display = "none";
  }
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
  
  // Add to local history list
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
  renderHistory();
}

// Path Helpers
function PathGetFileName(path) {
  return path.substring(path.lastIndexOf("\\") + 1);
}

function PathGetDirectoryName(path) {
  return path.substring(0, path.lastIndexOf("\\"));
}

// Render recording list
function renderHistory() {
  const history = JSON.parse(localStorage.getItem("historyRecords") || "[]");
  recordsList.innerHTML = "";
  
  if (history.length === 0) {
    recordsList.innerHTML = '<div class="no-records">暂无录像记录，开始一场游戏吧！</div>';
    return;
  }
  
  history.forEach((record, index) => {
    const item = document.createElement("div");
    item.className = "record-item";
    
    let resultBadge = "";
    if (record.win !== undefined) {
      resultBadge = record.win 
        ? '<span class="text-success">[胜利]</span>' 
        : '<span class="text-danger">[败北]</span>';
    }
    
    item.innerHTML = `
      <div class="record-info">
        <h4>${record.name}</h4>
        <p>时间: ${record.date} | 英雄: ${record.champion} | KDA: ${record.kda} ${resultBadge}</p>
      </div>
      <button class="btn btn-secondary btn-open-item" data-path="${record.path}">播放</button>
    `;
    
    // Open path handler (uses shell)
    item.querySelector(".btn-open-item").addEventListener("click", () => {
      invoke("plugin:opener|open_path", { path: record.path });
    });
    
    recordsList.appendChild(item);
  });
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
  recordsList = document.getElementById("records-list");
  
  // Set up Tabs
  setupTabs();
  
  // Set up settings
  const settings = getSettings();
  saveDirInput.value = settings.saveDir;
  videoResSelect.value = settings.resolution;
  videoBitrateSelect.value = settings.bitrate;
  autostartToggle.checked = settings.autostart;
  
  // Load audio list and render history
  await loadAudioDevices();
  renderHistory();
  
  // Setup LCU status checker polling
  checkLcuStatus();
  setInterval(checkLcuStatus, 3000);
  
  // Setup Autostart status on startup
  setTimeout(() => setupAutostart(settings.autostart), 1000);

  // Form submit handler
  document.getElementById("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
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
    alert("设置保存成功！");
  });
  
  // Choose save directory button
  document.getElementById("btn-select-dir").addEventListener("click", async () => {
    try {
      const selected = await invoke("select_directory");
      if (selected) {
        saveDirInput.value = selected;
      }
    } catch (err) {
      console.error("Failed to select directory:", err);
    }
  });
  
  // Refresh audio device list button
  document.getElementById("btn-refresh-audio").addEventListener("click", async () => {
    await loadAudioDevices();
    alert("音频设备列表已刷新！");
  });
  
  // Manual actions
  btnStartRecord.addEventListener("click", startRecordingAction);
  btnStopRecord.addEventListener("click", stopRecordingAction);
  
  // Clear records toolbar actions
  document.getElementById("btn-open-folder").addEventListener("click", () => {
    const settings = getSettings();
    invoke("plugin:opener|open_path", { path: settings.saveDir });
  });
  
  document.getElementById("btn-clear-history").addEventListener("click", () => {
    if (confirm("确定要清空录像历史列表吗？(这不会删除本地硬盘上的视频文件)")) {
      localStorage.setItem("historyRecords", "[]");
      renderHistory();
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
