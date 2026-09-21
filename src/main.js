const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

let lcuCredentials = null;

// Check LCU connection state and details
async function checkLcuStatus() {
  try {
    const creds = await invoke("get_lcu_status");
    const indicator = document.getElementById("lcu-indicator");
    const lcuBadge = document.getElementById("lcu-badge");
    const lcuStatusText = document.getElementById("lcu-status-text");
    const profileBox = document.getElementById("summoner-profile-box");
    const nameEl = document.getElementById("summoner-name");
    const levelEl = document.getElementById("summoner-level");

    if (creds) {
      lcuCredentials = creds;
      lcuStatusText.textContent = `已连接 (通信端口: ${creds.port})`;

      if (indicator) indicator.className = "card-icon-circle icon-success";
      if (lcuBadge) {
        lcuBadge.className = "badge badge-success";
        lcuBadge.textContent = "已连接";
      }

      // Fetch Summoner Info
      try {
        const summoner = await invoke("request_lcu", {
          method: "GET",
          endpoint: "/lol-summoner/v1/current-summoner",
        });
        if (summoner && (summoner.displayName || summoner.gameName)) {
          if (profileBox) profileBox.style.display = "flex";
          if (nameEl) {
            nameEl.textContent = summoner.gameName
              ? `${summoner.gameName} #${summoner.tagLine || ""}`
              : summoner.displayName;
          }
          if (levelEl) {
            levelEl.textContent = `等级: Lv.${summoner.summonerLevel || 1}`;
          }
        }
      } catch (e) {
        // Pending summoner info
      }
    } else {
      lcuCredentials = null;
      lcuStatusText.textContent = "未检测到客户端运行";

      if (indicator) indicator.className = "card-icon-circle icon-danger";
      if (lcuBadge) {
        lcuBadge.className = "badge badge-danger";
        lcuBadge.textContent = "未连接";
      }
      if (profileBox) profileBox.style.display = "none";
    }
  } catch (err) {
    console.error("LCU check error:", err);
  }
}

// Handle imported video file
async function handleImportVideo(filePath) {
  if (!filePath) return;
  console.log("Importing video file:", filePath);

  try {
    // Open analysis window
    await invoke("open_analysis_window", {
      videoPath: filePath,
      gameId: null,
    });
  } catch (err) {
    alert("打开对局录像分析窗口失败: " + err);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  // LCU Status Check
  checkLcuStatus();
  setInterval(checkLcuStatus, 3000);


  // GitHub button
  const btnGithub = document.getElementById("btn-github");
  if (btnGithub) {
    btnGithub.addEventListener("click", async () => {
      try {
        await invoke("open_path", {
          path: "https://github.com/xiaovi2026/lol-record",
        });
      } catch (e) {
        window.open("https://github.com/xiaovi2026/lol-record", "_blank");
      }
    });
  }

  // File Select Button
  const btnSelectFile = document.getElementById("btn-select-file");
  if (btnSelectFile) {
    btnSelectFile.addEventListener("click", async () => {
      try {
        const selected = await invoke("select_video_file");
        if (selected) {
          await handleImportVideo(selected);
        }
      } catch (err) {
        console.error("Failed to select video file:", err);
      }
    });
  }

  // Drag & Drop Area Setup
  const dropzone = document.getElementById("dropzone");
  const dropzoneOverlay = document.getElementById("dropzone-overlay");

  if (dropzone) {
    dropzone.addEventListener("dragenter", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropzoneOverlay) dropzoneOverlay.classList.add("active");
    });

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropzoneOverlay) dropzoneOverlay.classList.add("active");
    });

    dropzone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Only remove if leaving the dropzone entirely
      if (e.target === dropzone || e.target === dropzoneOverlay) {
        if (dropzoneOverlay) dropzoneOverlay.classList.remove("active");
      }
    });

    dropzone.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropzoneOverlay) dropzoneOverlay.classList.remove("active");

      // HTML5 file drop
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        // In electron/tauri webview, File object often has .path property
        const path = file.path;
        if (path) {
          await handleImportVideo(path);
          return;
        }
      }
    });
  }

  // Tauri native drag-drop event listener
  try {
    await listen("tauri://drag-drop", async (event) => {
      if (dropzoneOverlay) dropzoneOverlay.classList.remove("active");
      const paths = event.payload?.paths;
      if (paths && paths.length > 0) {
        const firstFile = paths[0];
        await handleImportVideo(firstFile);
      }
    });

    await listen("tauri://drag-enter", () => {
      if (dropzoneOverlay) dropzoneOverlay.classList.add("active");
    });

    await listen("tauri://drag-leave", () => {
      if (dropzoneOverlay) dropzoneOverlay.classList.remove("active");
    });
  } catch (e) {
    console.log("Native drag-drop listener not supported in this context, fallback to HTML5 drop.");
  }
});
