// ==========================================
// 接続ボタンを一度でも押したかどうかのフラグ
// ==========================================
window.hasClickedConnect = false;

// ==========================================
// 端末(OS)の自動判定
// ==========================================
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ==========================================
// iPadOS用 (Web Audio API) 音声通信処理
// ==========================================
var AudioContextClass = window.AudioContext || window.webkitAudioContext;
var audioCtx = null;

function ensureAudioContext() {
    if (!AudioContextClass) return null;
    if (!audioCtx) {
        audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(function (e) { console.warn('AudioContext resume failed:', e); });
    }
    return audioCtx;
}

function getBinary(arrayData) {
    var tmp = arrayData;
    let returnData = Array(8);
    for (let i = 0; i < 8; i++) {
        tmp = tmp & 0b10000000;
        if (tmp == 0) { returnData[i] = 0; } else { returnData[i] = 1; }
        arrayData = arrayData << 1;
        tmp = arrayData;
    }
    return returnData;
}

function sendCombinedDataBySound(packets) {
    var audioCtxLocal = ensureAudioContext();
    if (!audioCtxLocal) return;

    var channels = 2;
    var sampleRate = audioCtxLocal.sampleRate || 44100;
    const binaryPackets = packets.map(packet => packet.map(getBinary));

    let totalSamples = 0;
    const waitSamples = Math.floor(sampleRate * 0.5);

    binaryPackets.forEach((binaryDataArray) => {
        let est = 0;
        let counterEst = 0;
        binaryDataArray.forEach(element => {
            element.forEach(x => {
                if ((counterEst % 8) == 0) est += 50;
                if (x == 0) est += 10;
                else est += 20;
                counterEst++;
                if ((counterEst % 8) == 0) est += 20;
            })
        });
        totalSamples += est + 1024 + waitSamples;
    });

    var myArrayBuffer = audioCtxLocal.createBuffer(channels, totalSamples, sampleRate);
    var newArray = myArrayBuffer.getChannelData(0);
    let i = 0;
    var tmp = 0;

    binaryPackets.forEach((binaryDataArray) => {
        let counter = 0;
        binaryDataArray.forEach(element => {
            element.forEach(x => {
                if ((counter % 8) == 0) {
                    tmp = i + 20; while (i < tmp) newArray[i++] = 0;
                    tmp = i + 30; while (i < tmp) newArray[i++] = 1;
                }
                if (x == 0) {
                    tmp = i + 5; while (i < tmp) newArray[i++] = 0;
                    tmp = i + 5; while (i < tmp) newArray[i++] = 1;
                } else {
                    tmp = i + 5; while (i < tmp) newArray[i++] = 0;
                    tmp = i + 15; while (i < tmp) newArray[i++] = 1;
                }
                counter++;
                if ((counter % 8) == 0) {
                    tmp = i + 20; while (i < tmp) newArray[i++] = 0;
                }
            })
        });
        i += 1024;
        tmp = i + waitSamples;
        while (i < tmp) newArray[i++] = 0;
    });

    var source = audioCtxLocal.createBufferSource();
    source.buffer = myArrayBuffer;
    source.connect(audioCtxLocal.destination);
    source.start();
    
    console.log("🔊 音声データを出力しました");
}

// ==========================================
// 共有接続・転送管理 (OS自動分岐)
// ==========================================
window.sharedHidDevice = null;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

window.transferSharedHID = async function(outData) {
    console.log("◆ 送信データ (元データ):", outData); 

    if (isIOS) {
        let allPackets = [];
        
        // ★完全修正: 不要なヘッダー(253, 1, 1)を付ける処理をすべて削除し、
        // どんなデータでも純粋にそのまま19バイトに区切って送るようにしました
        for (let i = 0; i < outData.length; i += 19) {
            let packet = Array(19).fill(0);
            let chunk = outData.slice(i, i + 19);
            for (let j = 0; j < chunk.length; j++) {
                packet[j] = chunk[j];
            }
            allPackets.push(packet);
        }
        
        console.log(`【iPad送信】全${allPackets.length}個のパケットを音声で送信します`, allPackets);
        sendCombinedDataBySound(allPackets);
    } else {
        if (!window.sharedHidDevice || !window.sharedHidDevice.opened) {
            console.log("【WebHID送信】デバイスが未接続です。送信をスキップします。");
            return;
        }
        const outputReport = new Uint8Array([0]);
        console.log("【WebHID送信】データ送信を開始します...");
        for (let i = 0; i < outData.length; i++) {
            outputReport[0] = outData[i];
            await window.sharedHidDevice.sendReport(0x00, outputReport);
            await wait(90); 
        }
        console.log("【WebHID送信】データ送信が完了しました。");
    }
};

window.connectSharedDevice = async function() {
    if (isIOS) {
        let ctx = ensureAudioContext();
        if (ctx) {
            let buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
            let source = ctx.createBufferSource();
            source.buffer = buffer; source.connect(ctx.destination); source.start(0);
            console.log("🔓 音声通信のロックを解除しました");
        }
        return { productName: "音声通信 (iPad)" };
    } else {
        if (!('hid' in navigator)) return null;
        try {
            if (window.sharedHidDevice && window.sharedHidDevice.opened) { return window.sharedHidDevice; }
            const devices = await navigator.hid.getDevices();
            let targetDevice = devices.find(d => d.vendorId === 0x21CF);
            if (!targetDevice) {
                const requested = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x21CF }] });
                if (requested.length > 0) { targetDevice = requested[0]; } else { return null; }
            }
            window.sharedHidDevice = targetDevice;
            if (!window.sharedHidDevice.opened) {
                await window.sharedHidDevice.open();
            }
            return window.sharedHidDevice;
        } catch (error) {
            console.error("HID接続エラー:", error);
            return null;
        }
    }
};

if (navigator.hid) {
    navigator.hid.addEventListener('disconnect', (event) => {
        if (window.sharedHidDevice && event.device === window.sharedHidDevice) {
            window.sharedHidDevice = null;
            const frame = document.getElementById('content-frame');
            if (frame && frame.contentWindow && frame.contentWindow.onDeviceDisconnected) {
                frame.contentWindow.onDeviceDisconnected();
            }
        }
    });
}

let currentHelpUrl = 'help/step1_help.html';

function loadTab(url, btnElement) {
    const frame = document.getElementById('content-frame');
    currentHelpUrl = 'help/' + url.replace('.html', '_help.html');
    frame.src = url;
    document.querySelectorAll('.tab-btn:not(#help-btn)').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
}

function openHelp() {
    const dialog = document.getElementById('help-dialog');
    document.getElementById('help-frame').src = currentHelpUrl;
    dialog.showModal();
}

function closeHelp() { document.getElementById('help-dialog').close(); }