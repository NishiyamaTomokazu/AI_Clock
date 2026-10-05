// fsk-receiver.js
// FSK 受信の窓口。AudioWorklet(fsk-processor.js)の読み込み・マイク接続・結果の受け取りを担当する。
// 使い方:
//   import { FskReceiver } from './fsk-receiver.js';
//   const rx = new FskReceiver({ baud: 100, freq0: 1200, freq1: 2200,
//                                onText: s => { ... } });
//   button.onclick = () => rx.start();   // ユーザー操作の中で呼ぶこと (iOS Safari の制約)
//   rx.stop();

export class FskReceiver {
  /**
   * @param {object} opts
   * @param {number} [opts.baud=100]        ボーレート
   * @param {number} [opts.freq0=1200]      "0" のトーン(Hz)
   * @param {number} [opts.freq1=2200]      "1" のトーン(Hz)
   * @param {number} [opts.threshold=0.01]  信号ありとみなす最小振幅 (0〜1)
   * @param {string|URL} [opts.workletUrl]  fsk-processor.js の場所 (省略時はこのファイルと同じ場所)
   * @param {(byte:number)=>void} [opts.onByte]         1バイト受信ごと
   * @param {(text:string)=>void} [opts.onText]         UTF-8 として復号できた文字列
   * @param {(tone:number, level:number)=>void} [opts.onTone]  約50msごと。tone: 0 / 1 / -1(無音)
   * @param {(count:number)=>void} [opts.onFrameError]  フレームエラーの累計数
   */
  constructor(opts = {}) {
    const { onByte, onText, onTone, onFrameError, workletUrl, ...cfg } = opts;
    this.cfg = { baud: 100, freq0: 1200, freq1: 2200, threshold: 0.01, ...cfg };
    this.workletUrl = workletUrl || new URL('./fsk-processor.js', import.meta.url);
    this.onByte = onByte;
    this.onText = onText;
    this.onTone = onTone;
    this.onFrameError = onFrameError;

    this.audioCtx = null;
    this.stream = null;
    this.node = null;
    this.decoder = null;
  }

  get running() { return this.audioCtx !== null; }
  get sampleRate() { return this.audioCtx ? this.audioCtx.sampleRate : 0; }

  async start() {
    if (this.audioCtx) return;

    // iOS Safari: AudioContext の作成/resume とマイク要求は、ユーザー操作の同期部分で開始する
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const resumed = ctx.resume();
    const streamPromise = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });

    let stream = null;
    try {
      [stream] = await Promise.all([streamPromise, resumed]);
      await ctx.audioWorklet.addModule(this.workletUrl);

      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'fsk-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          baud: this.cfg.baud,
          freq0: this.cfg.freq0,
          freq1: this.cfg.freq1,
          threshold: this.cfg.threshold
        }
      });

      this.decoder = new TextDecoder('utf-8');
      node.port.onmessage = (e) => this._handle(e.data);

      source.connect(node);
      node.connect(ctx.destination); // 出力は無音。Safari で処理を駆動するために接続する

      this.audioCtx = ctx;
      this.stream = stream;
      this.node = node;
    } catch (err) {
      if (stream) stream.getTracks().forEach(t => t.stop());
      ctx.close();
      throw err;
    }
  }

  async stop() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.node) { this.node.port.onmessage = null; this.node.disconnect(); }
    if (this.audioCtx) await this.audioCtx.close();
    this.stream = null;
    this.node = null;
    this.audioCtx = null;
    this.decoder = null;
  }

  setThreshold(value) {
    this.cfg.threshold = value;
    if (this.node) this.node.port.postMessage({ type: 'threshold', value });
  }

  _handle(m) {
    if (m.type === 'byte') {
      if (this.onByte) this.onByte(m.value);
      if (this.onText && this.decoder) {
        const s = this.decoder.decode(new Uint8Array([m.value]), { stream: true });
        if (s) this.onText(s);
      }
    } else if (m.type === 'tone') {
      if (this.onTone) this.onTone(m.tone, m.level);
    } else if (m.type === 'frameError') {
      if (this.onFrameError) this.onFrameError(m.count);
    }
  }
}
