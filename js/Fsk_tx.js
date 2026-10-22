// fsk_tx.js - iPad(Web Audio)からマイコンへFSKでバイト列を送信する
// 仕様: 500bps / "0"=1200Hz / "1"=2200Hz
// フレーム: スタートビット0 + データ8bit(LSBファースト) + ストップビット1
// アイドル(データなし)は"1"(2200Hz)。バイト間に gapMs のアイドルを入れる。
(function (global) {
  'use strict';

  const DEFAULTS = {
    baud: 500,
    f0: 1200,      // "0"
    f1: 2200,      // "1"
    gapMs: 10,     // バイト間のアイドル(2200Hz)
    leadMs: 50,    // 送信開始前のアイドル(受信側の立ち上がり待ち)
    tailMs: 20,    // 送信終了後のアイドル
    volume: 0.8,   // 0〜1
    fadeMs: 1      // 先頭と末尾のクリックノイズ対策
  };

  // 波形生成(純粋関数)。連続位相FSKで、ビット境界は累積時間から丸めるので
  // 44.1kHzのように1ビットが整数サンプルにならない場合でもボーレートがずれない。
  function render(bytes, sampleRate, options) {
    const o = Object.assign({}, DEFAULTS, options);
    const bitSec = 1 / o.baud;

    // セグメント列: [周波数, 長さ(秒)]
    const segs = [];
    segs.push([o.f1, o.leadMs / 1000]);
    for (const b of bytes) {
      const v = b & 0xFF;
      segs.push([o.f0, bitSec]);                       // スタートビット
      for (let i = 0; i < 8; i++) {
        segs.push([(v >> i) & 1 ? o.f1 : o.f0, bitSec]); // LSBファースト
      }
      segs.push([o.f1, bitSec]);                       // ストップビット
      segs.push([o.f1, o.gapMs / 1000]);               // バイト間アイドル
    }
    segs.push([o.f1, o.tailMs / 1000]);

    let total = 0;
    for (const s of segs) total += s[1];
    const n = Math.round(total * sampleRate);
    const out = new Float32Array(n);

    let phase = 0, t = 0, pos = 0;
    for (const [freq, dur] of segs) {
      t += dur;
      const end = Math.min(n, Math.round(t * sampleRate));
      const dphi = 2 * Math.PI * freq / sampleRate;
      for (; pos < end; pos++) {
        out[pos] = Math.sin(phase) * o.volume;
        phase += dphi;
        if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
      }
    }

    const fade = Math.min(Math.round(o.fadeMs / 1000 * sampleRate), n >> 1);
    for (let i = 0; i < fade; i++) {
      const g = i / fade;
      out[i] *= g;
      out[n - 1 - i] *= g;
    }
    return out;
  }

  class FskTx {
    constructor(options) {
      this.options = Object.assign({}, DEFAULTS, options);
      this.ctx = null;
      this.nextTime = 0;
    }

    // iOSでは、ユーザー操作(ボタンのタップ)の中で一度呼ぶ必要がある
    async init() {
      if (!this.ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        this.ctx = new AC();
      }
      if (this.ctx.state !== 'running') await this.ctx.resume();
    }

    // bytes: 数値 / 配列 / Uint8Array。連続して呼ぶと途切れず順番に再生される。
    // 再生が終わったら解決するPromiseを返す。
    async send(bytes) {
      await this.init();
      if (typeof bytes === 'number') bytes = [bytes];
      const data = render(bytes, this.ctx.sampleRate, this.options);
      const buf = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
      buf.copyToChannel(data, 0);

      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);

      const start = Math.max(this.ctx.currentTime + 0.02, this.nextTime);
      this.nextTime = start + buf.duration;
      return new Promise(resolve => {
        src.onended = resolve;
        src.start(start);
      });
    }
  }

  const api = { FskTx, render, DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.FskTx = FskTx, global.FskTxRender = render;
})(typeof window !== 'undefined' ? window : globalThis);