let appState = 0;
let gameActive = false; 
let currentQuestion = 0; 
let targetColorValue = -1; 
let timerId = null;
let consecutiveFailures = 0; 

const ledImage = document.getElementById('led-image');
const stateValText = document.getElementById('state-val');
const deviceStatusText = document.getElementById('device-status');
const gameMessageEl = document.getElementById('game-message');
const questionNumEl = document.getElementById('question-num');

const colorTasks = { 0:"消灯させて", 1:"赤を点灯させて", 2:"緑を点灯させて", 3:"黄色を点灯させて", 4:"青を点灯させて", 5:"紫を点灯させて", 6:"水色を点灯させて", 7:"白を点灯させて" };

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

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

// ★修正: iPadでも手動操作のコマンドは送るように変更
async function sendStateToDevice() {
    if (window.parent && window.parent.transferSharedHID) {
        try { await window.parent.transferSharedHID([248, 240, appState]); } catch (error) {}
    }
}

window.startGame = async function() {
    if (!isIOS && (!window.parent.sharedHidDevice || !window.parent.sharedHidDevice.opened)) { 
        try { await connectDevice(); } catch(e) {}
    }
    
    appState = 8; render();
    gameActive = true; 
    currentQuestion = 0; 
    gameMessageEl.style.color = "#333"; 
    
    if (questionNumEl) questionNumEl.style.display = 'inline-block';
    
    const clearContainer = document.getElementById('clear-container');
    if (clearContainer) clearContainer.style.display = 'none';
    
    nextQuestion();
}

const startBtnEl = document.getElementById('start-game-btn');
if(startBtnEl) {
    startBtnEl.addEventListener('click', startGame);
}

function nextQuestion() {
    if (!questionNumEl) return;
    
    if (currentQuestion >= 5) {
        questionNumEl.textContent = "クリア！"; 
        gameMessageEl.textContent = "全問正解！"; 
        gameMessageEl.style.color = "#e65100"; 
        gameActive = false; 

        const clearContainer = document.getElementById('clear-container');
        if (clearContainer) clearContainer.style.display = 'block';

        if (window.parent && window.parent.document) {
            const step3Tab = window.parent.document.getElementById('tab-step3');
            if (step3Tab) step3Tab.style.display = 'inline-block';
        }
        return;
    }
    
    currentQuestion++; questionNumEl.textContent = `第 ${currentQuestion} 問 / 全5問`;
    
    let nextTarget; 
    do { nextTarget = Math.floor(Math.random() * 8); } while (nextTarget === appState);
    targetColorValue = nextTarget; 
    gameMessageEl.textContent = `${colorTasks[targetColorValue]}ください`; 
    gameMessageEl.style.color = "#333";

    clearTimeout(timerId);
    timerId = setTimeout(() => {
        if (gameActive) {
            gameActive = false; 
            targetColorValue = -1; 
            consecutiveFailures++; 
            
            if (consecutiveFailures >= 3) {
                questionNumEl.textContent = "終了！";
                gameMessageEl.innerHTML = `難しかったかな？<br><span style="font-size: 22px; font-weight: bold; color: #764ba2;">STEP3に進みましょう</span>`;
                
                const clearContainer = document.getElementById('clear-container');
                if (clearContainer) clearContainer.style.display = 'block';

                if (window.parent && window.parent.document) {
                    const step3Tab = window.parent.document.getElementById('tab-step3');
                    if (step3Tab) step3Tab.style.display = 'inline-block';
                }
                consecutiveFailures = 0;
            } else {
                questionNumEl.textContent = "タイムアップ";
                gameMessageEl.innerHTML = `残念....<br><span style="font-size: 18px;">(正解数: ${currentQuestion - 1}問)</span>`; 
                gameMessageEl.style.color = "red";
            }
        }
    }, 3000);
}

function checkGame() {
    if (!gameActive || targetColorValue === -1) return;
    if (appState === targetColorValue) {
        clearTimeout(timerId); 
        targetColorValue = -1; 
        consecutiveFailures = 0; 
        gameMessageEl.textContent = "正解！"; 
        gameMessageEl.style.color = "green";
        setTimeout(() => { if (gameActive) nextQuestion(); }, 600);
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
    sendStateToDevice(); checkGame();
}

window.turnOn = function(value) { if (appState === 8) appState = 0; appState |= value; render(); }
window.turnOff = function(value) { if (appState === 8) appState = 0; appState &= ~value; render(); }
window.endApp = function() { appState = 8; render(); }

window.goToStep3 = function() {
    endApp();
    if (window.parent && window.parent.document) {
        const step3Tab = window.parent.document.getElementById('tab-step3');
        if (step3Tab) step3Tab.click();
    }
}

document.getElementById('red-on').addEventListener('click', () => turnOn(1)); document.getElementById('red-off').addEventListener('click', () => turnOff(1));
document.getElementById('green-on').addEventListener('click', () => turnOn(2)); document.getElementById('green-off').addEventListener('click', () => turnOff(2));
document.getElementById('blue-on').addEventListener('click', () => turnOn(4)); document.getElementById('blue-off').addEventListener('click', () => turnOff(4));
document.getElementById('end-btn').addEventListener('click', endApp);

render();