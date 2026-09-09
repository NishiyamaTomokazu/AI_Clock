// ==========================================
// Windows/ChromeOS用 (WebHID) USB通信モジュール
// ==========================================

console.log("【WebHID通信モード】USB通信モジュールをロードしました。");

window.hasClickedConnect = false;
window.sharedHidDevice = null;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 共通関数名で公開
window.connectSharedDevice = async function() {
    if (!('hid' in navigator)) {
        alert("このブラウザはWebHIDに対応していません。\nChrome等の対応ブラウザをご利用ください。");
        return null;
    }
    try {
        if (window.sharedHidDevice && window.sharedHidDevice.opened) { 
            return window.sharedHidDevice; 
        }
        
        const devices = await navigator.hid.getDevices();
        let targetDevice = devices.find(d => d.vendorId === 0x21CF); // AIクロックのVendor ID
        
        if (!targetDevice) {
            const requested = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x21CF }] });
            if (requested.length > 0) { 
                targetDevice = requested[0]; 
            } else { 
                return null; // キャンセルされた
            }
        }
        
        window.sharedHidDevice = targetDevice;
        if (!window.sharedHidDevice.opened) {
            await window.sharedHidDevice.open();
        }
        console.log("🔌 WebHID デバイス接続成功:", targetDevice.productName);
        return window.sharedHidDevice;
        
    } catch (error) {
        console.error("HID接続エラー:", error);
        return null;
    }
};

// 共通関数名で公開
window.transferSharedHID = async function(outData) {
    console.log("◆ 送信データ (元データ):", outData); 

    if (!window.sharedHidDevice || !window.sharedHidDevice.opened) {
        console.log("【WebHID送信】デバイスが未接続です。送信をスキップします。");
        return;
    }

    // 手動LED操作(248)は19バイトのパケットにする必要があるため、0で埋めて拡張する
    if (outData[0] === 248 && outData.length < 19) {
        let padded = Array(19).fill(0);
        for (let i = 0; i < outData.length; i++) {
            padded[i] = outData[i];
        }
        outData = padded;
    }

    const outputReport = new Uint8Array([0]);
    console.log("【WebHID送信】データ送信を開始します...");
    
    for (let i = 0; i < outData.length; i++) {
        outputReport[0] = outData[i];
        await window.sharedHidDevice.sendReport(0x00, outputReport);
        await wait(90); 
    }
    console.log("【WebHID送信】データ送信が完了しました。");
};

// 切断検知イベント
if (navigator.hid) {
    navigator.hid.addEventListener('disconnect', (event) => {
        if (window.sharedHidDevice && event.device === window.sharedHidDevice) {
            console.log("WebHID デバイスの切断を検知しました。");
            window.sharedHidDevice = null;
            const frame = document.getElementById('content-frame');
            if (frame && frame.contentWindow && frame.contentWindow.onDeviceDisconnected) {
                frame.contentWindow.onDeviceDisconnected();
            }
        }
    });
}