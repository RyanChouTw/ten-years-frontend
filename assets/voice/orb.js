export function createOrb(el) {
  let state = 'idle';
  function setState(s) { state = s; el.dataset.orbState = s; }
  function setIntensity(v) {
    const clamped = Math.min(1, Math.max(0, v));
    const scale = 0.9 + clamped * 0.35;
    const op = 0.5 + clamped * 0.5;
    el.style.transform = `scale(${scale})`;
    el.style.opacity = op;
  }
  setState('idle');
  setIntensity(0);
  return { setState, setIntensity, get state() { return state; } };
}
