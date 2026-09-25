// ==========================================
// iPadOS用 (マイク音波通信) 送受信モジュール
// ==========================================

console.log("【iPad通信モード】音声送受信モジュールをロードしました。");

window.hasClickedConnect = false;
window.sharedHidDevice = null;

let audioContext;
let analyser;
let microphone;
let isListening = false;

// --- 受信側 (マイコン -> iPad) のFSK仕様 ---
const FREQ_SPACE = 1200; // ビット「0」の周波数 (Hz)
const FREQ_MARK  = 2200; // ビット「1」の周波数 (Hz)
const BAUD_RATE  = 300;  // 通信速度 (bps)
const BIT_TIME_MS = 1000 / BAUD_RATE; // 1ビットの長さ (約3.33ミリ秒)

// ==========================================
// 1. 接続・初期化処理
// ==========================================
window.connectSharedDevice = async function() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        microphone = audioContext.createMediaStreamSource(stream);
        
        analyser = audioContext.createAnalyser();
        // 300bpsに追従するためウィンドウサイズを小さくし、スムージングを切る
        analyser.fftSize = 256; 
        analyser.smoothingTimeConstant = 0.0; 
        
        microphone.connect(analyser);
        
        isListening = true;
        window.sharedHidDevice = { productName: "iPad音声通信 (FSK 300bps)", opened: true };
        
        console.log("🎤 マイク接続成功: FSK受信の待機を開始します。(300bps)");
        startFSKDecoder();
        
        return window.sharedHidDevice;
        
    } catch (error) {
        console.error("マイク接続エラー:", error);
        alert("マイクへのアクセスが許可されていません。\nブラウザの設定を確認してください。");
        return null;
    }
};

// ==========================================
// 2. 送信処理 (iPad -> マイコン)
// app_ipad_2.js の仕様をベースに実装
// ==========================================
window.transferSharedHID = async function(outData) {
    console.log("【iPad送信】データ送信開始:", outData);
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    
    // バイト配列を2進数の配列に変換[cite: 12]
    let binaryDataArray = outData.map(getBinary);
    outputSoundData(binaryDataArray);
};

// バイトデータを8ビットの配列（MSBファースト）に変換する関数[cite: 12]
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

// AudioBufferを生成して波形を出力する関数[cite: 12]
function outputSoundData(binaryDataArray) {
    if (!audioContext) return;

    var channels = 2; // app_ipad_2.js に合わせたチャンネル設定[cite: 12]
    var sampleRate = audioContext.sampleRate || 44100;
    
    // 必要な総サンプル数を事前計算[cite: 12]
    let est = 0;
    let counterEst = 0;
    binaryDataArray.forEach(element => {
        element.forEach(x => {
            if ((counterEst % 8) == 0) est += 50;
            if (x == 0) est += 10;
            else est += 20;
            counterEst++;
            if ((counterEst % 8) == 0) est += 20;
        });
    });
    
    const waitSamples = Math.floor(sampleRate * 0.1); 
    let totalSamples = est + 1024 + waitSamples;

    var myArrayBuffer = audioContext.createBuffer(channels, totalSamples, sampleRate);
    var newArray = myArrayBuffer.getChannelData(0);

    let i = 0;
    var tmp = 0;
    let counter = 0;

    // 波形の書き込みロジック[cite: 12]
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
        });
    });

    var source = audioContext.createBufferSource();
    source.buffer = myArrayBuffer;
    source.connect(audioContext.destination);
    source.start();
}

// ==========================================
// 3. 受信処理 (FSK 300bps デコーダー)
// ==========================================
function startFSKDecoder() {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const sampleRate = audioContext.sampleRate;
    
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
                    
                    // 受信側はLSBファーストで組み立てる
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
