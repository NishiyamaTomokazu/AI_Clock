let appState = 0;
let isSimulating = false; 
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function waitForCondition(targetCode) {
    return new Promise((resolve) => {
        const listener = (event) => {
            const receivedData = event.detail.data;
            if (receivedData.length >= 2 && receivedData[0] === targetCode) {
                window.removeEventListener('hid-input', listener);
                resolve(receivedData[1]); 
            }
        };
        window.addEventListener('hid-input', listener);
    });
}

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
        if (typeof defaultBlocksJsonStep7 !== 'undefined') {
            Blockly.serialization.workspaces.load(defaultBlocksJsonStep7, window.workspace);
        }
    } catch (e) {
        console.error("ブロックの初期読み込みエラー:", e);
    }
    const blocklyDiv = document.getElementById('blocklyDiv');
    const resizeObserver = new ResizeObserver(() => {
        if (window.workspace) Blockly.svgResize(window.workspace);
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

    let blockData = new Map();
    function assignAddresses(block, currentAddr) {
        while (block) {
            let info = { addr: currentAddr, size: 0 };
            blockData.set(block.id, info);
            if (block.type === 'cmd_if' || block.type === 'cmd_if_else') {
                info.size = 3; 
                currentAddr += 3;
                let doBlock = block.getInputTargetBlock('DO');
                let elseBlock = block.getInputTargetBlock('ELSE');
                info.trueStart = currentAddr;
                if (doBlock) currentAddr = assignAddresses(doBlock, currentAddr);
                info.falseStart = currentAddr;
                if (elseBlock) currentAddr = assignAddresses(elseBlock, currentAddr);
                if (!doBlock) info.trueStart = currentAddr;
                if (!elseBlock) info.falseStart = currentAddr;
            } else if (block.type === 'cmd_led') {
                info.size = 6; currentAddr += 6;
            } else if (block.type === 'cmd_wait_sound' || block.type === 'cmd_wait_switch') {
                info.size = 2; currentAddr += 2;
            }
            block = block.getNextBlock();
        }
        return currentAddr; 
    }

    function generateBytes(block, exitAddr) {
        let bytes = [];
        while (block) {
            let info = blockData.get(block.id);
            let nextBlock = block.getNextBlock();
            let nextAddr = nextBlock ? blockData.get(nextBlock.id).addr : exitAddr;
            if (block.type === 'cmd_if' || block.type === 'cmd_if_else') {
                let isOff = block.getInputTargetBlock('COND')?.type === 'cond_switch_off';
                bytes.push(isOff ? 181 : 180, info.trueStart, info.falseStart);
                let doBlock = block.getInputTargetBlock('DO');
                if (doBlock) bytes.push(...generateBytes(doBlock, nextAddr));
                let elseBlock = block.getInputTargetBlock('ELSE');
                if (elseBlock) bytes.push(...generateBytes(elseBlock, nextAddr));
            } else if (block.type === 'cmd_led') {
                const colorName = block.getFieldValue('COLOR');
                const timeSec = Number(block.getFieldValue('TIME'));
                let r = 0, g = 0, bColor = 0;
                switch (colorName) {
                    case "red": r = 255; break; case "green": g = 255; break; case "blue": bColor = 255; break;
                    case "yellow": r = 255; g = 255; break; case "purple": r = 255; bColor = 255; break;
                    case "cyan": g = 255; bColor = 255; break; case "white": r = 255; g = 255; bColor = 255; break;
                }
                let sec = Math.round(timeSec * 4);
                bytes.push(130, r, g, bColor, sec, nextAddr);
            } else if (block.type === 'cmd_wait_sound') {
                bytes.push(170, nextAddr);
            } else if (block.type === 'cmd_wait_switch') {
                bytes.push(171, nextAddr);
            }
            block = nextBlock;
        }
        return bytes;
    }

    let endAddr = assignAddresses(startBlock.getNextBlock(), 2);
    let payloadBytes = generateBytes(startBlock.getNextBlock(), endAddr);
    
    if (payloadBytes.length > 0) {
        let hidBytes = isIOS ? [230, 2] : [240, 230, 2];
        hidBytes.push(...payloadBytes);
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
    if (window.parent && window.parent.transferSharedHID) {
        let runCommand = isIOS ? [253, 2] : [241]; 
        window.parent.transferSharedHID(runCommand); 
    }
    isSimulating = true;

    async function executeBlock(block) {
        while (block && isSimulating) {
            window.workspace.highlightBlock(block.id);

            if (block.type === 'cmd_led') {
                const colorName = block.getFieldValue('COLOR');
                const timeSec = Number(block.getFieldValue('TIME'));
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
            else if (block.type === 'cmd_wait_sound') {
                await waitForSensor(170, 1);
            }
            else if (block.type === 'cmd_wait_switch') {
                await waitForSensor(171, 1);
            }
            else if (block.type === 'cmd_if' || block.type === 'cmd_if_else') {
                await wait(300);
                let condBlock = block.getInputTargetBlock('COND');
                let condType = condBlock ? condBlock.type : 'cond_switch_on';
                let targetCode = (condType === 'cond_switch_off') ? 181 : 180;
                let result = await waitForCondition(targetCode);
                if (result === 1) {
                    let doBlock = block.getInputTargetBlock('DO');
                    if (doBlock) await executeBlock(doBlock);
                } else {
                    let elseBlock = block.getInputTargetBlock('ELSE');
                    if (elseBlock) await executeBlock(elseBlock);
                }
            }
            block = block.getNextBlock();
        }
    }

    window.workspace.highlightBlock(startBlock.id);
    //await wait(400);
    await executeBlock(startBlock.getNextBlock());

    isSimulating = false;
    resetSimulator(); 
});