// ==========================================
// iPadOS用 (マイク音波通信) FSK受信モジュール
// ==========================================

console.log("【iPad通信モード】マイク(FSK)受信モジュールをロードしました。");

window.hasClickedConnect = false;
window.sharedHidDevice = null;

let audioContext;
let analyser;
let microphone;
let isListening = false;

// --- FSKの通信ルール設定 ---
const FREQ_SPACE = 1200; // ビット「0」の周波数 (Hz)
const FREQ_MARK  = 2200; // ビット「1」の周波数 (Hz)
const BAUD_RATE  = 300;  // 通信速度 (bps)
const BIT_TIME_MS = 1000 / BAUD_RATE; // 1ビットの長さ (約3.33ミリ秒)

// アプリ画面から呼ばれる接続関数（WebHIDと互換）
window.connectSharedDevice = async function() {
    try {
        // マイクのアクセス許可を要求
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        microphone = audioContext.createMediaStreamSource(stream);
        
        // 周波数解析器（FFT）のセットアップ
        analyser = audioContext.createAnalyser();
        // ★300bpsの高速な変化(3.3ms)に追従するため、ウィンドウサイズを小さくし、残像(smoothing)を消す
        analyser.fftSize = 256; 
        analyser.smoothingTimeConstant = 0.0; 
        
        microphone.connect(analyser);
        
        isListening = true;
        window.sharedHidDevice = { productName: "iPadマイク (FSK通信 300bps)", opened: true };
        
        console.log("🎤 マイク接続成功: FSK受信の待機を開始します。(300bps)");
        startFSKDecoder();
        
        return window.sharedHidDevice;
        
    } catch (error) {
        console.error("マイク接続エラー:", error);
        alert("マイクへのアクセスが許可されていません。\nブラウザの設定を確認してください。");
        return null;
    }
};

// iPadからの送信機能（音を出す処理）は今回はダミー
window.transferSharedHID = async function(outData) {
    console.log("【iPad送信】マイコンへの送信は未実装です。データ:", outData);
};

// --- FSK デコード処理 (シリアル通信の復元) ---
function startFSKDecoder() {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const sampleRate = audioContext.sampleRate;
    
    // 1200Hzと2200Hzが、配列(dataArray)の何番目に入るかを計算
    const spaceBin = Math.round(FREQ_SPACE * analyser.fftSize / sampleRate);
    const markBin  = Math.round(FREQ_MARK * analyser.fftSize / sampleRate);
    
    let state = 'IDLE';
    let bitBuffer = 0;
    let bitCount = 0;
    let lastBitTime = 0;
    
    let receivedBytes = [];
    let receiveTimeout;
    
    // ブラウザの限界速度(約1〜2ms)でマイクの音を監視する
    setInterval(() => {
        if (!isListening) return;
        analyser.getByteFrequencyData(dataArray);
        
        // 指定した周波数周辺の音量を取得（少しのズレを許容するために前後も見る）
        const spaceVol = Math.max(dataArray[spaceBin-1] || 0, dataArray[spaceBin], dataArray[spaceBin+1] || 0);
        const markVol  = Math.max(dataArray[markBin-1] || 0, dataArray[markBin], dataArray[markBin+1] || 0);
        
        let currentSignal = -1; // -1:無音, 0:1200Hz, 1:2200Hz
        const THRESHOLD = 50;   // 雑音を無視するための音量しきい値(0〜255)
        
        if (spaceVol > THRESHOLD && spaceVol > markVol + 15) {
            currentSignal = 0;
        } else if (markVol > THRESHOLD && markVol > spaceVol + 15) {
            currentSignal = 1;
        }
        
        const now = performance.now();
        
        // 状態遷移（ステートマシン）
        switch (state) {
            case 'IDLE':
                // スタートビット (0) を検出したら受信開始
                if (currentSignal === 0) {
                    state = 'START_BIT';
                    lastBitTime = now;
                }
                break;
                
            case 'START_BIT':
                // 0.5ビット分待って、まだ0なら本物のスタートビットと判定
                if (now - lastBitTime >= BIT_TIME_MS / 2) {
                    if (currentSignal === 0) {
                        state = 'DATA_BITS';
                        bitCount = 0;
                        bitBuffer = 0;
                        lastBitTime = now + (BIT_TIME_MS / 2); // 次のビットの中央の時間を基準にする
                    } else {
                        state = 'IDLE'; // ただのノイズだった
                    }
                }
                break;
                
            case 'DATA_BITS':
                // 1ビット分経過するごとにサンプリング
                if (now - lastBitTime >= BIT_TIME_MS) {
                    lastBitTime += BIT_TIME_MS;
                    
                    if (currentSignal === 1) {
                        bitBuffer |= (1 << bitCount); // LSBファーストでビットを立てる
                    }
                    
                    bitCount++;
                    if (bitCount >= 8) {
                        state = 'STOP_BIT';
                    }
                }
                break;
                
            case 'STOP_BIT':
                // ストップビット(1)または無音を確認して1バイト完了
                if (now - lastBitTime >= BIT_TIME_MS) {
                    receivedBytes.push(bitBuffer);
                    console.log("📥 [マイク受信] 1バイト復元:", bitBuffer);
                    
                    // パケット終了の判定: 約30ミリ秒間新しいデータが来なかったら、まとまりとして画面(STEP)に送信する
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
    }, 1); // 1ms間隔で監視
}