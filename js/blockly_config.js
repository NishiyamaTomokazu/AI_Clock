// ==========================================
// カスタムブロックの定義
// ==========================================
const customBlocks = [
    {
        "type": "cmd_start",
        "message0": "プログラムスタート",
        "nextStatement": null,
        "colour": "#ffbf00",
        "tooltip": "プログラムの開始点です"
    },
    {
        "type": "cmd_led",
        "message0": "%1 を %2 秒点灯",
        "args0": [
            {
                "type": "field_dropdown",
                "name": "COLOR",
                "options": [
                    ["🔴 赤", "red"],
                    ["🟢 緑", "green"],
                    ["🔵 青", "blue"],
                    ["🟡 黄色", "yellow"],
                    ["🟣 紫", "purple"],
                    ["🩵 水色", "cyan"],
                    ["⚪ 白", "white"],
                    ["⚫ 消灯", "off"]
                ]
            },
            {
                "type": "field_number",
                "name": "TIME",
                "value": 1,
                "min": 0.25,
                "max": 31.75,
                "precision": 0.25
            }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": 230
    }
];

// ブロックをBlocklyに登録
Blockly.defineBlocksWithJsonArray(customBlocks);

// ==========================================
// 初期配置するブロックのデータ (STEP4用)
// ==========================================
const defaultBlocksJsonStep4 = {
    "blocks": {
        "blocks": [
            {
                "type": "cmd_start",
                "x": 20,
                "y": 20,
                "deletable": false,
                "movable": false,
                "next": {
                    // ★追加: スタートの下に最初から「赤を1秒点灯」を繋げておく
                    "block": {
                        "type": "cmd_led",
                        "fields": {
                            "COLOR": "red",
                            "TIME": 1
                        }
                    }
                }
            }
        ]
    }
};