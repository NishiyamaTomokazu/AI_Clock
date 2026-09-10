// ==========================================
// カスタムブロックの共通定義 (全STEP共通)
// ==========================================
Blockly.defineBlocksWithJsonArray([
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
                    ["🔴 赤", "red"], ["🟢 緑", "green"], ["🔵 青", "blue"],
                    ["🟡 黄色", "yellow"], ["🟣 紫", "purple"], ["🩵 水色", "cyan"],
                    ["⚪ 白", "white"], ["⚫ 消灯", "off"]
                ]
            },
            { "type": "field_number", "name": "TIME", "value": 1, "min": 0.25, "max": 31.75, "precision": 0.25 }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": 230
    },
    {
        "type": "cmd_wait_sound",
        "message0": "音が鳴るまで待つ",
        "previousStatement": null,
        "nextStatement": null,
        "colour": 210,
        "tooltip": "音が鳴るまでプログラムを一時停止します。"
    },
    {
        "type": "cmd_wait_switch",
        "message0": "スイッチが押されるまで待つ",
        "previousStatement": null,
        "nextStatement": null,
        "colour": 210,
        "tooltip": "スイッチが押されるまでプログラムを一時停止します。"
    },
    // 写真に合わせた「もし〜なら YES」ブロック
    {
        "type": "cmd_if",
        "message0": "もし〜なら %1",
        "args0": [
            { "type": "input_value", "name": "COND", "check": "Boolean" }
        ],
        "message1": "YES %1",
        "args1": [
            { "type": "input_statement", "name": "DO" }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": "#e69500",
        "tooltip": "条件がON（真）の時だけ、YESの中のプログラムを実行します。"
    },
    // 写真に合わせた「もし〜なら YES No」ブロック
    {
        "type": "cmd_if_else",
        "message0": "もし〜なら %1",
        "args0": [
            { "type": "input_value", "name": "COND", "check": "Boolean" }
        ],
        "message1": "YES %1",
        "args1": [
            { "type": "input_statement", "name": "DO" }
        ],
        "message2": "No %1",
        "args2": [
            { "type": "input_statement", "name": "ELSE" }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": "#e69500",
        "tooltip": "条件によってYESとNoに分けてプログラムを実行します。"
    },
    // 写真に合わせた条件ブロック (SW=ON / SW=OFF)
    {
        "type": "cond_switch_on",
        "message0": "SW=ON",
        "output": "Boolean",
        "colour": "#2e7d32"
    },
    {
        "type": "cond_switch_off",
        "message0": "SW=OFF",
        "output": "Boolean",
        "colour": "#2e7d32"
    }
]);

// ==========================================
// 初期配置するブロックのデータ (各STEP用)
// ==========================================
const defaultBlocksJsonStep4 = {
    "blocks": {
        "blocks": [
            {
                "type": "cmd_start", "x": 20, "y": 20, "deletable": false, "movable": false,
                "next": { "block": { "type": "cmd_led", "fields": { "COLOR": "red", "TIME": 1 } } }
            }
        ]
    }
};

const defaultBlocksJsonStep5 = {
    "blocks": {
        "blocks": [
            {
                "type": "cmd_start", "x": 20, "y": 20, "deletable": false, "movable": false,
                "next": {
                    "block": {
                        "type": "cmd_wait_sound",
                        "next": { "block": { "type": "cmd_led", "fields": { "COLOR": "red", "TIME": 1 } } }
                    }
                }
            }
        ]
    }
};

const defaultBlocksJsonStep6 = {
    "blocks": {
        "blocks": [
            {
                "type": "cmd_start", "x": 20, "y": 20, "deletable": false, "movable": false,
                "next": {
                    "block": {
                        "type": "cmd_wait_switch",
                        "next": {
                            "block": {
                                "type": "cmd_led", "fields": { "COLOR": "red", "TIME": 1 },
                                "next": {
                                    "block": {
                                        "type": "cmd_led", "fields": { "COLOR": "green", "TIME": 1 },
                                        "next": { "block": { "type": "cmd_led", "fields": { "COLOR": "blue", "TIME": 1 } } }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        ]
    }
};

// ★ STEP7用: スタート -> もしSW=ONなら(YES:赤1秒, No:緑1秒)
const defaultBlocksJsonStep7 = {
    "blocks": {
        "blocks": [
            {
                "type": "cmd_start",
                "x": 20,
                "y": 20,
                "deletable": false,
                "movable": false,
                "next": {
                    "block": {
                        "type": "cmd_if_else",
                        "inputs": {
                            "COND": {
                                "block": {
                                    "type": "cond_switch_on"
                                }
                            },
                            "DO": {
                                "block": {
                                    "type": "cmd_led",
                                    "fields": { "COLOR": "red", "TIME": 1 }
                                }
                            },
                            "ELSE": {
                                "block": {
                                    "type": "cmd_led",
                                    "fields": { "COLOR": "green", "TIME": 1 }
                                }
                            }
                        }
                    }
                }
            }
        ]
    }
};

// ==========================================
// STEP8 用の新しいブロック定義 (繰り返し)
// ==========================================
Blockly.defineBlocksWithJsonArray([
    {
        "type": "cmd_loop",
        "message0": "%1 回繰り返す %2 実行 %3",
        "args0": [
            { "type": "field_number", "name": "COUNT", "value": 3, "min": 1, "max": 255 },
            { "type": "input_dummy" },
            { "type": "input_statement", "name": "DO" }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": "#145c29", // 写真のような深めの緑色
        "tooltip": "指定した回数だけ、中のプログラムを繰り返します。"
    }
]);

// ==========================================
// 初期配置するブロックのデータ (STEP8用)
// ==========================================
const defaultBlocksJsonStep8 = {
    "blocks": {
        "blocks": [
            {
                "type": "cmd_start",
                "x": 20,
                "y": 20,
                "deletable": false,
                "movable": false,
                "next": {
                    "block": {
                        "type": "cmd_loop",
                        "fields": {
                            "COUNT": 3
                        },
                        "inputs": {
                            "DO": {
                                "block": {
                                    "type": "cmd_led",
                                    "fields": { "COLOR": "red", "TIME": 1 },
                                    "next": {
                                        "block": {
                                            "type": "cmd_led",
                                            "fields": { "COLOR": "blue", "TIME": 1 }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        ]
    }
};