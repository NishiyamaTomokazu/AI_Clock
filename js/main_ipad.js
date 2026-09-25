// ==========================================
// iPadOS用 (Web Audio API) 音声通信モジュール
// ==========================================

console.log("【iPad通信モード】音声送受信モジュールをロードしました。");

window.hasClickedConnect = false;
window.sharedHidDevice = { opened: false, productName: "音声通信 (iPad)" }; // ダミーデバイス

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

// --- 追加: FSK受信用の変数と設定 ---
let analyser;
let microphone;
let isListening = false;
const FREQ_SPACE = 1200; // ビット「0」の周波数 (Hz)
const FREQ_MARK  = 2200; // ビット「1」の周波数 (Hz)
const BAUD_RATE  = 300;  // 通信速度 (bps)
const BIT_TIME_MS = 1000 / BAUD_RATE; // 1ビットの長さ (約3.33ミリ秒)

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
    let tmp = arrayData;
    let returnData = Array(8);
    for (let i = 0; i < 8; i++) {
        tmp = tmp & 0b10000000;
        returnData[i] = (tmp == 0) ? 0 : 1;
        arrayData = arrayData << 1;
        tmp = arrayData;
    }
    return returnData;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sendCombinedDataBySound(packets) {
    const audioCtxLocal = ensureAudioContext();
    if (!audioCtxLocal) return;

    const channels = 2;
    const sampleRate = audioCtxLocal.sampleRate || 44100;
    const binaryPackets = packets.map(packet => packet.map(getBinary));

    let totalSamples = 0;
    const waitSamples = Math.floor(sampleRate * 0.5); // ブロック間待機500ms

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

    const myArrayBuffer = audioCtxLocal.createBuffer(channels, totalSamples, sampleRate);
    const newArray = myArrayBuffer.getChannelData(0);
    let i = 0;
    let tmp = 0;

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

    const source = audioCtxLocal.createBufferSource();
    source.buffer = myArrayBuffer;
    source.connect(audioCtxLocal.destination);
    source.start();
    
    console.log("🔊 音声データを出力しました (ブロック間待機: 500ms)");
}

// 共通関数名で公開
window.connectSharedDevice = async function() {
    let ctx = ensureAudioContext();
    if (ctx) {
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }
        let buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        let source = ctx.createBufferSource();
        source.buffer = buffer; 
        source.connect(ctx.destination); 
        source.start(0);
        console.log("🔓 音声通信のロックを解除しました");
        await wait(400); 

        // ★追加: マイク入力の許可とFSKデコーダーの開始
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            microphone = ctx.createMediaStreamSource(stream);
            analyser = ctx.createAnalyser();
            analyser.fftSize = 256; 
            analyser.smoothingTimeConstant = 0.0; 
            microphone.connect(analyser);
            isListening = true;
            console.log("🎤 マイク接続成功: FSK受信の待機を開始します。(300bps)");
            startFSKDecoder();
        } catch (error) {
            console.error("マイク接続エラー:", error);
            alert("マイクへのアクセスが許可されていません。\nブラウザの設定を確認してください。");
        }
    }
    window.sharedHidDevice.opened = true;
    return window.sharedHidDevice;
};

// 共通関数名で公開
window.transferSharedHID = async function(outData) {
    console.log("◆ 送信データ (元データ):", outData); 
    let allPackets = [];
    
    // データの先頭が「230」なら16バイト分割＆ヘッダー付与
    if (outData[0] === 230) {
        let blockNum = 1;
        for (let i = 0; i < outData.length; i += 16) {
            let packet = Array(19).fill(0);
            packet[0] = 253; // データ送信の目印
            packet[1] = 1;   // LEDデータ転送の目印
            packet[2] = blockNum; // ブロック番号
            
            let chunk = outData.slice(i, i + 16);
            for (let j = 0; j < chunk.length; j++) { 
                packet[3 + j] = chunk[j]; 
            }
            allPackets.push(packet);
            blockNum++;
        }
    } 
    // それ以外はそのまま19バイトで送る
    else {
        let packet = Array(19).fill(0);
        for (let i = 0; i < outData.length; i++) {
            if (i < 19) packet[i] = outData[i];
        }
        allPackets.push(packet);
    }
    
    console.log(`【iPad送信】全${allPackets.length}個のパケットを音声で送信します`, allPackets);
    sendCombinedDataBySound(allPackets);
};

// ==========================================
// ★追加: FSK デコード処理 (シリアル通信の復元)
// ==========================================
function startFSKDecoder() {
    if(!analyser || !audioCtx) return;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const sampleRate = audioCtx.sampleRate;
    
    const spaceBin = Math.round(FREQ_SPACE * analyser.fftSize / sampleRate);
    const markBin  = Math.round(FREQ_MARK * analyser.fftSize / sampleRate);
    
    let state = 'IDLE';
    let bitBuffer = 0;
    let bitCount = 0;
    let lastBitTime = 0;
    
    let receivedBytes = [];
    let receiveTimeout;
    
    setInterval(() => {
        if (!isListening) return;
        analyser.getByteFrequencyData(dataArray);
        
        const spaceVol = Math.max(dataArray[spaceBin-1] || 0, dataArray[spaceBin], dataArray[spaceBin+1] || 0);
        const markVol  = Math.max(dataArray[markBin-1] || 0, dataArray[markBin], dataArray[markBin+1] || 0);
        
        let currentSignal = -1;
        const THRESHOLD = 50;
        
        if (spaceVol > THRESHOLD && spaceVol > markVol + 15) {
            currentSignal = 0;
        } else if (markVol > THRESHOLD && markVol > spaceVol + 15) {
            currentSignal = 1;
        }
        
        const now = performance.now();
        
        switch (state) {
            case 'IDLE':
                if (currentSignal === 0) {
                    state = 'START_BIT';
                    lastBitTime = now;
                }
                break;
                
            case 'START_BIT':
                if (now - lastBitTime >= BIT_TIME_MS / 2) {
                    if (currentSignal === 0) {
                        state = 'DATA_BITS';
                        bitCount = 0;
                        bitBuffer = 0;
                        lastBitTime = now + (BIT_TIME_MS / 2); 
                    } else {
                        state = 'IDLE'; 
                    }
                }
                break;
                
            case 'DATA_BITS':
                if (now - lastBitTime >= BIT_TIME_MS) {
                    lastBitTime += BIT_TIME_MS;
                    
                    if (currentSignal === 1) {
                        bitBuffer |= (1 << bitCount);
                    }
                    
                    bitCount++;
                    if (bitCount >= 8) {
                        state = 'STOP_BIT';
                    }
                }
                break;
                
            case 'STOP_BIT':
                if (now - lastBitTime >= BIT_TIME_MS) {
                    receivedBytes.push(bitBuffer);
                    console.log("📥 [マイク受信] 1バイト復元:", bitBuffer);
                    
                    clearTimeout(receiveTimeout);
                    receiveTimeout = setTimeout(() => {
                        const frame = document.getElementById('content-frame');
                        if (frame && frame.contentWindow && receivedBytes.length > 0) {
                            console.log("🚀 [アプリへ通知(シミュレータ連動)]:", receivedBytes);
                            // ★追加: step5.jsなどの waitForSensor 関数へ受信データを渡す
                            frame.contentWindow.dispatchEvent(new CustomEvent('hid-input', {
                                detail: { data: [...receivedBytes] }
                            }));
                            receivedBytes = [];
                        }
                    }, 30);
                    
                    state = 'IDLE';
                }
                break;
        }
    }, 1); 
}
