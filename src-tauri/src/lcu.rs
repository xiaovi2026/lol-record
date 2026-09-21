use sysinfo::System;
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LcuCredentials {
    pub port: u16,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LcuStatusResult {
    pub connected: bool,
    pub port: Option<u16>,
    pub token: Option<String>,
    pub process_found: bool,
    pub permission_denied: bool,
}

pub fn get_lcu_status_detail() -> LcuStatusResult {
    let mut system = System::new_all();
    system.refresh_processes();
    
    let port_re = Regex::new(r#"--app-port="?(\d+)"?"#).unwrap();
    let token_re = Regex::new(r#"--remoting-auth-token="?([a-zA-Z0-9_\-]+)"?"#).unwrap();
    
    let mut process_found = false;
    let mut candidate_dirs: Vec<std::path::PathBuf> = Vec::new();

    for (_, process) in system.processes() {
        let name = process.name().to_lowercase();
        // LeagueClientUx is the main process with the auth token and port
        if name == "leagueclientux.exe" || name == "leagueclientux" || name.contains("leagueclientux") {
            process_found = true;
            
            if let Some(exe_path) = process.exe() {
                if let Some(parent) = exe_path.parent() {
                    candidate_dirs.push(parent.to_path_buf());
                }
            }

            let cmd = process.cmd().join(" ");
            if let (Some(port_cap), Some(token_cap)) = (port_re.captures(&cmd), token_re.captures(&cmd)) {
                if let (Some(port_match), Some(token_match)) = (port_cap.get(1), token_cap.get(1)) {
                    if let Ok(port) = port_match.as_str().parse::<u16>() {
                        let token = token_match.as_str().to_string();
                        return LcuStatusResult {
                            connected: true,
                            port: Some(port),
                            token: Some(token),
                            process_found: true,
                            permission_denied: false,
                        };
                    }
                }
            }
        }
    }

    // Try reading lockfile from candidate dirs (e.g. Riot client or international servers)
    for dir in candidate_dirs {
        let lockfile_path = dir.join("lockfile");
        if lockfile_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&lockfile_path) {
                let parts: Vec<&str> = content.trim().split(':').collect();
                if parts.len() >= 4 {
                    if let Ok(port) = parts[2].parse::<u16>() {
                        let token = parts[3].to_string();
                        if !token.is_empty() {
                            return LcuStatusResult {
                                connected: true,
                                port: Some(port),
                                token: Some(token),
                                process_found: true,
                                permission_denied: false,
                            };
                        }
                    }
                }
            }
        }
    }

    if process_found {
        LcuStatusResult {
            connected: false,
            port: None,
            token: None,
            process_found: true,
            permission_denied: true,
        }
    } else {
        LcuStatusResult {
            connected: false,
            port: None,
            token: None,
            process_found: false,
            permission_denied: false,
        }
    }
}

pub fn get_lcu_credentials() -> Option<LcuCredentials> {
    let status = get_lcu_status_detail();
    if status.connected {
        Some(LcuCredentials {
            port: status.port?,
            token: status.token?,
        })
    } else {
        None
    }
}

pub fn translate_champion(name: &str) -> &str {
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
