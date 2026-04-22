const API_BASE = (() => {
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.')) {
    return 'http://localhost:3001';
  }
  return 'https://api.hypertec.tw';
})();

const WS_BASE = API_BASE.replace(/^http/, 'ws');

const $ = (sel) => document.querySelector(sel);
const screens = () => document.querySelectorAll('.screen');

function showScreen(name) {
  for (const el of screens()) {
    el.hidden = el.dataset.screen !== name;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setLoader(on) { $('#loader').hidden = !on; }

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

const ctx = { apiBase: API_BASE, wsBase: WS_BASE, showScreen, setLoader, toast };

$('#modeTextBtn')?.addEventListener('click', async () => {
  const { startTextMode } = await import('./modes/text-mode.js');
  startTextMode(ctx);
});

$('#modeVoiceBtn')?.addEventListener('click', async () => {
  const { startVoiceMode } = await import('./modes/voice-mode.js');
  startVoiceMode(ctx);
});

$('#startBtn').addEventListener('click', () => {
  showScreen('mode-select');
});
