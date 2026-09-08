let appState = 0;
let isSimulating = false; 
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const ledImage = document.getElementById('led-image');
const stateValText = document.getElementById('state-val');
const deviceStatusText = document.getElementById('device-status');

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

window.addEventListener('load', () => {
    window.workspace = Blockly.inject('blocklyDiv', {
        toolbox: document.getElementById('toolbox'),
        move: { scrollbars: true, drag: true, wheel: true }
    });
    
    Blockly.serialization.workspaces.load(defaultBlocksJsonStep4, window.workspace);

    const blocklyDiv = document.getElementById('blocklyDiv');
    const resizeObserver = new ResizeObserver(() => {
        if (window.workspace) {
            Blockly.svgResize(window.workspace);
        }
    });
    resizeObserver.observe(blocklyDiv);

    // ★追加: 読み込み時に左側ボタンの手動操作を無効化
    disableManualButtons();
});

window.onDeviceDisconnected = function() {
    deviceStatusText.textContent = "未接続";
    deviceStatusText.style.color = "red";
};

window.addEventListener('DOMContentLoaded', () => {
    if (window.parent && window.parent.hasClickedConnect) {
        const hint = document.getElementById('connect-hint');
        if (hint) hint.style.display = 'none';
    }

    if (window.parent && window.parent.sharedHidDevice && window.parent.sharedHidDevice.opened) {
        deviceStatusText.textContent = `接続中 (${window.parent.sharedHidDevice.productName})`;
        deviceStatusText.style.color = '#0ff';
    }

    // 初期状態は消灯・リセット
    resetSimulator();
    disableManualButtons();
});

// ★追加: 左側ボタンの手動操作（クリック/タップ）を全OSで無効化する関数
function disableManualButtons() {
    const buttonIds = ['red-on', 'red-off', 'green-on', 'green-off', 'blue-on', 'blue-off', 'end-btn'];
    buttonIds.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.style.pointerEvents = 'none'; // マウス・タッチ操作を完全に無効化
            btn.style.cursor = 'default';
        }
    });
}

async function connectDevice() {
    if (window.parent && window.parent.connectSharedDevice) {
        const device = await window.parent.connectSharedDevice();
        if (device) {
            deviceStatusText.textContent = `接続中 (${device.productName})`;
            deviceStatusText.style.color = '#0ff';
            return true;
        }
    }
    return false;
}

document.getElementById('connect-btn').addEventListener('click', async () => {
    const hint = document.getElementById('connect-hint');
    if (hint) hint.style.display = 'none';
    if (window.parent) {
        window.parent.hasClickedConnect = true;
    }
    const success = await connectDevice();
    if (success) {
        if (window.parent && window.parent.transferSharedHID) {
            if (isIOS) {
                console.log("◆AI クロック接続確認コマンド送信(iPad): [253, 5]");
                await window.parent.transferSharedHID([253, 5]);
            } else {
                console.log("◆AI クロック接続コマンド送信: [252]");
                await window.parent.transferSharedHID([252]);
            }
        }
    } else {
        alert('デバイスの接続に失敗したか、キャンセルされました。');
    }
});

// ==========================================
// シミュレーター画面の描画処理
// ==========================================
function render() {
    stateValText.textContent = appState;
    if (appState === 8) {
        ledImage.style.backgroundColor = '#555'; 
        ledImage.style.boxShadow = 'none';
        document.getElementById('red-on').classList.remove('pressed'); 
        document.getElementById('red-off').classList.remove('pressed');
        document.getElementById('green-on').classList.remove('pressed'); 
        document.getElementById('green-off').classList.remove('pressed');
        document.getElementById('blue-on').classList.remove('pressed');
        document.getElementById('blue-off').classList.remove('pressed');
    } else {
        // ONボタンの連動
        document.getElementById('red-on').classList.toggle('pressed', (appState & 1) !== 0);
        document.getElementById('green-on').classList.toggle('pressed', (appState & 2) !== 0);
        document.getElementById('blue-on').classList.toggle('pressed', (appState & 4) !== 0);

        // OFFボタンの連動（点灯していない色側のOFFボタンが凹む）
        document.getElementById('red-off').classList.toggle('pressed', (appState & 1) === 0);
        document.getElementById('green-off').classList.toggle('pressed', (appState & 2) === 0);
        document.getElementById('blue-off').classList.toggle('pressed', (appState & 4) === 0);

        if (appState === 0) { 
            ledImage.style.backgroundColor = '#555'; 
            ledImage.style.boxShadow = 'none'; 
        } else {
            const r = (appState & 1) ? 255 : 0, g = (appState & 2) ? 255 : 0, b = (appState & 4) ? 255 : 0;
            ledImage.style.backgroundColor = `rgb(${r}, ${g}, ${b})`; 
            ledImage.style.boxShadow = `0 0 30px rgb(${r}, ${g}, ${b})`;
        }
    }
}

function resetSimulator() {
    appState = 8;
    render();
}

// ==========================================
// プログラム転送処理
// ==========================================
document.getElementById('transfer-btn').addEventListener('click', async () => {
    if (isSimulating) return; 
    if (!window.workspace) return;

    const startBlock = window.workspace.getBlocksByType('cmd_start')[0];
    if (!startBlock) {
        alert("「プログラムスタート」ブロックが見つかりません！");
        return;
    }

    let hidBytes = isIOS ? [230, 2] : [240, 230, 2]; 
    let addr = 2; 
    let hasHardwareCommand = false;
    let currentBlock = startBlock.getNextBlock();

    while (currentBlock) {
        if (currentBlock.type === 'cmd_led') {
            const colorName = currentBlock.getFieldValue('COLOR');
            const timeSec = Number(currentBlock.getFieldValue('TIME'));
            let r = 0, g = 0, b = 0;
            switch (colorName) {
                case "red":    r = 255; g = 0;   b = 0;   break;
                case "green":  r = 0;   g = 255; b = 0;   break;
                case "blue":   r = 0;   g = 0;   b = 255; break;
                case "yellow": r = 255; g = 255; b = 0;   break;
                case "purple": r = 255; g = 0;   b = 255; break;
                case "cyan":   r = 0;   g = 255; b = 255; break;
                case "white":  r = 255; g = 255; b = 255; break;
                case "off":    r = 0;   g = 0;   b = 0;   break;
            }
            let sec = Math.round(timeSec * 4);
            addr += 6; 
            hidBytes.push(130, r, g, b, sec, addr);
            hasHardwareCommand = true;
        }
        currentBlock = currentBlock.getNextBlock();
    }

    if (hasHardwareCommand) {
        hidBytes.push(231, 250); 
        if (window.parent && window.parent.transferSharedHID) {
            console.log("◆生成されたプログラムデータ送信:", hidBytes);
            await window.parent.transferSharedHID(hidBytes);
        } else {
            alert("通信機能が見つかりません。");
        }
    } else {
        alert("転送するブロックが繋がっていません！\nLEDブロックを繋げてください。");
    }
});

// ==========================================
// プログラム実行処理 (画面シミュレーション連動)
// ==========================================
document.getElementById('run-btn').addEventListener('click', async () => {
    if (isSimulating) return; 
    if (!window.workspace) return;

    const startBlock = window.workspace.getBlocksByType('cmd_start')[0];
    if (!startBlock) return;

    // 1. マイコンへ実行コマンド送信
    if (window.parent && window.parent.transferSharedHID) {
        let runCommand = isIOS ? [253, 2] : [241]; 
        console.log("◆実行コマンド送信:", runCommand);
        window.parent.transferSharedHID(runCommand); 
    } else {
        alert("通信機能が見つかりません。");
    }

    // 2. 画面上のLED・ON/OFFボタンの連動シミュレーション開始
    isSimulating = true;
    let currentBlock = startBlock.getNextBlock();

    while (currentBlock) {
        if (currentBlock.type === 'cmd_led') {
            const colorName = currentBlock.getFieldValue('COLOR');
            const timeSec = Number(currentBlock.getFieldValue('TIME'));
            appState = 0;
            switch (colorName) {
                case "red":    appState = 1; break;
                case "green":  appState = 2; break;
                case "blue":   appState = 4; break;
                case "yellow": appState = 3; break;
                case "purple": appState = 5; break;
                case "cyan":   appState = 6; break;
                case "white":  appState = 7; break;
                case "off":    appState = 0; break;
            }
            // 画面のON/OFFボタンとLEDを更新
            render(); 
            await wait(timeSec * 1000);
        }
        currentBlock = currentBlock.getNextBlock();
    }

    // 3. プログラム終了時にシミュレーションを解除し、全て消灯
    isSimulating = false;
    resetSimulator(); 
});
