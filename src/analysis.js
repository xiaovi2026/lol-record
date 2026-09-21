const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// Global state
let currentVideoPath = null;
let currentGameId = null;
let currentDuration = 0;
let timeOffset = 0; // in seconds
let parsedEvents = [];
let participantsMap = {}; // participantId -> { championName, championId, summonerName, teamId }
let currentFilter = "all";
let championCache = {};
let currentSummonerId = null;

// DOM Elements
let video, playerContainer, overlayPlayBtn, playPauseIcon;
let currentTimeEl, totalDurationEl;
let progressWrapper, progressTrack, progressFill, progressTooltip;
let markersContainer;
let eventsListEl, eventsCountEl;
let matchSelect, lcuNotice, lcuNoticeText;
let offsetValText;

// Helper: Format seconds into MM:SS or HH:MM:SS
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// Helper: Translate champion name
async function getChampionCnName(engName) {
  if (!engName) return "未知英雄";
  if (championCache[engName]) return championCache[engName];
  try {
    const cnName = await invoke("translate_champion", { name: engName });
    championCache[engName] = cnName;
    return cnName;
  } catch (e) {
    return engName;
  }
}

// Built-in Champion ID to Chinese Name mapping
const CHAMPION_ID_TABLE = {
  1: "安妮", 2: "奥拉夫", 3: "加里奥", 4: "卡牌大师", 5: "赵信", 6: "厄加特", 7: "乐芙兰", 8: "弗拉基米尔", 9: "费德提克", 10: "凯尔",
  11: "易大师", 12: "阿利斯塔", 13: "瑞兹", 14: "塞恩", 15: "希维尔", 16: "索拉卡", 17: "提莫", 18: "崔丝塔娜", 19: "沃里克", 20: "努努和威朗普",
  21: "赏金猎人", 22: "艾希", 23: "蛮王", 24: "贾克斯", 25: "莫甘娜", 26: "基兰", 27: "辛吉德", 28: "伊芙琳", 29: "图奇", 30: "卡尔萨斯",
  31: "科加斯", 32: "阿木木", 33: "拉莫斯", 34: "艾尼维亚", 35: "萨科", 36: "蒙多医生", 37: "琴女", 38: "卡萨丁", 39: "艾瑞莉娅", 40: "迦娜",
  41: "普朗克", 42: "库奇", 43: "卡尔玛", 44: "塔里克", 45: "维迦", 48: "特朗德尔", 50: "斯维因", 51: "凯特琳", 53: "布里茨", 54: "墨菲特",
  55: "卡特琳娜", 56: "魔腾", 57: "茂凯", 58: "雷克顿", 59: "嘉文四世", 60: "伊莉丝", 61: "奥莉安娜", 62: "孙悟空", 63: "布兰德", 64: "李青",
  67: "薇恩", 68: "兰博", 69: "卡西奥佩娅", 72: "斯卡纳", 74: "黑默丁格", 75: "内瑟斯", 76: "奈德丽", 77: "乌迪尔", 78: "波比", 79: "古拉加斯",
  80: "潘森", 81: "伊泽瑞尔", 82: "莫德凯撒", 83: "约里克", 84: "阿卡丽", 85: "凯南", 86: "盖伦", 89: "蕾欧娜", 90: "马尔扎哈", 91: "泰隆",
  92: "锐雯", 96: "克格莫", 98: "慎", 99: "拉克丝", 101: "泽拉斯", 102: "希瓦娜", 103: "阿狸", 104: "格雷福斯", 105: "菲兹", 106: "沃利贝尔",
  107: "雷恩加尔", 110: "韦鲁斯", 111: "诺提勒斯", 112: "维克托", 113: "瑟庄妮", 114: "菲奥娜", 115: "吉格斯", 117: "璐璐", 119: "德莱文", 120: "赫卡里姆",
  121: "卡兹克", 122: "德莱厄斯", 126: "杰斯", 127: "丽桑卓", 131: "戴安娜", 133: "奎因", 134: "辛德拉", 136: "奥瑞利安索尔", 141: "凯隐", 142: "佐伊",
  143: "婕拉", 145: "卡莎", 147: "萨勒芬妮", 150: "纳尔", 154: "扎克", 157: "亚索", 161: "维克兹", 163: "塔莉垭", 164: "卡蜜尔", 166: "阿克尚",
  200: "卑尔维斯", 201: "布隆", 202: "烬", 203: "千诀", 221: "泽丽", 222: "金克丝", 223: "塔姆", 233: "百裂冥犬", 234: "佛耶戈", 235: "赛娜",
  236: "卢锡安", 238: "劫", 240: "克烈", 245: "艾克", 246: "奇亚娜", 254: "蔚", 266: "亚托克斯", 267: "娜美", 268: "阿兹尔", 350: "悠米",
  360: "莎弥拉", 412: "锤石", 420: "俄洛伊", 421: "雷克塞", 427: "艾翁", 429: "卡莉丝塔", 432: "巴德", 497: "洛", 498: "霞", 516: "奥恩",
  517: "塞拉斯", 518: "妮蔻", 523: "厄斐琉斯", 526: "芮尔", 555: "派克", 711: "薇古丝", 777: "永恩", 875: "瑟提", 876: "莉莉娅", 887: "格温",
  888: "烈娜塔", 893: "阿萝拉", 895: "尼菈", 897: "奎桑提", 901: "斯莫德", 902: "米利欧", 910: "彗", 950: "纳afiri"
};

let championIdMap = { ...CHAMPION_ID_TABLE };

// Asynchronously load champion summary from LCU to enrich or update champion names
async function initChampionSummary() {
  try {
    const summary = await invoke("request_lcu", {
      method: "GET",
      endpoint: "/lol-game-data/assets/v1/champion-summary.json",
    });
    if (Array.isArray(summary)) {
      for (const c of summary) {
        if (!c || c.id <= 0) continue;
        let cnName = c.title || c.name;
        if (c.alias) {
          const translated = await getChampionCnName(c.alias);
          if (translated && translated !== c.alias) {
            cnName = translated;
          }
        }
        if (cnName) {
          championIdMap[c.id] = cnName;
        }
      }
    }
  } catch (e) {
    // Fallback to built-in table
  }
}

// Translate Game Mode to Chinese
function getGameModeCnName(gameMode, queueId) {
  const queueMap = {
    420: "排位赛 单双排",
    440: "排位赛 灵活排",
    430: "匹配模式 (自选)",
    490: "快速匹配",
    450: "极地大乱斗",
    1700: "斗魂竞技场",
    1710: "斗魂竞技场",
    900: "无限乱斗",
    1900: "无限火力",
    1020: "克隆大作战",
    1300: "极限闪击",
    1400: "终极魔典",
    830: "入门人机",
    840: "新手人机",
    850: "一般人机",
    1810: "无尽狂潮",
    1820: "无尽狂潮",
    1830: "无尽狂潮",
    1840: "无尽狂潮",
  };
  if (queueId && queueMap[queueId]) {
    return queueMap[queueId];
  }

  const modeMap = {
    "CLASSIC": "召唤师峡谷",
    "ARAM": "极地大乱斗",
    "CHERRY": "斗魂竞技场",
    "URF": "无限火力",
    "ARURF": "无限乱斗",
    "ONEFORALL": "克隆大作战",
    "NEXUSBLITZ": "极限闪击",
    "ULTBOOK": "终极魔典",
    "PRACTICETOOL": "训练模式",
    "TUTORIAL": "新手教程",
    "SWARM": "无尽狂潮",
    "DOOMBOTSTEEMO": "末日人机",
  };
  return (gameMode && modeMap[gameMode.toUpperCase()]) || gameMode || "经典对局";
}

// Format match timestamp to MM-DD HH:mm
function formatMatchDate(timestampMs) {
  if (!timestampMs) return "";
  const d = new Date(timestampMs);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${m}-${day} ${h}:${min}`;
}

// Extract timestamp from video file name (e.g. record20260920-225425.mp4)
function extractTimestampFromFilename(filePathOrName) {
  if (!filePathOrName) return null;
  const filename = filePathOrName.split(/[\\/]/).pop();

  // Pattern 1: (record)?YYYYMMDD[-_]?HHMMSS
  const p1 = /(?:record)?(\d{4})(\d{2})(\d{2})[-_]?(\d{2})(\d{2})(\d{2})/i;
  const m1 = filename.match(p1);
  if (m1) {
    const year = parseInt(m1[1], 10);
    const month = parseInt(m1[2], 10) - 1;
    const day = parseInt(m1[3], 10);
    const hour = parseInt(m1[4], 10);
    const min = parseInt(m1[5], 10);
    const sec = parseInt(m1[6], 10);
    const date = new Date(year, month, day, hour, min, sec);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  // Pattern 2: YYYY[-_. ]MM[-_. ]DD[-_. ]HH[-_.:]MM[-_.:]SS
  const p2 = /(\d{4})[-_.](\d{2})[-_.](\d{2})[-_ ]+(\d{2})[-_.:](\d{2})[-_.:](\d{2})/;
  const m2 = filename.match(p2);
  if (m2) {
    const year = parseInt(m2[1], 10);
    const month = parseInt(m2[2], 10) - 1;
    const day = parseInt(m2[3], 10);
    const hour = parseInt(m2[4], 10);
    const min = parseInt(m2[5], 10);
    const sec = parseInt(m2[6], 10);
    const date = new Date(year, month, day, hour, min, sec);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  return null;
}

// Calculate time distance between video timestamp and game creation/duration
function getMatchTimeDistance(videoTimeMs, game) {
  const start = game.gameCreation;
  const duration = (game.gameDuration || 0) * 1000;
  const end = start + duration;

  // Video was recorded inside the match duration
  if (videoTimeMs >= start && videoTimeMs <= end) {
    return 0;
  }
  // Video was saved after the match ended (typical for 英雄时刻, e.g. 1-10 mins after end)
  if (videoTimeMs > end) {
    return videoTimeMs - end;
  }
  // Video was named before game start
  return start - videoTimeMs;
}

// Translate monster names
function getMonsterCnName(monsterType, monsterSubType) {
  if (monsterType === "DRAGON") {
    switch (monsterSubType) {
      case "FIRE_DRAGON": return "炼狱亚龙";
      case "WATER_DRAGON": return "海洋亚龙";
      case "EARTH_DRAGON": return "山脉亚龙";
      case "AIR_DRAGON": return "云端亚龙";
      case "HEXTECH_DRAGON": return "海克斯科技亚龙";
      case "CHEMTECH_DRAGON": return "炼金科技亚龙";
      case "ELDER_DRAGON": return "远古巨龙";
      default: return "小龙";
    }
  } else if (monsterType === "BARON_NASHOR") {
    return "纳什男爵 (大龙)";
  } else if (monsterType === "RIFTHERALD") {
    return "峡谷先锋";
  } else if (monsterType === "HORDE") {
    return "虚空巢虫";
  }
  return monsterType || "史诗野怪";
}

// Translate building names
function getBuildingCnName(buildingType, towerType, laneType) {
  const laneCn = {
    "TOP_LANE": "上路",
    "MID_LANE": "中路",
    "BOT_LANE": "下路"
  }[laneType] || "";

  if (buildingType === "TOWER_BUILDING") {
    const towerCn = {
      "OUTER_TURRET": "一塔",
      "INNER_TURRET": "二塔",
      "BASE_TURRET": "高地塔",
      "NEXUS_TURRET": "门牙塔"
    }[towerType] || "防御塔";
    return `${laneCn}${towerCn}`;
  } else if (buildingType === "INHIBITOR_BUILDING") {
    return `${laneCn}水晶枢纽`;
  }
  return "建筑物";
}

// Initialize video player
function initVideoPlayer() {
  video = document.getElementById("match-video");
  playerContainer = document.getElementById("player-container");
  overlayPlayBtn = document.getElementById("overlay-play-btn");
  playPauseIcon = document.getElementById("play-pause-icon");
  currentTimeEl = document.getElementById("current-time");
  totalDurationEl = document.getElementById("total-duration");
  progressWrapper = document.getElementById("progress-wrapper");
  progressTrack = document.getElementById("progress-track");
  progressFill = document.getElementById("progress-fill");
  progressTooltip = document.getElementById("progress-tooltip");
  markersContainer = document.getElementById("event-markers-container");
  offsetValText = document.getElementById("offset-val-text");

  // Play / Pause toggle
  const togglePlay = () => {
    if (video.paused || video.ended) {
      video.play();
    } else {
      video.pause();
    }
  };

  document.getElementById("btn-play-pause").addEventListener("click", togglePlay);
  overlayPlayBtn.addEventListener("click", togglePlay);
  video.addEventListener("click", togglePlay);

  video.addEventListener("play", () => {
    playPauseIcon.textContent = "⏸";
    overlayPlayBtn.style.display = "none";
  });

  video.addEventListener("pause", () => {
    playPauseIcon.textContent = "▶";
    overlayPlayBtn.style.display = "flex";
  });

  // Duration change / Metadata loaded
  video.addEventListener("loadedmetadata", () => {
    currentDuration = video.duration;
    totalDurationEl.textContent = formatTime(currentDuration);
    renderMarkers();
  });

  video.addEventListener("durationchange", () => {
    currentDuration = video.duration;
    totalDurationEl.textContent = formatTime(currentDuration);
    renderMarkers();
  });

  // Time update
  video.addEventListener("timeupdate", () => {
    const cur = video.currentTime;
    currentTimeEl.textContent = formatTime(cur);

    if (currentDuration > 0) {
      const pct = (cur / currentDuration) * 100;
      progressFill.style.width = `${pct}%`;
    }

    // Highlight current timeline event
    highlightActiveEvent(cur);
  });

  // Progress bar seeking
  let isSeeking = false;

  const seek = (e) => {
    const rect = progressTrack.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (currentDuration > 0) {
      video.currentTime = pos * currentDuration;
    }
  };

  progressTrack.addEventListener("mousedown", (e) => {
    isSeeking = true;
    seek(e);
  });

  window.addEventListener("mousemove", (e) => {
    if (isSeeking) {
      seek(e);
    }
  });

  window.addEventListener("mouseup", () => {
    if (isSeeking) isSeeking = false;
  });

  // Hover tooltip on progress track
  progressTrack.addEventListener("mousemove", (e) => {
    const rect = progressTrack.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const hoverTime = pos * currentDuration;
    progressTooltip.style.left = `${pos * 100}%`;
    progressTooltip.textContent = formatTime(hoverTime);
    progressTooltip.style.opacity = "1";
  });

  progressTrack.addEventListener("mouseleave", () => {
    progressTooltip.style.opacity = "0";
  });

  // Speed selection
  const speedSelect = document.getElementById("speed-select");
  speedSelect.addEventListener("change", () => {
    video.playbackRate = parseFloat(speedSelect.value);
  });

  // Volume & Mute
  const volumeSlider = document.getElementById("volume-slider");
  const muteBtn = document.getElementById("btn-mute");
  const muteIcon = document.getElementById("mute-icon");

  volumeSlider.addEventListener("input", () => {
    video.volume = parseFloat(volumeSlider.value);
    video.muted = video.volume === 0;
    muteIcon.textContent = video.muted ? "🔇" : "🔊";
  });

  muteBtn.addEventListener("click", () => {
    video.muted = !video.muted;
    muteIcon.textContent = video.muted ? "🔇" : "🔊";
    volumeSlider.value = video.muted ? 0 : video.volume;
  });

  // Fullscreen
  document.getElementById("btn-fullscreen").addEventListener("click", () => {
    if (!document.fullscreenElement) {
      playerContainer.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen();
    }
  });

  // Time Offset Controls
  document.getElementById("btn-offset-minus").addEventListener("click", () => {
    timeOffset -= 1;
    updateOffsetUI();
  });

  document.getElementById("btn-offset-plus").addEventListener("click", () => {
    timeOffset += 1;
    updateOffsetUI();
  });

  document.getElementById("btn-offset-reset").addEventListener("click", () => {
    timeOffset = 0;
    updateOffsetUI();
  });

  // Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;

    if (e.code === "Space") {
      e.preventDefault();
      togglePlay();
    } else if (e.code === "ArrowLeft") {
      e.preventDefault();
      video.currentTime = Math.max(0, video.currentTime - 5);
    } else if (e.code === "ArrowRight") {
      e.preventDefault();
      video.currentTime = Math.min(currentDuration, video.currentTime + 5);
    } else if (e.code === "KeyF") {
      e.preventDefault();
      if (!document.fullscreenElement) {
        playerContainer.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }
  });
}

function updateOffsetUI() {
  offsetValText.textContent = `${timeOffset >= 0 ? "+" : ""}${timeOffset}s`;
  renderMarkers();
}

// Jump video to event time
function jumpToEventTime(eventSec) {
  const targetTime = Math.max(0, eventSec + timeOffset);
  video.currentTime = targetTime;
  if (video.paused) {
    video.play();
  }
}

// Render Event Markers on Video Progress Bar
function renderMarkers() {
  if (!markersContainer) return;
  markersContainer.innerHTML = "";

  if (currentDuration <= 0 || parsedEvents.length === 0) return;

  parsedEvents.forEach((ev) => {
    const adjustedTime = ev.time + timeOffset;
    if (adjustedTime < 0 || adjustedTime > currentDuration) return;

    const pct = (adjustedTime / currentDuration) * 100;
    const marker = document.createElement("div");
    marker.className = `event-marker marker-${ev.category}`;
    marker.style.left = `${pct}%`;

    // Tooltip attribute
    marker.setAttribute(
      "title",
      `${formatTime(ev.time)} [${ev.categoryTitle}] ${ev.summary}`
    );

    marker.addEventListener("click", (e) => {
      e.stopPropagation();
      jumpToEventTime(ev.time);
    });

    markersContainer.appendChild(marker);
  });
}

// Highlight active event in right-side list
function highlightActiveEvent(currentSec) {
  if (parsedEvents.length === 0) return;

  const adjustedCur = currentSec - timeOffset;

  let activeIndex = -1;
  for (let i = 0; i < parsedEvents.length; i++) {
    if (parsedEvents[i].time <= adjustedCur + 1.5) {
      activeIndex = i;
    } else {
      break;
    }
  }

  const items = eventsListEl.querySelectorAll(".event-item");
  items.forEach((item, idx) => {
    if (idx === activeIndex) {
      if (!item.classList.contains("active")) {
        item.classList.add("active");
        item.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } else {
      item.classList.remove("active");
    }
  });
}

// Render right-side events list with filter
function renderEventsList() {
  if (!eventsListEl) return;
  eventsListEl.innerHTML = "";

  const filtered = parsedEvents.filter((ev) => {
    if (currentFilter === "all") return true;
    return ev.category === currentFilter;
  });

  eventsCountEl.textContent = `共 ${filtered.length} 个事件`;

  if (filtered.length === 0) {
    eventsListEl.innerHTML = `
      <div class="events-empty-placeholder">
        <span class="empty-icon">🔍</span>
        <span>当前分类暂无事件</span>
      </div>
    `;
    return;
  }

  filtered.forEach((ev) => {
    const item = document.createElement("div");
    item.className = `event-item category-${ev.category}`;
    item.dataset.time = ev.time;

    item.innerHTML = `
      <div class="event-time-badge">${formatTime(ev.time)}</div>
      <div class="event-icon-circle icon-${ev.category}">${ev.icon}</div>
      <div class="event-info">
        <div class="event-headline">
          <span class="event-cat-tag tag-${ev.category}">${ev.categoryTitle}</span>
          <span class="event-desc-main">${ev.title}</span>
        </div>
        <div class="event-details-sub">${ev.detail}</div>
      </div>
    `;

    item.addEventListener("click", () => {
      jumpToEventTime(ev.time);
    });

    eventsListEl.appendChild(item);
  });
}

// Parse LCU Game Timeline & Match Details
async function loadMatchTimeline(gameId) {
  currentGameId = gameId;
  eventsListEl.innerHTML = `
    <div class="events-empty-placeholder">
      <span class="empty-icon">⏳</span>
      <span>正在拉取对局时间线事件...</span>
    </div>
  `;

  try {
    // 1. Fetch match details
    const matchData = await invoke("request_lcu", {
      method: "GET",
      endpoint: `/lol-match-history/v1/games/${gameId}`,
    });

    // Parse participants map
    participantsMap = {};
    if (matchData && matchData.participants) {
      for (const p of matchData.participants) {
        const ident = matchData.participantIdentities?.find(
          (id) => id.participantId === p.participantId
        );
        const summonerName = ident?.player?.summonerName || ident?.player?.gameName || `玩家${p.participantId}`;

        let champEng = `Champion_${p.championId}`;
        if (championIdMap[p.championId]) {
          champEng = championIdMap[p.championId];
        } else {
          try {
            const champData = await invoke("request_lcu", {
              method: "GET",
              endpoint: `/lol-game-data/assets/v1/champions/${p.championId}.json`,
            });
            if (champData && champData.name) {
              champEng = champData.name;
            }
          } catch (e) {}
        }

        const champCn = championIdMap[p.championId] || await getChampionCnName(champEng);

        participantsMap[p.participantId] = {
          participantId: p.participantId,
          championId: p.championId,
          championName: champCn,
          summonerName,
          teamId: p.teamId,
        };
      }
    }

    // 2. Fetch timeline
    const timelineData = await invoke("request_lcu", {
      method: "GET",
      endpoint: `/lol-match-history/v1/game-timelines/${gameId}`,
    });

    parsedEvents = [];

    if (timelineData && timelineData.frames) {
      for (const frame of timelineData.frames) {
        if (!frame.events) continue;

        for (const ev of frame.events) {
          const timeSec = Math.floor(ev.timestamp / 1000);

          if (ev.type === "CHAMPION_KILL") {
            const killer = participantsMap[ev.killerId]?.championName || "防御塔/野怪";
            const victim = participantsMap[ev.victimId]?.championName || "敌方英雄";
            const assists = (ev.assistingParticipantIds || [])
              .map((id) => participantsMap[id]?.championName)
              .filter(Boolean);

            const assistText = assists.length > 0 ? ` (助攻: ${assists.join(", ")})` : "";

            parsedEvents.push({
              time: timeSec,
              category: "kill",
              categoryTitle: "击杀",
              icon: "⚔️",
              title: `${killer} 击杀了 ${victim}`,
              detail: `${killer} 击杀 ${victim}${assistText}`,
              summary: `${killer} 击杀了 ${victim}`,
            });
          } else if (ev.type === "ELITE_MONSTER_KILL") {
            const killer = participantsMap[ev.killerId]?.championName || "某方队伍";
            const monsterName = getMonsterCnName(ev.monsterType, ev.monsterSubType);

            parsedEvents.push({
              time: timeSec,
              category: "monster",
              categoryTitle: "中立生物",
              icon: ev.monsterType === "DRAGON" ? "🐉" : "👾",
              title: `${killer} 击杀了 ${monsterName}`,
              detail: `${killer} 击杀 ${monsterName}`,
              summary: `${killer} 击杀了 ${monsterName}`,
            });
          } else if (ev.type === "BUILDING_KILL") {
            const killer = participantsMap[ev.killerId]?.championName || "小兵/超级兵";
            const bldgName = getBuildingCnName(ev.buildingType, ev.towerType, ev.laneType);

            parsedEvents.push({
              time: timeSec,
              category: "building",
              categoryTitle: "建筑物",
              icon: "🏛️",
              title: `${bldgName} 被摧毁`,
              detail: `${killer} 摧毁了 ${bldgName}`,
              summary: `${killer} 摧毁了 ${bldgName}`,
            });
          }
        }
      }
    }

    // Sort events chronologically
    parsedEvents.sort((a, b) => a.time - b.time);

    // Update match summary in header
    updateHeaderSummary(matchData);

    // Render list & markers
    renderEventsList();
    renderMarkers();
  } catch (err) {
    console.error("Failed to load match timeline:", err);
    eventsListEl.innerHTML = `
      <div class="events-empty-placeholder">
        <span class="empty-icon">❌</span>
        <span>加载对局时间线失败: ${err}</span>
      </div>
    `;
  }
}

// Update Match Summary in Top Header
function updateHeaderSummary(matchData) {
  const summaryHeader = document.getElementById("match-summary-header");
  if (!matchData) {
    if (summaryHeader) summaryHeader.style.display = "none";
    return;
  }

  // Find user's participant info
  let myPart = null;
  if (currentSummonerId && matchData.participantIdentities) {
    const ident = matchData.participantIdentities.find(
      (id) =>
        id.player?.summonerId === currentSummonerId ||
        id.player?.accountId === currentSummonerId ||
        id.player?.currentAccountId === currentSummonerId
    );
    if (ident) {
      myPart = matchData.participants?.find((p) => p.participantId === ident.participantId);
    }
  }
  if (!myPart) {
    myPart = matchData.participants?.[0];
  }

  if (myPart && summaryHeader) {
    summaryHeader.style.display = "flex";
    const myChamp = participantsMap[myPart.participantId]?.championName || championIdMap[myPart.championId] || "-";
    const stats = myPart.stats;
    const kda = stats ? `${stats.kills}/${stats.deaths}/${stats.assists}` : "-";
    const win = stats?.win;

    document.getElementById("summary-champ-name").textContent = myChamp;
    document.getElementById("summary-kda").textContent = `KDA: ${kda}`;
    
    const resEl = document.getElementById("summary-result");
    resEl.textContent = win ? "胜利" : "败北";
    resEl.className = `result-badge ${win ? "result-win" : "result-loss"}`;

    document.getElementById("summary-mode").textContent = getGameModeCnName(matchData.gameMode, matchData.queueId);
  }
}

// Fetch matches list from LCU and populate dropdown
async function fetchMatchesList() {
  try {
    const status = await invoke("get_lcu_status");
    if (!status || !status.connected) {
      lcuNotice.style.display = "flex";
      if (status && status.permission_denied) {
        lcuNoticeText.textContent = "检测到英雄联盟客户端运行中，但缺少管理员权限无法读取战绩。请以管理员身份运行本程序。";
      } else {
        lcuNoticeText.textContent = "未检测到运行中的英雄联盟客户端，无法自动关联战绩时间线。";
      }
      matchSelect.innerHTML = '<option value="">客户端未连接</option>';
      return;
    }

    lcuNotice.style.display = "none";

    const summoner = await invoke("request_lcu", {
      method: "GET",
      endpoint: "/lol-summoner/v1/current-summoner",
    });
    if (summoner) {
      currentSummonerId = summoner.summonerId || summoner.accountId || null;
    }

    // Initialize champion summary mapping
    await initChampionSummary();

    const matchesData = await invoke("request_lcu", {
      method: "GET",
      endpoint: "/lol-match-history/v1/products/lol/current-summoner/matches",
    });

    if (matchesData && matchesData.games && matchesData.games.games) {
      const games = matchesData.games.games;
      matchSelect.innerHTML = "";

      // 1. Extract timestamp from video file name and calculate matching score
      const videoTime = extractTimestampFromFilename(currentVideoPath);
      let bestMatchGame = null;
      let minDistance = Infinity;

      if (videoTime) {
        for (const g of games) {
          const dist = getMatchTimeDistance(videoTime, g);
          if (dist < minDistance) {
            minDistance = dist;
            bestMatchGame = g;
          }
        }
      }

      // Consider it auto-matched if distance is within 2 hours
      const isAutoMatched = bestMatchGame && minDistance <= 2 * 60 * 60 * 1000;
      const matchedGameId = isAutoMatched ? bestMatchGame.gameId : null;

      // 2. Populate dropdown options
      for (const g of games) {
        const myIdent = g.participantIdentities?.find(
          (id) =>
            (summoner?.summonerId && id.player?.summonerId === summoner.summonerId) ||
            (summoner?.accountId && id.player?.accountId === summoner.accountId) ||
            (summoner?.accountId && id.player?.currentAccountId === summoner.accountId) ||
            (summoner?.gameName && id.player?.gameName === summoner.gameName) ||
            (summoner?.displayName && id.player?.summonerName === summoner.displayName)
        );
        const myPart = g.participants?.find(
          (p) => p.participantId === myIdent?.participantId
        ) || g.participants?.[0];

        const win = myPart?.stats?.win ? "胜利" : "败北";
        const kda = myPart?.stats
          ? `${myPart.stats.kills}/${myPart.stats.deaths}/${myPart.stats.assists}`
          : "-/-/-";

        const champName = championIdMap[myPart?.championId] || (myPart?.championId ? `英雄_${myPart.championId}` : "未知英雄");
        const modeName = getGameModeCnName(g.gameMode, g.queueId);
        const matchTime = formatMatchDate(g.gameCreation);

        const isThisGameMatched = matchedGameId === g.gameId;

        const opt = document.createElement("option");
        opt.value = g.gameId;

        let label = `[${win}] ${champName} · ${modeName} | ${kda} (${matchTime})`;
        if (isThisGameMatched) {
          label = `🎯 [自动匹配] ${label}`;
        }
        opt.textContent = label;
        matchSelect.appendChild(opt);
      }

      // 3. Select target game:
      // Priority 1: explicitly passed currentGameId (if any)
      // Priority 2: auto-matched game by video filename timestamp
      // Priority 3: latest game (games[0])
      let targetGameId = currentGameId;
      if (!targetGameId && matchedGameId) {
        targetGameId = matchedGameId;
      }
      if (!targetGameId) {
        targetGameId = games[0]?.gameId;
      }

      if (targetGameId) {
        matchSelect.value = targetGameId;
        await loadMatchTimeline(targetGameId);
      }
    }
  } catch (err) {
    console.error("Failed to fetch matches list:", err);
    lcuNotice.style.display = "flex";
    lcuNoticeText.textContent = "拉取战绩列表失败: " + err;
  }
}

// Handle video init data
async function handleInitData(initData) {
  if (!initData || !initData.video_path) return;

  currentVideoPath = initData.video_path;
  currentGameId = initData.game_id || null;

  // Extract filename
  const filename = currentVideoPath.split(/[\\/]/).pop();
  document.getElementById("video-filename-display").textContent = filename;

  // Set video source using Tauri's convertFileSrc
  const videoSrc = window.__TAURI__.core.convertFileSrc(currentVideoPath);
  video.src = videoSrc;
  video.load();

  // Load LCU matches
  await fetchMatchesList();
}

window.addEventListener("DOMContentLoaded", async () => {
  eventsListEl = document.getElementById("events-list");
  eventsCountEl = document.getElementById("events-count");
  matchSelect = document.getElementById("match-select");
  lcuNotice = document.getElementById("lcu-notice");
  lcuNoticeText = document.getElementById("lcu-notice-text");

  initVideoPlayer();

  // Match selector change
  matchSelect.addEventListener("change", () => {
    const selectedId = matchSelect.value;
    if (selectedId) {
      loadMatchTimeline(selectedId);
    }
  });

  // Refresh button
  document.getElementById("btn-refresh-timeline").addEventListener("click", () => {
    fetchMatchesList();
  });

  // Category filter tabs
  document.querySelectorAll(".filter-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".filter-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentFilter = tab.dataset.filter;
      renderEventsList();
    });
  });

  // Get initial data from Rust state
  try {
    const initData = await invoke("get_analysis_init_data");
    if (initData) {
      await handleInitData(initData);
    }
  } catch (e) {
    console.error("Failed to get analysis init data:", e);
  }

  // Listen for reload-analysis events
  try {
    await listen("reload-analysis", async (event) => {
      await handleInitData(event.payload);
    });
  } catch (e) {
    console.error("Failed to listen to reload-analysis event:", e);
  }
});
