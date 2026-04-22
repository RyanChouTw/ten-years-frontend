export async function startCapture({ onChunk, onVolume }) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const ctx = new AudioContext({ sampleRate: 48000 });
  await ctx.audioWorklet.addModule(new URL('./downsampler.worklet.js', import.meta.url));

  const source = ctx.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(ctx, 'downsampler');
  worklet.port.onmessage = (e) => {
    const int16 = new Int16Array(e.data);
    const bytes = new Uint8Array(int16.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    onChunk(btoa(binary));
  };

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  source.connect(worklet);

  const data = new Uint8Array(analyser.frequencyBinCount);
  let running = true;
  (function tick() {
    if (!running) return;
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) sum += data[i];
    onVolume(sum / data.length / 255);
    requestAnimationFrame(tick);
  })();

  return {
    stop() {
      running = false;
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
    },
  };
}
