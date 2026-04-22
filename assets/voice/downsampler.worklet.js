class Downsampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.inputRate = sampleRate;
    this.ratio = this.inputRate / this.targetRate;
    this.buffer = [];
    this.chunkSize = 320;
  }

  process(inputs) {
    const input = inputs[0][0];
    if (!input) return true;

    let i = 0;
    while (i < input.length) {
      const idx = Math.floor(i);
      this.buffer.push(input[idx]);
      i += this.ratio;
    }

    while (this.buffer.length >= this.chunkSize) {
      const chunk = this.buffer.splice(0, this.chunkSize);
      const pcm = new Int16Array(chunk.length);
      for (let j = 0; j < chunk.length; j += 1) {
        const s = Math.max(-1, Math.min(1, chunk[j]));
        pcm[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}

registerProcessor('downsampler', Downsampler);
