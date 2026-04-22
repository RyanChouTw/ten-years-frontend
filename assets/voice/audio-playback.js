export function createPlayer({ onVolume }) {
  const ctx = new AudioContext({ sampleRate: 24000 });
  let nextStart = ctx.currentTime;
  let queued = [];
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.connect(ctx.destination);

  const analyserData = new Uint8Array(analyser.frequencyBinCount);
  let running = true;
  (function tick() {
    if (!running) return;
    analyser.getByteFrequencyData(analyserData);
    let sum = 0;
    for (let i = 0; i < analyserData.length; i += 1) sum += analyserData[i];
    onVolume(sum / analyserData.length / 255);
    requestAnimationFrame(tick);
  })();

  function enqueue(base64Pcm24k) {
    const bin = atob(base64Pcm24k);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i += 1) float32[i] = int16[i] / 32768;

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);
    const startAt = Math.max(ctx.currentTime, nextStart);
    source.start(startAt);
    nextStart = startAt + buffer.duration;
    queued.push(source);
    source.onended = () => {
      queued = queued.filter((s) => s !== source);
    };
  }

  function flush() {
    for (const s of queued) { try { s.stop(); } catch {} }
    queued = [];
    nextStart = ctx.currentTime;
  }

  return {
    enqueue,
    flush,
    close() {
      running = false;
      flush();
      ctx.close();
    },
    isPlaying() { return queued.length > 0; },
    msUntilIdle() {
      return Math.max(0, (nextStart - ctx.currentTime) * 1000);
    },
  };
}
