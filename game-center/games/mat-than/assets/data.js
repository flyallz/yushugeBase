/*
  Mắt Thần Hán Tự — ngân hàng câu hỏi cố định V1.2.
  Mỗi Level có 10 nhóm × 5 chữ = 50 câu thật.
  Mỗi Bậc lấy đúng 1 chữ từ mỗi nhóm => 10 câu, không lặp target trong cùng Bậc.
  Hai mode Nhìn nghĩa và Flash dùng chung ngân hàng nội dung nhưng có tiến độ/kỷ lục riêng.
*/
window.HANZI_LEVELS = {
  "1": {
    "tier": "Sơ cấp",
    "flashMs": 2000,
    "families": [
      {
        "name": "Nhóm 门",
        "tip": "Cùng có khung 门; tập trung vào phần nằm bên trong khung cửa.",
        "chars": [
          [
            "问",
            "wèn",
            "hỏi"
          ],
          [
            "间",
            "jiān",
            "khoảng; gian/phòng"
          ],
          [
            "闻",
            "wén",
            "nghe; ngửi"
          ],
          [
            "闲",
            "xián",
            "rảnh"
          ],
          [
            "闷",
            "mèn",
            "buồn bực"
          ]
        ]
      },
      {
        "name": "Nhóm 青",
        "tip": "Phần 青 gần như giữ nguyên; bộ bên trái cho biết nghĩa: 讠, 氵, 忄, 日, 目.",
        "chars": [
          [
            "请",
            "qǐng",
            "mời; xin"
          ],
          [
            "清",
            "qīng",
            "sạch; trong"
          ],
          [
            "情",
            "qíng",
            "tình cảm"
          ],
          [
            "晴",
            "qíng",
            "trời quang"
          ],
          [
            "睛",
            "jīng",
            "tròng mắt"
          ]
        ]
      },
      {
        "name": "Nhóm 马",
        "tip": "Quan sát bộ đứng trước hoặc phía trên 马 để phân biệt chức năng của chữ.",
        "chars": [
          [
            "马",
            "mǎ",
            "ngựa"
          ],
          [
            "妈",
            "mā",
            "mẹ"
          ],
          [
            "吗",
            "ma",
            "trợ từ nghi vấn"
          ],
          [
            "骂",
            "mà",
            "mắng"
          ],
          [
            "码",
            "mǎ",
            "mã; số hiệu"
          ]
        ]
      },
      {
        "name": "Nhóm 包",
        "tip": "Phần 包 giống nhau; bộ bên trái là dấu hiệu nhận biết nhanh.",
        "chars": [
          [
            "跑",
            "pǎo",
            "chạy"
          ],
          [
            "抱",
            "bào",
            "ôm"
          ],
          [
            "饱",
            "bǎo",
            "no"
          ],
          [
            "泡",
            "pào",
            "ngâm; bọt"
          ],
          [
            "炮",
            "pào",
            "pháo"
          ]
        ]
      },
      {
        "name": "Nhóm 方",
        "tip": "Nhìn bộ ghép với 方: 攵, 户, 阝, 讠, 纟.",
        "chars": [
          [
            "放",
            "fàng",
            "thả; đặt"
          ],
          [
            "房",
            "fáng",
            "phòng; nhà"
          ],
          [
            "防",
            "fáng",
            "phòng tránh"
          ],
          [
            "访",
            "fǎng",
            "thăm; phỏng vấn"
          ],
          [
            "纺",
            "fǎng",
            "kéo sợi; dệt"
          ]
        ]
      },
      {
        "name": "Nhóm 艮",
        "tip": "Phần bên phải gần giống 艮; chú ý bộ bên trái để nhận diện.",
        "chars": [
          [
            "很",
            "hěn",
            "rất"
          ],
          [
            "跟",
            "gēn",
            "theo; cùng"
          ],
          [
            "根",
            "gēn",
            "gốc; rễ"
          ],
          [
            "银",
            "yín",
            "bạc"
          ],
          [
            "恨",
            "hèn",
            "hận"
          ]
        ]
      },
      {
        "name": "Nhóm 也",
        "tip": "Các chữ đều giữ phần 也; bộ bên trái thay đổi: 亻, 女, 土, 氵.",
        "chars": [
          [
            "也",
            "yě",
            "cũng"
          ],
          [
            "他",
            "tā",
            "anh ấy"
          ],
          [
            "她",
            "tā",
            "cô ấy"
          ],
          [
            "地",
            "dì",
            "đất"
          ],
          [
            "池",
            "chí",
            "ao"
          ]
        ]
      },
      {
        "name": "Nhóm 主",
        "tip": "Phần 主 được giữ lại; nhận diện qua 亻, 彳, 氵, 木, 马.",
        "chars": [
          [
            "住",
            "zhù",
            "ở; cư trú"
          ],
          [
            "往",
            "wǎng",
            "hướng tới; đi về"
          ],
          [
            "注",
            "zhù",
            "ghi chú; đổ vào"
          ],
          [
            "柱",
            "zhù",
            "cột"
          ],
          [
            "驻",
            "zhù",
            "đóng quân; lưu lại"
          ]
        ]
      },
      {
        "name": "Nhóm 及",
        "tip": "Phần 及 là điểm chung; quan sát 纟, 木, 口, 土 hoặc chữ đứng độc lập.",
        "chars": [
          [
            "级",
            "jí",
            "cấp; lớp"
          ],
          [
            "极",
            "jí",
            "cực; rất"
          ],
          [
            "吸",
            "xī",
            "hít"
          ],
          [
            "及",
            "jí",
            "và; kịp"
          ],
          [
            "圾",
            "jī",
            "rác (trong 垃圾)"
          ]
        ]
      },
      {
        "name": "Nhóm 寺",
        "tip": "Phần 寺 gần nhau; bộ bên trái giúp phân biệt nghĩa.",
        "chars": [
          [
            "特",
            "tè",
            "đặc biệt"
          ],
          [
            "诗",
            "shī",
            "thơ"
          ],
          [
            "待",
            "dài",
            "đợi"
          ],
          [
            "持",
            "chí",
            "cầm; duy trì"
          ],
          [
            "侍",
            "shì",
            "hầu hạ"
          ]
        ]
      }
    ]
  },
  "2": {
    "tier": "Sơ cấp",
    "flashMs": 1900,
    "families": [
      {
        "name": "Nhóm 亥",
        "tip": "Nhìn phần đứng cạnh 亥: 讠, 子, 木, 口 hoặc 刂.",
        "chars": [
          [
            "该",
            "gāi",
            "nên"
          ],
          [
            "孩",
            "hái",
            "đứa trẻ"
          ],
          [
            "核",
            "hé",
            "lõi; hạt nhân"
          ],
          [
            "咳",
            "ké",
            "ho"
          ],
          [
            "刻",
            "kè",
            "khắc; chạm khắc"
          ]
        ]
      },
      {
        "name": "Nhóm 佥",
        "tip": "Phần bên phải gần giống 佥; phân biệt qua 木, 月, 阝, 马, 扌.",
        "chars": [
          [
            "检",
            "jiǎn",
            "kiểm tra"
          ],
          [
            "脸",
            "liǎn",
            "mặt"
          ],
          [
            "险",
            "xiǎn",
            "nguy hiểm"
          ],
          [
            "验",
            "yàn",
            "kiểm nghiệm"
          ],
          [
            "捡",
            "jiǎn",
            "nhặt"
          ]
        ]
      },
      {
        "name": "Nhóm 奂",
        "tip": "Phần 奂 giống nhau; bộ bên trái lần lượt là 扌, 口, 火, 氵, 疒.",
        "chars": [
          [
            "换",
            "huàn",
            "đổi"
          ],
          [
            "唤",
            "huàn",
            "gọi"
          ],
          [
            "焕",
            "huàn",
            "rực rỡ"
          ],
          [
            "涣",
            "huàn",
            "tan rã"
          ],
          [
            "痪",
            "huàn",
            "liệt"
          ]
        ]
      },
      {
        "name": "Nhóm 争",
        "tip": "Nhìn phần ghép với 争 và vị trí của bộ: 青, 冫, 扌, 目 hoặc chữ độc lập.",
        "chars": [
          [
            "争",
            "zhēng",
            "tranh; giành"
          ],
          [
            "静",
            "jìng",
            "yên tĩnh"
          ],
          [
            "净",
            "jìng",
            "sạch"
          ],
          [
            "挣",
            "zhèng",
            "kiếm; giãy"
          ],
          [
            "睁",
            "zhēng",
            "mở mắt"
          ]
        ]
      },
      {
        "name": "Nhóm 其",
        "tip": "Phần 其 là lõi; chú ý 月, 欠, 木, 方 hoặc 土 đi kèm.",
        "chars": [
          [
            "期",
            "qī",
            "kỳ; hẹn"
          ],
          [
            "欺",
            "qī",
            "lừa"
          ],
          [
            "棋",
            "qí",
            "cờ"
          ],
          [
            "旗",
            "qí",
            "lá cờ"
          ],
          [
            "基",
            "jī",
            "nền móng"
          ]
        ]
      },
      {
        "name": "Nhóm 皮",
        "tip": "Nhìn bộ bên trái 皮: 石, 氵, 土, 衤, 扌.",
        "chars": [
          [
            "破",
            "pò",
            "vỡ; phá"
          ],
          [
            "波",
            "bō",
            "sóng"
          ],
          [
            "坡",
            "pō",
            "dốc"
          ],
          [
            "被",
            "bèi",
            "bị; chăn"
          ],
          [
            "披",
            "pī",
            "khoác"
          ]
        ]
      },
      {
        "name": "Nhóm 令",
        "tip": "Phần 令 gần giống; bộ bên trái cho biết nhóm nghĩa.",
        "chars": [
          [
            "领",
            "lǐng",
            "dẫn; lĩnh"
          ],
          [
            "冷",
            "lěng",
            "lạnh"
          ],
          [
            "铃",
            "líng",
            "chuông"
          ],
          [
            "岭",
            "lǐng",
            "dãy núi; đèo"
          ],
          [
            "龄",
            "líng",
            "tuổi"
          ]
        ]
      },
      {
        "name": "Nhóm 仓",
        "tip": "Phần 仓 giữ vai trò chính; phân biệt bằng 木, 扌, 刂, 艹, 舟.",
        "chars": [
          [
            "枪",
            "qiāng",
            "súng"
          ],
          [
            "抢",
            "qiǎng",
            "giành; cướp"
          ],
          [
            "创",
            "chuàng",
            "sáng tạo"
          ],
          [
            "苍",
            "cāng",
            "xanh xám"
          ],
          [
            "舱",
            "cāng",
            "khoang"
          ]
        ]
      },
      {
        "name": "Nhóm 兆",
        "tip": "Phần 兆 gần như giữ nguyên; bộ bên trái giúp nhận diện nhanh.",
        "chars": [
          [
            "跳",
            "tiào",
            "nhảy"
          ],
          [
            "桃",
            "táo",
            "quả đào"
          ],
          [
            "逃",
            "táo",
            "trốn"
          ],
          [
            "挑",
            "tiāo",
            "chọn; gánh"
          ],
          [
            "眺",
            "tiào",
            "nhìn xa"
          ]
        ]
      },
      {
        "name": "Nhóm 尧",
        "tip": "Phần 尧 là lõi; chú ý 火, 氵, 纟, 日, 扌.",
        "chars": [
          [
            "烧",
            "shāo",
            "đốt"
          ],
          [
            "浇",
            "jiāo",
            "tưới"
          ],
          [
            "绕",
            "rào",
            "vòng quanh"
          ],
          [
            "晓",
            "xiǎo",
            "bình minh; hiểu"
          ],
          [
            "挠",
            "náo",
            "gãi; quấy rầy"
          ]
        ]
      }
    ]
  },
  "3": {
    "tier": "Sơ cấp",
    "flashMs": 1800,
    "families": [
      {
        "name": "Nhóm 胡",
        "tip": "Các chữ giữ phần 胡 hoặc gần 胡; chú ý bộ bên trái hoặc phía trên.",
        "chars": [
          [
            "胡",
            "hú",
            "họ Hồ; tùy tiện"
          ],
          [
            "湖",
            "hú",
            "hồ"
          ],
          [
            "糊",
            "hú",
            "dán bằng hồ"
          ],
          [
            "蝴",
            "hú",
            "bướm (trong 蝴蝶)"
          ],
          [
            "葫",
            "hú",
            "hồ lô"
          ]
        ]
      },
      {
        "name": "Nhóm 曼",
        "tip": "Phần 曼 là lõi; bộ bên trái hoặc phía trên tạo khác biệt.",
        "chars": [
          [
            "曼",
            "màn",
            "uyển chuyển"
          ],
          [
            "慢",
            "màn",
            "chậm"
          ],
          [
            "漫",
            "màn",
            "tràn; lan"
          ],
          [
            "馒",
            "mán",
            "màn thầu"
          ],
          [
            "幔",
            "màn",
            "màn che"
          ]
        ]
      },
      {
        "name": "Nhóm 咅",
        "tip": "Phần 咅 giống nhau; phân biệt bằng 阝, 贝, 土, 亻 hoặc chữ 部.",
        "chars": [
          [
            "陪",
            "péi",
            "đi cùng"
          ],
          [
            "赔",
            "péi",
            "bồi thường"
          ],
          [
            "培",
            "péi",
            "bồi dưỡng"
          ],
          [
            "倍",
            "bèi",
            "gấp; lần"
          ],
          [
            "部",
            "bù",
            "bộ phận"
          ]
        ]
      },
      {
        "name": "Nhóm 票",
        "tip": "Phần 票 giữ nguyên; nhìn bộ bên trái hoặc phía dưới để nhận diện.",
        "chars": [
          [
            "票",
            "piào",
            "vé"
          ],
          [
            "漂",
            "piāo",
            "trôi"
          ],
          [
            "飘",
            "piāo",
            "bay; phấp phới"
          ],
          [
            "瓢",
            "piáo",
            "gáo; muôi"
          ],
          [
            "瞟",
            "piǎo",
            "liếc"
          ]
        ]
      },
      {
        "name": "Nhóm 采",
        "tip": "Phần 采/爫 gần giống; quan sát bộ đi kèm để phân biệt.",
        "chars": [
          [
            "采",
            "cǎi",
            "hái; thu thập"
          ],
          [
            "彩",
            "cǎi",
            "màu sắc"
          ],
          [
            "踩",
            "cǎi",
            "giẫm"
          ],
          [
            "睬",
            "cǎi",
            "để ý"
          ],
          [
            "菜",
            "cài",
            "rau; món ăn"
          ]
        ]
      },
      {
        "name": "Nhóm 曷",
        "tip": "Phần 曷 là điểm chung; bộ bên trái hoặc dưới quyết định chữ.",
        "chars": [
          [
            "喝",
            "hē",
            "uống"
          ],
          [
            "渴",
            "kě",
            "khát"
          ],
          [
            "揭",
            "jiē",
            "vạch; mở"
          ],
          [
            "竭",
            "jié",
            "cạn kiệt"
          ],
          [
            "歇",
            "xiē",
            "nghỉ"
          ]
        ]
      },
      {
        "name": "Nhóm 曹",
        "tip": "Phần 曹 giữ nguyên; chú ý 米, 木, 辶, 口 hoặc chữ độc lập.",
        "chars": [
          [
            "曹",
            "cáo",
            "họ Tào"
          ],
          [
            "糟",
            "zāo",
            "tệ; hỏng"
          ],
          [
            "槽",
            "cáo",
            "rãnh; máng"
          ],
          [
            "遭",
            "zāo",
            "gặp phải"
          ],
          [
            "嘈",
            "cáo",
            "ồn ào"
          ]
        ]
      },
      {
        "name": "Nhóm 乔",
        "tip": "Phần 乔 giống nhau; bộ bên trái cho biết nghĩa của chữ.",
        "chars": [
          [
            "乔",
            "qiáo",
            "cao; họ Kiều"
          ],
          [
            "桥",
            "qiáo",
            "cầu"
          ],
          [
            "侨",
            "qiáo",
            "kiều bào"
          ],
          [
            "娇",
            "jiāo",
            "duyên; nuông chiều"
          ],
          [
            "骄",
            "jiāo",
            "kiêu ngạo"
          ]
        ]
      },
      {
        "name": "Nhóm 奇",
        "tip": "Phần 奇 là lõi; quan sát 马, 木, 宀, 山 hoặc chữ độc lập.",
        "chars": [
          [
            "奇",
            "qí",
            "kỳ lạ"
          ],
          [
            "骑",
            "qí",
            "cưỡi"
          ],
          [
            "椅",
            "yǐ",
            "ghế"
          ],
          [
            "寄",
            "jì",
            "gửi"
          ],
          [
            "崎",
            "qí",
            "gập ghềnh"
          ]
        ]
      },
      {
        "name": "Nhóm 交",
        "tip": "Phần 交 gần giống; nhìn bộ đứng trước hoặc bên cạnh.",
        "chars": [
          [
            "交",
            "jiāo",
            "giao; nộp"
          ],
          [
            "校",
            "xiào",
            "trường học"
          ],
          [
            "较",
            "jiào",
            "so sánh"
          ],
          [
            "郊",
            "jiāo",
            "ngoại ô"
          ],
          [
            "胶",
            "jiāo",
            "keo"
          ]
        ]
      }
    ]
  },
  "4": {
    "tier": "Trung cấp",
    "flashMs": 1600,
    "families": [
      {
        "name": "Nhóm 莫",
        "tip": "Phần 莫 giữ nguyên; phần dưới là dấu hiệu phân biệt rất rõ.",
        "chars": [
          [
            "慕",
            "mù",
            "ngưỡng mộ"
          ],
          [
            "幕",
            "mù",
            "màn; màn che"
          ],
          [
            "墓",
            "mù",
            "mộ"
          ],
          [
            "暮",
            "mù",
            "chiều tối"
          ],
          [
            "募",
            "mù",
            "tuyển; quyên góp"
          ]
        ]
      },
      {
        "name": "Nhóm 喿",
        "tip": "Phần 喿 giống nhau; bộ bên trái lần lượt là 火, 足, 口, 氵, 扌.",
        "chars": [
          [
            "燥",
            "zào",
            "khô"
          ],
          [
            "躁",
            "zào",
            "nóng nảy"
          ],
          [
            "噪",
            "zào",
            "ồn"
          ],
          [
            "澡",
            "zǎo",
            "tắm"
          ],
          [
            "操",
            "cāo",
            "thao tác; rèn luyện"
          ]
        ]
      },
      {
        "name": "Nhóm 辟",
        "tip": "Phần 辟 là lõi; chú ý 土, 辶, 月, 王 hoặc chữ đứng độc lập.",
        "chars": [
          [
            "辟",
            "pì",
            "mở; bác bỏ"
          ],
          [
            "壁",
            "bì",
            "tường"
          ],
          [
            "避",
            "bì",
            "tránh"
          ],
          [
            "臂",
            "bì",
            "cánh tay"
          ],
          [
            "璧",
            "bì",
            "ngọc bích"
          ]
        ]
      },
      {
        "name": "Nhóm 申",
        "tip": "Phần 申 gần giống; bộ bên trái hoặc phía trên thay đổi.",
        "chars": [
          [
            "申",
            "shēn",
            "trình bày; địa chi Thân"
          ],
          [
            "伸",
            "shēn",
            "duỗi"
          ],
          [
            "神",
            "shén",
            "thần"
          ],
          [
            "审",
            "shěn",
            "thẩm tra"
          ],
          [
            "绅",
            "shēn",
            "thân sĩ"
          ]
        ]
      },
      {
        "name": "Nhóm 昔",
        "tip": "Phần 昔 được giữ lại; nhìn 亻, 钅, 扌, 忄 hoặc chữ độc lập.",
        "chars": [
          [
            "昔",
            "xī",
            "xưa"
          ],
          [
            "借",
            "jiè",
            "mượn"
          ],
          [
            "错",
            "cuò",
            "sai"
          ],
          [
            "措",
            "cuò",
            "xử trí; biện pháp"
          ],
          [
            "惜",
            "xī",
            "tiếc"
          ]
        ]
      },
      {
        "name": "Nhóm 兼",
        "tip": "Phần 兼 gần giống; bộ phía trước giúp phân biệt chức năng và nghĩa.",
        "chars": [
          [
            "谦",
            "qiān",
            "khiêm tốn"
          ],
          [
            "歉",
            "qiàn",
            "xin lỗi; thiếu"
          ],
          [
            "廉",
            "lián",
            "liêm khiết"
          ],
          [
            "嫌",
            "xián",
            "chê; nghi"
          ],
          [
            "赚",
            "zhuàn",
            "kiếm tiền"
          ]
        ]
      },
      {
        "name": "Nhóm 宗",
        "tip": "Phần 宗 là lõi; chú ý 木, 纟, 足, 山 hoặc chữ độc lập.",
        "chars": [
          [
            "宗",
            "zōng",
            "tông; phái"
          ],
          [
            "棕",
            "zōng",
            "màu nâu; cây cọ"
          ],
          [
            "综",
            "zōng",
            "tổng hợp"
          ],
          [
            "踪",
            "zōng",
            "dấu vết"
          ],
          [
            "崇",
            "chóng",
            "tôn sùng"
          ]
        ]
      },
      {
        "name": "Nhóm 畐",
        "tip": "Phần 畐 gần giống; phân biệt qua 礻, 巾, 刂, 宀, 辶.",
        "chars": [
          [
            "福",
            "fú",
            "phúc"
          ],
          [
            "幅",
            "fú",
            "tấm; bức"
          ],
          [
            "副",
            "fù",
            "phó; bộ"
          ],
          [
            "富",
            "fù",
            "giàu"
          ],
          [
            "逼",
            "bī",
            "ép"
          ]
        ]
      },
      {
        "name": "Nhóm 直",
        "tip": "Phần 直 là điểm chung; chú ý 亻, 木, 歹, 罒 hoặc chữ độc lập.",
        "chars": [
          [
            "直",
            "zhí",
            "thẳng"
          ],
          [
            "值",
            "zhí",
            "giá trị; trực"
          ],
          [
            "植",
            "zhí",
            "trồng"
          ],
          [
            "殖",
            "zhí",
            "sinh sôi"
          ],
          [
            "置",
            "zhì",
            "đặt"
          ]
        ]
      },
      {
        "name": "Nhóm 夋",
        "tip": "Các chữ cùng phần 夋; bộ bên trái quyết định cách đọc và nghĩa.",
        "chars": [
          [
            "俊",
            "jùn",
            "tuấn tú"
          ],
          [
            "骏",
            "jùn",
            "ngựa tốt"
          ],
          [
            "峻",
            "jùn",
            "hiểm trở"
          ],
          [
            "竣",
            "jùn",
            "hoàn thành"
          ],
          [
            "梭",
            "suō",
            "con thoi"
          ]
        ]
      }
    ]
  },
  "5": {
    "tier": "Trung cấp",
    "flashMs": 1400,
    "families": [
      {
        "name": "Nhóm 戈",
        "tip": "Các chữ đều có cấu trúc liên quan 戈; hãy nhìn vị trí nét ngang, chấm và phần ghép.",
        "chars": [
          [
            "戊",
            "wù",
            "thiên can Mậu"
          ],
          [
            "戌",
            "xū",
            "địa chi Tuất"
          ],
          [
            "戍",
            "shù",
            "đóng giữ"
          ],
          [
            "戎",
            "róng",
            "quân sự; binh nhung"
          ],
          [
            "戒",
            "jiè",
            "răn; cai; giới"
          ]
        ]
      },
      {
        "name": "Nhóm 衣",
        "tip": "Cùng kiểu cấu trúc bao quanh phần giữa bằng nét của 衣; chú ý lõi ở trung tâm.",
        "chars": [
          [
            "衰",
            "shuāi",
            "suy; yếu"
          ],
          [
            "哀",
            "āi",
            "buồn thương"
          ],
          [
            "衷",
            "zhōng",
            "lòng; trung tâm"
          ],
          [
            "裹",
            "guǒ",
            "bọc; gói"
          ],
          [
            "褒",
            "bāo",
            "khen"
          ]
        ]
      },
      {
        "name": "Nhóm 既",
        "tip": "即 và 既 rất dễ nhầm; 概, 溉, 慨 đều giữ phần 既 ở bên phải.",
        "chars": [
          [
            "即",
            "jí",
            "ngay; tức"
          ],
          [
            "既",
            "jì",
            "đã"
          ],
          [
            "概",
            "gài",
            "khái quát"
          ],
          [
            "溉",
            "gài",
            "tưới tiêu"
          ],
          [
            "慨",
            "kǎi",
            "cảm khái"
          ]
        ]
      },
      {
        "name": "Nhóm 竟",
        "tip": "竟 và 竞 khác phần dưới; 境, 镜 thêm bộ bên trái, 景 có cấu trúc gần dễ gây nhiễu.",
        "chars": [
          [
            "竟",
            "jìng",
            "rốt cuộc"
          ],
          [
            "竞",
            "jìng",
            "thi đấu"
          ],
          [
            "境",
            "jìng",
            "hoàn cảnh; biên giới"
          ],
          [
            "镜",
            "jìng",
            "gương"
          ],
          [
            "景",
            "jǐng",
            "cảnh"
          ]
        ]
      },
      {
        "name": "Nhóm 甚",
        "tip": "Phần 甚 là lõi; chú ý 土, 氵, 力, 斗 hoặc chữ đứng độc lập.",
        "chars": [
          [
            "甚",
            "shèn",
            "rất; thậm"
          ],
          [
            "堪",
            "kān",
            "chịu được"
          ],
          [
            "湛",
            "zhàn",
            "sâu; trong"
          ],
          [
            "勘",
            "kān",
            "khảo sát"
          ],
          [
            "斟",
            "zhēn",
            "rót; cân nhắc"
          ]
        ]
      },
      {
        "name": "Nhóm 俞",
        "tip": "Phần 俞 gần nhau; bộ bên trái quyết định nghĩa của chữ.",
        "chars": [
          [
            "输",
            "shū",
            "vận chuyển; thua"
          ],
          [
            "偷",
            "tōu",
            "trộm"
          ],
          [
            "愉",
            "yú",
            "vui"
          ],
          [
            "瑜",
            "yú",
            "ngọc đẹp"
          ],
          [
            "喻",
            "yù",
            "ví; hiểu"
          ]
        ]
      },
      {
        "name": "Nhóm 朵",
        "tip": "Phần 朵 giữ vai trò trung tâm; chú ý 身, 土, 刂, 足 hoặc chữ độc lập.",
        "chars": [
          [
            "朵",
            "duǒ",
            "đóa"
          ],
          [
            "躲",
            "duǒ",
            "trốn"
          ],
          [
            "垛",
            "duò",
            "đống; ụ"
          ],
          [
            "剁",
            "duò",
            "chặt; băm"
          ],
          [
            "跺",
            "duò",
            "giậm chân"
          ]
        ]
      },
      {
        "name": "Nhóm 甫",
        "tip": "Phần 甫 giống nhau; bộ bên trái tạo khác biệt.",
        "chars": [
          [
            "甫",
            "fǔ",
            "vừa mới; Phủ"
          ],
          [
            "辅",
            "fǔ",
            "hỗ trợ"
          ],
          [
            "捕",
            "bǔ",
            "bắt"
          ],
          [
            "浦",
            "pǔ",
            "bờ sông"
          ],
          [
            "铺",
            "pū",
            "trải; cửa hàng"
          ]
        ]
      },
      {
        "name": "Nhóm 夆",
        "tip": "Phần 夆 gần giống; bộ 山, 钅, 虫, 辶, 纟 làm thay đổi nghĩa.",
        "chars": [
          [
            "峰",
            "fēng",
            "đỉnh núi"
          ],
          [
            "锋",
            "fēng",
            "mũi nhọn"
          ],
          [
            "蜂",
            "fēng",
            "ong"
          ],
          [
            "逢",
            "féng",
            "gặp"
          ],
          [
            "缝",
            "féng",
            "khâu; may"
          ]
        ]
      },
      {
        "name": "Nhóm 旁",
        "tip": "Phần 旁 là lõi; chú ý 亻, 讠, 石, 月 hoặc chữ đứng độc lập.",
        "chars": [
          [
            "旁",
            "páng",
            "bên cạnh"
          ],
          [
            "傍",
            "bàng",
            "dựa; gần"
          ],
          [
            "谤",
            "bàng",
            "phỉ báng"
          ],
          [
            "磅",
            "bàng",
            "pao; đơn vị cân"
          ],
          [
            "膀",
            "bǎng",
            "vai; cánh tay"
          ]
        ]
      }
    ]
  },
  "6": {
    "tier": "Trung cấp",
    "flashMs": 1200,
    "families": [
      {
        "name": "Nhóm 詹",
        "tip": "Phần 詹 giữ lại trong nhiều chữ; bộ 目, 贝, 木, 虫 giúp phân biệt.",
        "chars": [
          [
            "詹",
            "zhān",
            "họ Chiêm"
          ],
          [
            "瞻",
            "zhān",
            "nhìn lên; nhìn xa"
          ],
          [
            "赡",
            "shàn",
            "chu cấp"
          ],
          [
            "檐",
            "yán",
            "mái hiên"
          ],
          [
            "蟾",
            "chán",
            "cóc thiềm"
          ]
        ]
      },
      {
        "name": "Nhóm 叚",
        "tip": "Phần 叚 gần như giữ nguyên; chú ý 亻, 日, 王, 雨, 辶.",
        "chars": [
          [
            "假",
            "jiǎ",
            "giả"
          ],
          [
            "暇",
            "xiá",
            "rảnh"
          ],
          [
            "瑕",
            "xiá",
            "tì vết"
          ],
          [
            "霞",
            "xiá",
            "mây hồng"
          ],
          [
            "遐",
            "xiá",
            "xa"
          ]
        ]
      },
      {
        "name": "Nhóm 监",
        "tip": "Phần 监 xuất hiện trực tiếp hoặc biến đổi; chú ý 艹, 竹, 氵 và chữ 鉴.",
        "chars": [
          [
            "监",
            "jiān",
            "giám sát"
          ],
          [
            "蓝",
            "lán",
            "xanh lam"
          ],
          [
            "篮",
            "lán",
            "giỏ"
          ],
          [
            "鉴",
            "jiàn",
            "giám định; soi"
          ],
          [
            "滥",
            "làn",
            "tràn lan"
          ]
        ]
      },
      {
        "name": "Nhóm 需",
        "tip": "Phần 需 là lõi; bộ 亻, 氵, 子, 米 giúp phân biệt các chữ khó.",
        "chars": [
          [
            "需",
            "xū",
            "cần"
          ],
          [
            "儒",
            "rú",
            "nho sĩ"
          ],
          [
            "濡",
            "rú",
            "làm ướt"
          ],
          [
            "孺",
            "rú",
            "trẻ nhỏ"
          ],
          [
            "糯",
            "nuò",
            "nếp"
          ]
        ]
      },
      {
        "name": "Nhóm 卓",
        "tip": "卓 là phần dễ nhận thấy; chú ý 木, 扌, 忄, 纟 hoặc chữ độc lập.",
        "chars": [
          [
            "卓",
            "zhuó",
            "xuất sắc"
          ],
          [
            "桌",
            "zhuō",
            "bàn"
          ],
          [
            "掉",
            "diào",
            "rơi; làm rơi"
          ],
          [
            "悼",
            "dào",
            "thương tiếc"
          ],
          [
            "绰",
            "chuò",
            "rộng rãi; uyển chuyển"
          ]
        ]
      },
      {
        "name": "Nhóm 圭",
        "tip": "Nhiều chữ có phần 圭; quan sát 扌, 木, 氵, 革, 亻.",
        "chars": [
          [
            "挂",
            "guà",
            "treo"
          ],
          [
            "桂",
            "guì",
            "quế"
          ],
          [
            "洼",
            "wā",
            "chỗ trũng"
          ],
          [
            "鞋",
            "xié",
            "giày"
          ],
          [
            "佳",
            "jiā",
            "tốt đẹp"
          ]
        ]
      },
      {
        "name": "Nhóm 肖",
        "tip": "Phần 肖 gần giống; bộ 氵, 钅, 禾, 木 hoặc chữ độc lập tạo nghĩa khác.",
        "chars": [
          [
            "肖",
            "xiào",
            "giống; tương tự"
          ],
          [
            "消",
            "xiāo",
            "biến mất"
          ],
          [
            "销",
            "xiāo",
            "tiêu thụ; bán"
          ],
          [
            "稍",
            "shāo",
            "hơi; một chút"
          ],
          [
            "梢",
            "shāo",
            "ngọn; đầu cành"
          ]
        ]
      },
      {
        "name": "Nhóm 易",
        "tip": "Phần 易 hoặc cấu trúc gần 易 xuất hiện bên phải; chú ý 足, 刂, 忄, 贝.",
        "chars": [
          [
            "易",
            "yì",
            "dễ; đổi"
          ],
          [
            "踢",
            "tī",
            "đá"
          ],
          [
            "剔",
            "tī",
            "loại bỏ"
          ],
          [
            "惕",
            "tì",
            "cảnh giác"
          ],
          [
            "赐",
            "cì",
            "ban; tặng"
          ]
        ]
      },
      {
        "name": "Nhóm 尃",
        "tip": "Phần 尃 gần giống; quan sát 十, 扌, 亻, 纟, 艹 ở ngoài.",
        "chars": [
          [
            "博",
            "bó",
            "rộng; uyên bác"
          ],
          [
            "搏",
            "bó",
            "vật lộn"
          ],
          [
            "傅",
            "fù",
            "thầy; phó"
          ],
          [
            "缚",
            "fù",
            "trói"
          ],
          [
            "薄",
            "báo",
            "mỏng"
          ]
        ]
      },
      {
        "name": "Nhóm 乍",
        "tip": "Phần 乍 là điểm chung; nhìn 亻, 日, 火, 讠 hoặc chữ đứng độc lập.",
        "chars": [
          [
            "乍",
            "zhà",
            "chợt; bỗng"
          ],
          [
            "作",
            "zuò",
            "làm"
          ],
          [
            "昨",
            "zuó",
            "hôm qua"
          ],
          [
            "炸",
            "zhà",
            "nổ"
          ],
          [
            "诈",
            "zhà",
            "lừa đảo"
          ]
        ]
      }
    ]
  }
};
