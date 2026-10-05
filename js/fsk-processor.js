// fsk-processor.js
// AudioWorklet 側(音声スレッド)で動く FSK + UART 復調処理。
// DOM には触れず、結果は port.postMessage でメインスレッドへ送る。
//   { type: 'byte', value }         ... 1バイト受信
//   { type: 'frameError', count }   ... ストップビット異常
//   { type: 'tone', tone, level }   ... 約50msごとの状態 (tone: 0 / 1 / -1=無音)

class FskProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { baud, freq0, freq1, threshold } = options.processorOptions;
    this.threshold = threshold;

    // sampleRate は AudioWorkletGlobalScope のグローバル変数
    this.spb = sampleRate / baud;                          // 1ビットのサンプル数
    this.W = Math.max(8, Math.round(this.spb / 2));        // 判定窓 (約1/2ビット)
    this.STEP = Math.max(1, Math.round(this.spb / 16));    // 判定間隔 (約1/16ビット)
    this.tab0 = this.makeTable(freq0);
    this.tab1 = this.makeTable(freq1);

    let size = 1;
    while (size < this.W * 2) size <<= 1;
    this.ring = new Float32Array(size);
    this.mask = size - 1;
    this.n = 0; // 受信済み総サンプル数

    // UART 状態
    this.state = 0;        // 0=IDLE, 1=RECV
    this.armed = false;    // アイドル("1")を確認済みか
    this.edgeN = 0;        // スタートビットのエッジ推定位置
    this.bitIndex = 0;     // 0=start, 1..8=data, 9=stop
    this.nextCheckN = 0;
    this.byte = 0;
    this.errCount = 0;

    this.lastTone = -1;
    this.lastAmp = 0;
    this.nextReport = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'threshold') this.threshold = e.data.value;
    };
  }

  makeTable(freq) {
    const c = new Float32Array(this.W);
    const s = new Float32Array(this.W);
    for (let i = 0; i < this.W; i++) {
      const ph = 2 * Math.PI * freq * i / sampleRate;
      c[i] = Math.cos(ph);
      s[i] = Math.sin(ph);
    }
    return { c, s };
  }

  // 直近 W サンプルと参照波の相関から振幅を推定
  amplitude(tab) {
    let I = 0, Q = 0;
    let idx = (this.n - this.W) & this.mask;
    for (let i = 0; i < this.W; i++) {
      const v = this.ring[idx];
      I += v * tab.c[i];
      Q += v * tab.s[i];
      idx = (idx + 1) & this.mask;
    }
    return Math.sqrt(I * I + Q * Q) * 2 / this.W;
  }

  // 0 / 1 / -1(信号なし)
  detect() {
    const a0 = this.amplitude(this.tab0);
    const a1 = this.amplitude(this.tab1);
    this.lastAmp = Math.max(a0, a1);
    if (this.lastAmp < this.threshold) return -1;
    return a1 > a0 ? 1 : 0;
  }

  step(d) {
    const n = this.n, W = this.W, spb = this.spb;

    if (this.state === 0) {
      if (d === 1) {
        this.armed = true;
      } else if (d === -1) {
        this.armed = false;
      } else if (this.armed) {
        // 1→0 を検出。判定は窓の中心がエッジを通過した時点で反転する
        this.edgeN = n - W / 2;
        this.bitIndex = 0;
        this.byte = 0;
        this.state = 1;
        this.nextCheckN = this.edgeN + 0.5 * spb + W / 2;
      }
      return;
    }

    if (n < this.nextCheckN) return;

    if (this.bitIndex === 0) {
      if (d !== 0) { this.state = 0; this.armed = (d === 1); return; }
    } else if (this.bitIndex <= 8) {
      if (d === -1) { this.state = 0; this.armed = false; return; }
      if (d === 1) this.byte |= (1 << (this.bitIndex - 1));
    } else {
      if (d === 1) {
        this.port.postMessage({ type: 'byte', value: this.byte });
        this.armed = true;
      } else {
        this.errCount++;
        this.port.postMessage({ type: 'frameError', count: this.errCount });
        this.armed = false;
      }
      this.state = 0;
      return;
    }
    this.bitIndex++;
    this.nextCheckN = this.edgeN + (this.bitIndex + 0.5) * spb + W / 2;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;

    for (let i = 0; i < ch.length; i++) {
      this.ring[this.n & this.mask] = ch[i];
      this.n++;
      if (this.n >= this.W && this.n % this.STEP === 0) {
        const d = this.detect();
        this.lastTone = d;
        this.step(d);
      }
    }

    if (this.n >= this.nextReport) {
      this.nextReport = this.n + sampleRate / 20;
      this.port.postMessage({ type: 'tone', tone: this.lastTone, level: this.lastAmp });
    }
    return true;
  }
}

registerProcessor('fsk-processor', FskProcessor);
