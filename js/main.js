// ==========================================
// 端末(OS)の自動判定
// ==========================================
// iPadOS, iOSかどうかを判定する
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

// データを2進数の配列に変換する
function getBinary(arrayData) {
    var tmp = arrayData;
    let returnData = Array(8);
    for (let i = 0; i < 8; i++) {
        tmp = tmp & 0b10000000;
        if (tmp == 0) {
            returnData[i] = 0;
        } else {
            returnData[i] = 1;
        }
        arrayData = arrayData << 1;
        tmp = arrayData;
    }
    return returnData;
}

// 配列データを音声パケット化して出力する
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
                    tmp = i + 20;
                    while (i < tmp) newArray[i++] = 0;
                    tmp = i + 30;
                    while (i < tmp) newArray[i++] = 1;
                }
                if (x == 0) {
                    tmp = i + 5;
                    while (i < tmp) newArray[i++] = 0;
                    tmp = i + 5;
                    while (i < tmp) newArray[i++] = 1;
                } else {
                    tmp = i + 5;
                    while (i < tmp) newArray[i++] = 0;
                    tmp = i + 15;
                    while (i < tmp) newArray[i++] = 1;
                }
                counter++;
                if ((counter % 8) == 0) {
                    tmp = i + 20;
                    while (i < tmp) newArray[i++] = 0;
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
}


// ==========================================
// 共有接続・転送管理 (OS自動分岐)
// ==========================================
window.sharedHidDevice = null;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// データ送信関数
window.transferSharedHID = async function(outData) {
    console.log("◆ 送信データ (元データ):", outData); 

    if (isIOS) {
        // --- iPadOSの場合: データを16バイトずつのチャンクに分割して音声送信 ---
        let allPackets = [];
        let blockNum = 1;
        
        for (let i = 0; i < outData.length; i += 16) {
            let sendArray = Array(19).fill(0);
            sendArray[0] = 253; // 音声通信のヘッダ
            sendArray[1] = 1;   // データ送信コマンド
            sendArray[2] = blockNum;
            
            let chunk = outData.slice(i, i + 16);
            for (let j = 0; j < chunk.length; j++) {
                sendArray[3 + j] = chunk[j];
            }
            allPackets.push(sendArray);
            blockNum++;
        }
        
        // ★修正: 実行コマンド (253, 2) を追加していた処理を削除し、データパケットのみを送るようにしました。
        
        console.log(`【iPad送信】全${allPackets.length}個のパケットを音声で送信します`, allPackets);
        sendCombinedDataBySound(allPackets);
        
    } else {
        // --- Windows/ChromeOSの場合: WebHIDで1バイトずつ送信 ---
        if (!window.sharedHidDevice || !window.sharedHidDevice.opened) {
            console.log("【WebHID送信】デバイスが未接続です。送信をスキップします。");
            return;
        }
        
        const outputReport = new Uint8Array([0]);
        console.log("【WebHID送信】データ送信を開始します...");

        for (let i = 0; i < outData.length; i++) {
            outputReport[0] = outData[i];
            await window.sharedHidDevice.sendReport(0x00, outputReport);
            console.log(`【WebHID送信】送信中 (${i + 1}/${outData.length}): ${outData[i]}`); 
            await wait(90); 
        }
        console.log("【WebHID送信】データ送信が完了しました。");
    }
};

// デバイス接続関数
window.connectSharedDevice = async function() {
    if (isIOS) {
        // --- iPadOSの場合: 音声通信の準備のみ行い、ダミー音声は出さない ---
        ensureAudioContext();
        
        // 画面上には「音声通信」として接続完了を伝える
        return { productName: "音声通信 (iPad)" };
        
    } else {
        // --- Windows/ChromeOSの場合: WebHID接続処理 ---
        if (!('hid' in navigator)) return null;
        try {
            if (window.sharedHidDevice && window.sharedHidDevice.opened) {
                return window.sharedHidDevice;
            }

            const devices = await navigator.hid.getDevices();
            let targetDevice = devices.find(d => d.vendorId === 0x21CF);

            if (!targetDevice) {
                const requested = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x21CF }] });
                if (requested.length > 0) {
                    targetDevice = requested[0];
                } else {
                    return null;
                }
            }

            window.sharedHidDevice = targetDevice;
            if (!window.sharedHidDevice.opened) {
                await window.sharedHidDevice.open();
                // HID初期化信号
                await window.transferSharedHID([252]); 
            }
            return window.sharedHidDevice;
        } catch (error) {
            console.error("HID接続エラー:", error);
            return null;
        }
    }
};

// WebHIDの切断検知
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

// ==========================================
// タブ・ヘルプ機能
// ==========================================
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

function closeHelp() {
    document.getElementById('help-dialog').close();
}
