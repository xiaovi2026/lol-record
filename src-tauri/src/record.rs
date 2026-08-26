use windows_capture::{
    capture::{Context, GraphicsCaptureApiHandler},
    graphics_capture_api::InternalCaptureControl,
    encoder::{AudioSettingsBuilder, ContainerSettingsBuilder, VideoEncoder, VideoSettingsBuilder},
    frame::Frame,
    monitor::Monitor,
    settings::{
        ColorFormat, CursorCaptureSettings, DrawBorderSettings, Settings,
        SecondaryWindowSettings, MinimumUpdateIntervalSettings, DirtyRegionSettings,
    },
};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::path::Path;

struct CaptureHandler {
    encoder: Arc<Mutex<Option<VideoEncoder>>>,
}

impl GraphicsCaptureApiHandler for CaptureHandler {
    type Flags = (String, u32, u32, u32, Arc<Mutex<Option<VideoEncoder>>>);
    type Error = Box<dyn std::error::Error + Send + Sync>;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        let (path, width, height, bitrate_mbps, shared_encoder) = ctx.flags;
        
        let video_settings = VideoSettingsBuilder::new(width, height)
            .frame_rate(60)
            .bitrate(bitrate_mbps * 1_000_000);
            
        let audio_settings = AudioSettingsBuilder::default().disabled(false);
        let container_settings = ContainerSettingsBuilder::default();
        
        let encoder = VideoEncoder::new(video_settings, audio_settings, container_settings, path)?;
        *shared_encoder.lock().unwrap() = Some(encoder);
        
        Ok(Self {
            encoder: shared_encoder,
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame<'_>,
        _capture_control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        if let Some(ref mut enc) = *self.encoder.lock().unwrap() {
            enc.send_frame(frame)?;
        }
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        if let Some(enc) = self.encoder.lock().unwrap().take() {
            let _ = enc.finish();
        }
        Ok(())
    }
}

// Wrapper for cpal::Stream to make it Send & Sync since WASAPI pointers can be shared safely inside Mutex.
pub struct SendStream(pub cpal::Stream);
unsafe impl Send for SendStream {}
unsafe impl Sync for SendStream {}

pub struct ActiveSession {
    capture_control: Option<windows_capture::capture::CaptureControl<CaptureHandler, Box<dyn std::error::Error + Send + Sync>>>,
    audio_streams: Vec<SendStream>,
    encoder: Arc<Mutex<Option<VideoEncoder>>>,
    v_zero: Arc<Mutex<Option<f64>>>,
    stop_signal: Arc<AtomicBool>,
    video_path: String,
}

pub static ACTIVE_SESSION: Mutex<Option<ActiveSession>> = Mutex::new(None);

pub fn is_recording_active() -> bool {
    ACTIVE_SESSION.lock().unwrap().is_some()
}

pub fn start_recording(
    output_path: &str,
    width: u32,
    height: u32,
    bitrate_mbps: u32,
    audio_output: &str,
    audio_input: &str,
) -> Result<(), String> {
    // Ensure parent directory exists
    let path = Path::new(output_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let encoder: Arc<Mutex<Option<VideoEncoder>>> = Arc::new(Mutex::new(None));
    let mut audio_streams = Vec::new();
    let host = cpal::default_host();
    
    // 1. Setup Audio loopback stream (Game sounds)
    if audio_output != "None" {
        let device = if audio_output == "Default" {
            host.default_output_device().ok_or("No default output device found")?
        } else {
            host.output_devices().map_err(|e| e.to_string())?
                .find(|d| d.name().map(|n| n == audio_output).unwrap_or(false))
                .ok_or(format!("Output device not found: {}", audio_output))?
        };
        
        let config = device.default_output_config().map_err(|e| e.to_string())?;
        let stream_config: cpal::StreamConfig = config.clone().into();
        
        let enc_audio = encoder.clone();
        
        let error_callback = |err| eprintln!("Audio loopback capture error: {:?}", err);
        
        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[f32], _| {
                        if let Some(ref mut enc) = *enc_audio.lock().unwrap() {
                            let mut byte_data = Vec::with_capacity(data.len() * 2);
                            for &sample in data {
                                let clamped = sample.clamp(-1.0, 1.0);
                                let val = (clamped * 32767.0) as i16;
                                byte_data.extend_from_slice(&val.to_le_bytes());
                            }
                            let _ = enc.send_audio_buffer(&byte_data, 0);
                        }
                    },
                    error_callback,
                    None
                )
            }
            cpal::SampleFormat::I16 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[i16], _| {
                        if let Some(ref mut enc) = *enc_audio.lock().unwrap() {
                            let mut byte_data = Vec::with_capacity(data.len() * 2);
                            for &val in data {
                                byte_data.extend_from_slice(&val.to_le_bytes());
                            }
                            let _ = enc.send_audio_buffer(&byte_data, 0);
                        }
                    },
                    error_callback,
                    None
                )
            }
            _ => Err(cpal::BuildStreamError::DeviceNotAvailable)
        }.map_err(|e| format!("Failed to build audio loopback stream: {}", e))?;
        
        stream.play().map_err(|e| e.to_string())?;
        audio_streams.push(SendStream(stream));
    }
    
    // 2. Setup Microphone stream
    if audio_input != "None" {
        let device = if audio_input == "Default" {
            host.default_input_device().ok_or("No default input device found")?
        } else {
            host.input_devices().map_err(|e| e.to_string())?
                .find(|d| d.name().map(|n| n == audio_input).unwrap_or(false))
                .ok_or(format!("Input device not found: {}", audio_input))?
        };
        
        let config = device.default_input_config().map_err(|e| e.to_string())?;
        let stream_config: cpal::StreamConfig = config.clone().into();
        let enc_audio = encoder.clone();
        let error_callback = |err| eprintln!("Microphone capture error: {:?}", err);
        
        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[f32], _| {
                        if let Some(ref mut enc) = *enc_audio.lock().unwrap() {
                            let mut byte_data = Vec::with_capacity(data.len() * 2);
                            for &sample in data {
                                let clamped = sample.clamp(-1.0, 1.0);
                                let val = (clamped * 32767.0) as i16;
                                byte_data.extend_from_slice(&val.to_le_bytes());
                            }
                            let _ = enc.send_audio_buffer(&byte_data, 0);
                        }
                    },
                    error_callback,
                    None
                )
            }
            cpal::SampleFormat::I16 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[i16], _| {
                        if let Some(ref mut enc) = *enc_audio.lock().unwrap() {
                            let mut byte_data = Vec::with_capacity(data.len() * 2);
                            for &val in data {
                                byte_data.extend_from_slice(&val.to_le_bytes());
                            }
                            let _ = enc.send_audio_buffer(&byte_data, 0);
                        }
                    },
                    error_callback,
                    None
                )
            }
            _ => Err(cpal::BuildStreamError::DeviceNotAvailable)
        }.map_err(|e| format!("Failed to build mic stream: {}", e))?;
        
        stream.play().map_err(|e| e.to_string())?;
        audio_streams.push(SendStream(stream));
    }
    
    // 3. Start WGC Screen Capture in a free-threaded background loop
    let monitor = Monitor::primary().map_err(|e| e.to_string())?;
    
    let settings = Settings::new(
        monitor,
        CursorCaptureSettings::Default,
        DrawBorderSettings::WithoutBorder,
        SecondaryWindowSettings::Default,
        MinimumUpdateIntervalSettings::Default,
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        (output_path.to_string(), width, height, bitrate_mbps, encoder.clone()),
    );
    
    // Start capture without blocking the thread
    let capture_control = CaptureHandler::start_free_threaded(settings)
        .map_err(|e| format!("Failed to start capture: {:?}", e))?;
        
    // Wait for the handler to populate the encoder in background thread
    let mut retries = 0;
    while encoder.lock().unwrap().is_none() && retries < 40 {
        std::thread::sleep(std::time::Duration::from_millis(50));
        retries += 1;
    }
    
    let v_zero = Arc::new(Mutex::new(None));
    let v_zero_clone = v_zero.clone();
    let stop_signal = Arc::new(AtomicBool::new(false));
    let stop_signal_clone = stop_signal.clone();
    
    // Spawn a light background thread to determine the video to game-time offset v_zero
    std::thread::spawn(move || {
        let client = match reqwest::blocking::Client::builder()
            .danger_accept_invalid_certs(true)
            .timeout(std::time::Duration::from_secs(1))
            .build() 
        {
            Ok(c) => c,
            Err(_) => return,
        };
        
        let start_time = std::time::Instant::now();
        
        while !stop_signal_clone.load(Ordering::Relaxed) {
            if let Ok(resp) = client.get("https://127.0.0.1:2999/liveclientdata/gamestats").send() {
                if let Ok(stats) = resp.json::<serde_json::Value>() {
                    if let Some(game_time) = stats.get("gameTime").and_then(|v| v.as_f64()) {
                        let elapsed = start_time.elapsed().as_secs_f64();
                        let zero_offset = elapsed - game_time;
                        *v_zero_clone.lock().unwrap() = Some(zero_offset);
                        break; // Successfully got the offset, exit thread!
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    });

    let mut session = ACTIVE_SESSION.lock().unwrap();
    *session = Some(ActiveSession {
        capture_control: Some(capture_control),
        audio_streams,
        encoder,
        v_zero,
        stop_signal,
        video_path: output_path.to_string(),
    });
    
    Ok(())
}

pub fn stop_recording() -> Result<String, String> {
    let mut session = ACTIVE_SESSION.lock().unwrap();
    if let Some(mut s) = session.take() {
        // Stop background thread loop
        s.stop_signal.store(true, Ordering::Relaxed);
        
        // Pause all audio streams
        for stream in s.audio_streams {
            let _ = stream.0.pause();
        }
        
        // Stop screen capture
        if let Some(control) = s.capture_control.take() {
            let _ = control.stop();
        }
        
        // Finalize the video encoder
        if let Some(enc) = s.encoder.lock().unwrap().take() {
            let _ = enc.finish();
        }
        
        // Generate events text file in background thread to avoid blocking UI
        let v_zero_val = *s.v_zero.lock().unwrap();
        let video_path = s.video_path.clone();
        if let Some(v_zero_offset) = v_zero_val {
            std::thread::spawn(move || {
                if let Err(e) = generate_event_txt(&video_path, v_zero_offset) {
                    eprintln!("Failed to generate event txt: {:?}", e);
                }
            });
        }
        
        return Ok("Success".to_string());
    }
    Err("No active recording found".to_string())
}

fn format_timestamp(seconds: f64) -> String {
    let total_secs = seconds.round() as u64;
    let hrs = total_secs / 3600;
    let mins = (total_secs % 3600) / 60;
    let secs = total_secs % 60;
    
    if hrs > 0 {
        format!("{:02}:{:02}:{:02}", hrs, mins, secs)
    } else {
        format!("{:02}:{:02}", mins, secs)
    }
}

fn generate_event_txt(video_path: &str, v_zero: f64) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let client = reqwest::blocking::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(2))
        .build()?;
        
    // 1. Fetch playerlist to map Summoner Name -> Champion Chinese Name
    let playerlist_url = "https://127.0.0.1:2999/liveclientdata/playerlist";
    let mut name_map = std::collections::HashMap::new();
    if let Ok(resp) = client.get(playerlist_url).send() {
        if let Ok(players) = resp.json::<serde_json::Value>() {
            if let Some(arr) = players.as_array() {
                for p in arr {
                    if let (Some(summoner), Some(champion)) = (
                        p.get("summonerName").and_then(|v| v.as_str()),
                        p.get("championName").and_then(|v| v.as_str())
                    ) {
                        let cn_champ = translate_champion(champion);
                        name_map.insert(summoner.to_string(), cn_champ.to_string());
                    }
                }
            }
        }
    }
    
    let get_name = |raw_name: &str| -> String {
        if let Some(translated) = name_map.get(raw_name) {
            translated.clone()
        } else {
            translate_champion(raw_name).to_string()
        }
    };

    // 2. Fetch eventdata
    let eventdata_url = "https://127.0.0.1:2999/liveclientdata/eventdata";
    let resp = client.get(eventdata_url).send()?;
    let data = resp.json::<serde_json::Value>()?;
    let events_arr = data.get("Events").and_then(|v| v.as_array()).ok_or("No events found")?;
    
    let mut lines = Vec::new();
    
    for event in events_arr {
        let name = match event.get("EventName").and_then(|v| v.as_str()) {
            Some(n) => n,
            None => continue,
        };
        
        let event_time = match event.get("EventTime").and_then(|v| v.as_f64()) {
            Some(t) => t,
            None => continue,
        };
        
        let video_time = v_zero + event_time;
        if video_time < 0.0 {
            continue;
        }
        
        let timestamp = format_timestamp(video_time);
        
        let desc = match name {
            "GameStart" => "游戏开始".to_string(),
            "GameEnd" => "游戏结束".to_string(),
            "MinionsSpawning" => "小兵已出击".to_string(),
            "FirstBlood" => {
                let recipient = event.get("Recipient").and_then(|v| v.as_str()).map(get_name).unwrap_or_default();
                if !recipient.is_empty() {
                    format!("[第一滴血] {} 拿下一血！", recipient)
                } else {
                    "[第一滴血] 产生了一血！".to_string()
                }
            }
            "ChampionKill" => {
                let killer = event.get("KillerName").and_then(|v| v.as_str()).map(get_name).unwrap_or_default();
                let victim = event.get("VictimName").and_then(|v| v.as_str()).map(get_name).unwrap_or_default();
                if !killer.is_empty() && !victim.is_empty() {
                    format!("[击杀] {} 击杀了 {}", killer, victim)
                } else {
                    continue;
                }
            }
            "Multikill" => {
                let killer = event.get("KillerName").and_then(|v| v.as_str()).map(get_name).unwrap_or_default();
                let streak = event.get("Streak").and_then(|v| v.as_u64()).unwrap_or(0);
                let streak_text = match streak {
                    2 => "双杀",
                    3 => "三杀",
                    4 => "四杀",
                    5 => "五杀",
                    _ => "多杀",
                };
                if !killer.is_empty() {
                    format!("[{}] {} 拿下了{}", streak_text, killer, streak_text)
                } else {
                    continue;
                }
            }
            "DragonKill" => {
                let killer = event.get("KillerName").and_then(|v| v.as_str()).map(get_name).unwrap_or_default();
                let dragon_type = event.get("DragonType").and_then(|v| v.as_str()).unwrap_or("小龙");
                let dragon_cn = match dragon_type {
                    "Fire" => "炼狱亚龙",
                    "Water" => "海洋亚龙",
                    "Earth" => "山脉亚龙",
                    "Air" => "云端亚龙",
                    "Hextech" => "海克斯科技亚龙",
                    "Chemtech" => "炼金科技亚龙",
                    "Elder" => "远古巨龙",
                    t => t,
                };
                if !killer.is_empty() {
                    format!("[小龙] {} 击杀了 {}", killer, dragon_cn)
                } else {
                    format!("[小龙] 击杀了 {}", dragon_cn)
                }
            }
            "BaronKill" => {
                let killer = event.get("KillerName").and_then(|v| v.as_str()).map(get_name).unwrap_or_default();
                if !killer.is_empty() {
                    format!("[大龙] {} 击杀了 纳什男爵", killer)
                } else {
                    "[大龙] 纳什男爵 被击杀".to_string()
                }
            }
            "HeraldKill" => {
                let killer = event.get("KillerName").and_then(|v| v.as_str()).map(get_name).unwrap_or_default();
                if !killer.is_empty() {
                    format!("[峡谷先锋] {} 击杀了 峡谷先锋", killer)
                } else {
                    "[峡谷先锋] 峡谷先锋 被击杀".to_string()
                }
            }
            "HordeKill" => {
                let killer = event.get("KillerName").and_then(|v| v.as_str()).map(get_name).unwrap_or_default();
                if !killer.is_empty() {
                    format!("[虚空巢虫] {} 击杀了 虚空巢虫", killer)
                } else {
                    "[虚空巢虫] 虚空巢虫 被击杀".to_string()
                }
            }
            "TurretKilled" => {
                let killer = event.get("KillerName").and_then(|v| v.as_str()).map(get_name).unwrap_or_default();
                if !killer.is_empty() {
                    format!("[推塔] 防御塔 被 {} 摧毁", killer)
                } else {
                    "[推塔] 防御塔 被摧毁".to_string()
                }
            }
            "InhibKilled" => {
                let killer = event.get("KillerName").and_then(|v| v.as_str()).map(get_name).unwrap_or_default();
                if !killer.is_empty() {
                    format!("[水晶] 水晶枢纽 被 {} 摧毁", killer)
                } else {
                    "[水晶] 水晶枢纽 被摧毁".to_string()
                }
            }
            _ => continue,
        };
        
        lines.push(format!("{} {}", timestamp, desc));
    }
    
    if !lines.is_empty() {
        let txt_path = Path::new(video_path).with_extension("txt");
        std::fs::write(&txt_path, lines.join("\n"))?;
        println!("Saved match events timeline to: {:?}", txt_path);
    }
    
    Ok(())
}

fn translate_champion(name: &str) -> &str {
    match name {
        "Aatrox" => "亚托克斯",
        "Ahri" => "阿狸",
        "Akali" => "阿卡丽",
        "Akshan" => "阿克尚",
        "Alistar" => "阿利斯塔",
        "Amumu" => "阿木木",
        "Anivia" => "艾尼维亚",
        "Annie" => "安妮",
        "Aphelios" => "厄斐琉斯",
        "Ashe" => "艾希",
        "AurelionSol" => "奥瑞利安索尔",
        "Azir" => "阿兹尔",
        "Bard" => "巴德",
        "Belveth" => "卑尔维斯",
        "Blitzcrank" => "布里茨",
        "Brand" => "布兰德",
        "Braum" => "布隆",
        "Briar" => "百裂冥犬",
        "Caitlyn" => "凯特琳",
        "Camille" => "卡蜜尔",
        "Cassiopeia" => "卡西奥佩娅",
        "Chogath" => "科加斯",
        "Corki" => "库奇",
        "Darius" => "德莱厄斯",
        "Diana" => "戴安娜",
        "DrMundo" => "蒙多医生",
        "Draven" => "德莱文",
        "Ekko" => "艾克",
        "Elise" => "伊莉丝",
        "Evelynn" => "伊芙琳",
        "Ezreal" => "伊泽瑞尔",
        "Fiddlesticks" => "费德提克",
        "Fiora" => "菲奥娜",
        "Fizz" => "菲兹",
        "Galio" => "加里奥",
        "Gangplank" => "普朗克",
        "Garen" => "盖伦",
        "Gnar" => "纳尔",
        "Gragas" => "古拉加斯",
        "Graves" => "格雷福斯",
        "Gwen" => "格温",
        "Hecarim" => "赫卡里姆",
        "Heimerdinger" => "黑默丁格",
        "Hwei" => "彗",
        "Illaoi" => "俄洛伊",
        "Irelia" => "艾瑞莉娅",
        "Ivern" => "艾翁",
        "Janna" => "迦娜",
        "JarvanIV" => "嘉文四世",
        "Jax" => "贾克斯",
        "Jayce" => "杰斯",
        "Jhin" => "烬",
        "Jinx" => "金克丝",
        "Kaisa" => "卡莎",
        "Kalista" => "卡莉丝塔",
        "Karma" => "卡尔玛",
        "Karthus" => "卡尔萨斯",
        "Kassadin" => "卡萨丁",
        "Katarina" => "卡特琳娜",
        "Kayle" => "凯尔",
        "Kayn" => "凯隐",
        "Kennen" => "凯南",
        "Khazix" => "卡兹克",
        "Kindred" => "千诀",
        "Kled" => "克烈",
        "KogMaw" => "克格莫",
        "Leblanc" => "乐芙兰",
        "LeeSin" => "李青",
        "Leona" => "蕾欧娜",
        "Lillia" => "莉莉娅",
        "Lissandra" => "丽桑卓",
        "Lucian" => "卢锡安",
        "Lulu" => "璐璐",
        "Lux" => "拉克丝",
        "Malphite" => "墨菲特",
        "Malzahar" => "马尔扎哈",
        "Maokai" => "茂凯",
        "MasterYi" => "易大师",
        "Milio" => "米利欧",
        "MissFortune" => "赏金猎人",
        "MonkeyKing" => "孙悟空",
        "Mordekaiser" => "莫德凯撒",
        "Morgana" => "莫甘娜",
        "Naafiri" => "纳afiri",
        "Nami" => "娜美",
        "Nasus" => "内瑟斯",
        "Nautilus" => "诺提勒斯",
        "Neeko" => "妮蔻",
        "Nidalee" => "奈德丽",
        "Nilah" => "尼菈",
        "Nocturne" => "魔腾",
        "Nunu" => "努努和威朗普",
        "Olaf" => "奥拉夫",
        "Orianna" => "奥莉安娜",
        "Ornn" => "奥恩",
        "Pantheon" => "潘森",
        "Poppy" => "波比",
        "Pyke" => "派克",
        "Qiyana" => "奇亚娜",
        "Quinn" => "奎因",
        "Rakan" => "洛",
        "Rammus" => "拉莫斯",
        "RekSai" => "雷克塞",
        "Rell" => "芮尔",
        "Renata" => "烈娜塔",
        "Renekton" => "雷克顿",
        "Rengar" => "雷恩加尔",
        "Riven" => "锐雯",
        "Rumble" => "兰博",
        "Ryze" => "瑞兹",
        "Samira" => "莎弥拉",
        "Sejuani" => "瑟庄妮",
        "Senna" => "赛娜",
        "Seraphine" => "萨勒芬妮",
        "Sett" => "瑟提",
        "Shaco" => "萨科",
        "Shen" => "慎",
        "Shyvana" => "希瓦娜",
        "Singed" => "辛吉德",
        "Sion" => "塞恩",
        "Sivir" => "希维尔",
        "Skarner" => "斯卡纳",
        "Sona" => "琴女",
        "Soraka" => "索拉卡",
        "Swain" => "斯维因",
        "Sylas" => "塞拉斯",
        "Syndra" => "辛德拉",
        "TahmKench" => "塔姆",
        "Taliyah" => "塔莉垭",
        "Talon" => "泰隆",
        "Taric" => "塔里克",
        "Teemo" => "提莫",
        "Thresh" => "锤石",
        "Tristana" => "崔丝塔娜",
        "Trundle" => "特朗德尔",
        "Tryndamere" => "蛮王",
        "TwistedFate" => "卡牌大师",
        "Twitch" => "图奇",
        "Udyr" => "乌迪尔",
        "Urgot" => "厄加特",
        "Varus" => "韦鲁斯",
        "Vayne" => "薇恩",
        "Veigar" => "维迦",
        "Velkoz" => "维克兹",
        "Vex" => "薇古丝",
        "Vi" => "蔚",
        "Viego" => "佛耶戈",
        "Viktor" => "维克托",
        "Vladimir" => "弗拉基米尔",
        "Volibear" => "沃利贝尔",
        "Warwick" => "沃里克",
        "Xayah" => "霞",
        "Xerath" => "泽拉斯",
        "XinZhao" => "赵信",
        "Yasuo" => "亚索",
        "Yone" => "永恩",
        "Yorick" => "约里克",
        "Yuumi" => "悠米",
        "Zac" => "扎克",
        "Zed" => "劫",
        "Zeri" => "泽丽",
        "Ziggs" => "吉格斯",
        "Zilean" => "基兰",
        "Zoe" => "佐伊",
        "Zyra" => "婕拉",
        other => other,
    }
}
