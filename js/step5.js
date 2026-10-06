let appState = 0;
let isSimulating = false;

// ===== FSK 受信 (マイコンからの「音を検出した」通知) =====
let fskRx = null;
let fskBuffer = [];

// FSK受信を開始する。ユーザー操作(クリック)の中で、最初の await より前に呼ぶこと (iOS Safari の制約)
async function startFsk() {
    if (!window.FskReceiver) throw new Error('FskReceiver が読み込まれていません');
    fskBuffer = [];
    const rx = new window.FskReceiver({
        baud: 200,        // 200 bps
        freq0: 1200,      // "0" = 1200 Hz
        freq1: 2200,      // "1" = 2200 Hz
        threshold: 0.01,
        workletUrl: './js/fsk-processor_2.js',
        onByte: onFskByte
    });
    await rx.start();
    fskRx = rx;           // 開始に成功したときだけ保持する
}

async function stopFsk() {
    const rx = fskRx;
    fskRx = null;
    fskBuffer = [];
    if (rx) {
        try { await rx.stop(); } catch (e) { console.error('FSK停止エラー:', e); }
    }
}

// 1バイト受信ごとに呼ばれる。直近2バイトが 170 → 1 なら、音センサ検出として通知する
function onFskByte(value) {
    fskBuffer.push(value);
    if (fskBuffer.length > 2) fskBuffer.shift();
    if (fskBuffer.length === 2 && fskBuffer[0] === 170 && fskBuffer[1] === 1) {
        fskBuffer = [];
        // waitForSensor が待っている 'hid-input' イベントを発火させる
        window.dispatchEvent(new CustomEvent('hid-input', { detail: { data: [170, 1] } }));
    }
}

// スタート以降のブロックの並びに、指定タイプのブロックがあるか
function chainHasType(startBlock, type) {
    let b = startBlock.getNextBlock();
    while (b) {
        if (b.type === type) return true;
        b = b.getNextBlock();
    }
    return false;
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function waitForSensor(targetCode, targetValue) {
    return new Promise((resolve) => {
        const listener = (event) => {
            const receivedData = event.detail.data;
            if (receivedData.length >= 2 && receivedData[0] === targetCode && receivedData[1] === targetValue) {
                window.removeEventListener('hid-input', listener);
                resolve(); 
            }
        };
        window.addEventListener('hid-input', listener);
    });
}

const ledImage = document.getElementById('led-image');
const stateValText = document.getElementById('state-val');
const deviceStatusText = document.getElementById('device-status');
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

window.addEventListener('load', () => {
    window.workspace = Blockly.inject('blocklyDiv', {
        toolbox: document.getElementById('toolbox'),
        move: { scrollbars: true, drag: true, wheel: true }
    });
    try {
        if (typeof defaultBlocksJsonStep5 !== 'undefined') {
            Blockly.serialization.workspaces.load(defaultBlocksJsonStep5, window.workspace);
        }
    } catch (e) {
        console.error("ブロックの初期読み込みエラー:", e);
    }
    const blocklyDiv = document.getElementById('blocklyDiv');
    const resizeObserver = new ResizeObserver(() => {
        if (window.workspace) { Blockly.svgResize(window.workspace); }
    });
    resizeObserver.observe(blocklyDiv);
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
    resetSimulator();
    disableManualButtons();
});

function disableManualButtons() {
    ['red-on', 'red-off', 'green-on', 'green-off', 'blue-on', 'blue-off', 'end-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) { btn.style.pointerEvents = 'none'; btn.style.cursor = 'default'; }
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
    if (window.parent) window.parent.hasClickedConnect = true;
    const success = await connectDevice();
    if (success) {
        if (window.parent && window.parent.transferSharedHID) {
            if (isIOS) await window.parent.transferSharedHID([253, 5]);
            else await window.parent.transferSharedHID([252]);
        }
    } else alert('デバイスの接続に失敗したか、キャンセルされました。');
});

function render() {
    stateValText.textContent = appState;
    if (appState === 8) {
        ledImage.style.backgroundColor = '#555'; ledImage.style.boxShadow = 'none';
        document.getElementById('red-on').classList.remove('pressed'); document.getElementById('red-off').classList.remove('pressed');
        document.getElementById('green-on').classList.remove('pressed'); document.getElementById('green-off').classList.remove('pressed');
        document.getElementById('blue-on').classList.remove('pressed'); document.getElementById('blue-off').classList.remove('pressed');
    } else {
        document.getElementById('red-on').classList.toggle('pressed', (appState & 1) !== 0);
        document.getElementById('green-on').classList.toggle('pressed', (appState & 2) !== 0);
        document.getElementById('blue-on').classList.toggle('pressed', (appState & 4) !== 0);
        document.getElementById('red-off').classList.toggle('pressed', (appState & 1) === 0);
        document.getElementById('green-off').classList.toggle('pressed', (appState & 2) === 0);
        document.getElementById('blue-off').classList.toggle('pressed', (appState & 4) === 0);
        if (appState === 0) { 
            ledImage.style.backgroundColor = '#555'; ledImage.style.boxShadow = 'none'; 
        } else {
            const r = (appState & 1) ? 255 : 0, g = (appState & 2) ? 255 : 0, b = (appState & 4) ? 255 : 0;
            ledImage.style.backgroundColor = `rgb(${r}, ${g}, ${b})`; ledImage.style.boxShadow = `0 0 30px rgb(${r}, ${g}, ${b})`;
        }
    }
}

function resetSimulator() {
    appState = 8;
    render();
    if (window.workspace) {
        window.workspace.highlightBlock(null);
    }
}

document.getElementById('transfer-btn').addEventListener('click', async () => {
    if (isSimulating || !window.workspace) return;
    const startBlock = window.workspace.getBlocksByType('cmd_start')[0];
    if (!startBlock) return alert("「プログラムスタート」ブロックが見つかりません！");
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
                case "red": r = 255; break; case "green": g = 255; break; case "blue": b = 255; break;
                case "yellow": r = 255; g = 255; break; case "purple": r = 255; b = 255; break;
                case "cyan": g = 255; b = 255; break; case "white": r = 255; g = 255; b = 255; break;
            }
            let sec = Math.round(timeSec * 4);
            addr += 6; 
            hidBytes.push(130, r, g, b, sec, addr);
            hasHardwareCommand = true;
        } 
        else if (currentBlock.type === 'cmd_wait_sound') {
            addr += 2; 
            hidBytes.push(170, addr);
            hasHardwareCommand = true;
        }
        currentBlock = currentBlock.getNextBlock();
    }
    if (hasHardwareCommand) {
        hidBytes.push(231, 250); 
        if (window.parent && window.parent.transferSharedHID) {
            await window.parent.transferSharedHID(hidBytes);
        }
    } else {
        alert("転送するブロックが繋がっていません！");
    }
});

document.getElementById('run-btn').addEventListener('click', async () => {
    if (isSimulating || !window.workspace) return;
    const startBlock = window.workspace.getBlocksByType('cmd_start')[0];
    if (!startBlock) return;

    isSimulating = true; // マイクの許可待ちの間も二重実行を防ぐ

    try {
        // 「音が鳴るまで待つ」があるときだけ FSK 受信(マイク)を開始する
        if (chainHasType(startBlock, 'cmd_wait_sound')) {
            try {
                await startFsk();
            } catch (err) {
                console.error('マイクの開始に失敗しました: ', err);
                alert('マイクを使えませんでした。マイクの使用を許可してから、もう一度実行してください。');
                return;
            }
        }

        // マイクの準備ができてから、マイコンへ実行コマンドを送る
        if (window.parent && window.parent.transferSharedHID) {
            const runCommand = isIOS ? [253, 2] : [241];
            window.parent.transferSharedHID(runCommand);
        }

        window.workspace.highlightBlock(startBlock.id);

        let currentBlock = startBlock.getNextBlock();
        while (currentBlock) {
            window.workspace.highlightBlock(currentBlock.id);
            if (currentBlock.type === 'cmd_led') {
                const colorName = currentBlock.getFieldValue('COLOR');
                const timeSec = Number(currentBlock.getFieldValue('TIME'));
                appState = 0;
                switch (colorName) {
                    case "red": appState = 1; break; case "green": appState = 2; break; case "blue": appState = 4; break;
                    case "yellow": appState = 3; break; case "purple": appState = 5; break; case "cyan": appState = 6; break; case "white": appState = 7; break;
                }
                render();
                await wait(timeSec * 1000);
                appState = 0;
                render();
            }
            else if (currentBlock.type === 'cmd_wait_sound') {
                // マイコンから FSK で 170, 1 が届くまでここで待つ
                await waitForSensor(170, 1);
            }
            currentBlock = currentBlock.getNextBlock();
        }
    } finally {
        await stopFsk();   // マイクを止める
        isSimulating = false;
        resetSimulator();
    }
});
