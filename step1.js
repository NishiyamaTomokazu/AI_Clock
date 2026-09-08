let appState = 0;

const ledImage = document.getElementById('led-image');
const stateValText = document.getElementById('state-val');
const deviceStatusText = document.getElementById('device-status');

window.onDeviceDisconnected = function() {
    deviceStatusText.textContent = "未接続";
    deviceStatusText.style.color = "red";
};

window.addEventListener('DOMContentLoaded', () => {
    if (window.parent && window.parent.hasClickedConnect) {
        document.getElementById('connect-hint').style.display = 'none';
    }

    if (window.parent && window.parent.sharedHidDevice && window.parent.sharedHidDevice.opened) {
        deviceStatusText.textContent = `接続中 (${window.parent.sharedHidDevice.productName})`;
        deviceStatusText.style.color = '#0ff';
        sendStateToDevice();
    }
});

document.getElementById('connect-btn').addEventListener('click', async () => {
    document.getElementById('connect-hint').style.display = 'none';
    if (window.parent) {
        window.parent.hasClickedConnect = true;
    }

    if (window.parent && window.parent.connectSharedDevice) {
        const device = await window.parent.connectSharedDevice();
        if (device) {
            deviceStatusText.textContent = `接続中 (${device.productName})`;
            deviceStatusText.style.color = '#0ff';
            
            // ★追加: ボタンが押されて接続成功時に 252 を送信する
            if (window.parent.transferSharedHID) {
                console.log("◆AI クロック接続コマンド送信: [252]");
                await window.parent.transferSharedHID([252]);
            }
            sendStateToDevice();
        } else {
            alert('デバイスの接続に失敗したか、キャンセルされました。');
        }
    }
});

async function sendStateToDevice() {
    if (window.parent && window.parent.transferSharedHID) {
        try { await window.parent.transferSharedHID([248, 240, appState]); } catch (error) {}
    }
}

function render() {
    stateValText.textContent = appState;
    if (appState === 8) {
        ledImage.style.backgroundColor = '#555'; ledImage.style.boxShadow = 'none';
        document.getElementById('red-on').classList.remove('pressed');
        document.getElementById('green-on').classList.remove('pressed');
        document.getElementById('blue-on').classList.remove('pressed');
    } else {
        document.getElementById('red-on').classList.toggle('pressed', (appState & 1) !== 0);
        document.getElementById('green-on').classList.toggle('pressed', (appState & 2) !== 0);
        document.getElementById('blue-on').classList.toggle('pressed', (appState & 4) !== 0);
        if (appState === 0) {
            ledImage.style.backgroundColor = '#555'; ledImage.style.boxShadow = 'none';
        } else {
            const r = (appState & 1) ? 255 : 0, g = (appState & 2) ? 255 : 0, b = (appState & 4) ? 255 : 0;
            ledImage.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
            ledImage.style.boxShadow = `0 0 30px rgb(${r}, ${g}, ${b})`;
        }
    }
    sendStateToDevice();
}

window.turnOn = function(value) { if (appState === 8) appState = 0; appState |= value; render(); }
window.turnOff = function(value) { if (appState === 8) appState = 0; appState &= ~value; render(); }
window.endApp = function() { appState = 8; render(); }

document.getElementById('red-on').addEventListener('click', () => turnOn(1));
document.getElementById('red-off').addEventListener('click', () => turnOff(1));
document.getElementById('green-on').addEventListener('click', () => turnOn(2));
document.getElementById('green-off').addEventListener('click', () => turnOff(2));
document.getElementById('blue-on').addEventListener('click', () => turnOn(4));
document.getElementById('blue-off').addEventListener('click', () => turnOff(4));
document.getElementById('end-btn').addEventListener('click', endApp);
render();