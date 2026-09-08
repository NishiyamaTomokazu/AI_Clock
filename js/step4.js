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
        sendStateToDevice();
    }
});

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
                sendStateToDevice();
            }
        }
    } else {
        alert('デバイスの接続に失敗したか、キャンセルされました。');
    }
});

async function sendStateToDevice() {
    if (isSimulating) return; 
    if (window.parent && window.parent.transferSharedHID) {
        try { await window.parent.transferSharedHID([248, 0, appState]); } catch (error) {}
    }
}

function render() {
    stateValText.textContent = appState;
    if (appState === 8) {
        ledImage.style.backgroundColor = '#555'; ledImage.style.boxShadow = 'none';
        document.getElementById('red-on').classList.remove('pressed'); document.getElementById('green-on').classList.remove('pressed'); document.getElementById('blue-on').classList.remove('pressed');
    } else {
        document.getElementById('red-on').classList.toggle('pressed', (appState & 1) !== 0);
        document.getElementById('green-on').classList.toggle('pressed', (appState & 2) !== 0);
        document.getElementById('blue-on').classList.toggle('pressed', (appState & 4) !== 0);
        if (appState === 0) { ledImage.style.backgroundColor = '#555'; ledImage.style.boxShadow = 'none'; } else {
            const r = (appState & 1) ? 255 : 0, g = (appState & 2) ? 255 : 0, b = (appState & 4) ? 255 : 0;
            ledImage.style.backgroundColor = `rgb(${r}, ${g}, ${b})`; ledImage.style.boxShadow = `0 0 30px rgb(${r}, ${g}, ${b})`;
        }
    }
    sendStateToDevice(); 
}

window.turnOn = function(value) { if (isSimulating) return; if (appState === 8) appState = 0; appState |= value; render(); }
window.turnOff = function(value) { if (isSimulating) return; if (appState === 8) appState = 0; appState &= ~value; render(); }
window.endApp = function() { if (isSimulating) return; appState = 8; render(); }

document.getElementById('red-on').addEventListener('click', () => turnOn(1)); document.getElementById('red-off').addEventListener('click', () => turnOff(1));
document.getElementById('green-on').addEventListener('click', () => turnOn(2)); document.getElementById('green-off').addEventListener('click', () => turnOff(2));
document.getElementById('blue-on').addEventListener('click', () => turnOn(4)); document.getElementById('blue-off').addEventListener('click', () => turnOff(4));
document.getElementById('end-btn').addEventListener('click', endApp);

document.getElementById('transfer-btn').addEventListener('click', async () => {
    if (isSimulating) return; 
    if (!window.workspace) return;

    const startBlock = window.workspace.getBlocksByType('cmd_start')[0];
    if (!startBlock) {
        alert("「プログラムスタート」ブロックが見つかりません！");
        return;
    }

    // ★変更: iPad(iOS)の場合は [248, 0, 230, 2] を先頭にする
    let hidBytes = isIOS ? [248, 0, 230, 2] : [240, 230, 2]; 
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

document.getElementById('run-btn').addEventListener('click', async () => {
    if (isSimulating) return; 
    if (!window.workspace) return;

    const startBlock = window.workspace.getBlocksByType('cmd_start')[0];
    if (!startBlock) return;

    if (window.parent && window.parent.transferSharedHID) {
        let runCommand = [241]; 
        console.log("◆実行コマンド送信:", runCommand);
        window.parent.transferSharedHID(runCommand); 
    } else {
        alert("通信機能が見つかりません。");
    }

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
            render(); 
            await wait(timeSec * 1000);
        }
        currentBlock = currentBlock.getNextBlock();
    }

    isSimulating = false;
    endApp(); 
});