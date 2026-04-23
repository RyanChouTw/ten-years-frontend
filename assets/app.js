const API_BASE = (() => {
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.')) {
    return 'http://localhost:3001';
  }
  return 'https://ten-years-api.hypertec.tw';
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

async function gated(fn) {
  const { ensureConsent, ensureAccessCode } = await import('./access-gate.js');
  const agreed = await ensureConsent();
  if (!agreed) return; // user declined privacy → stay on intro
  const code = await ensureAccessCode();
  if (!code) return;
  fn();
}

$('#modeTextBtn')?.addEventListener('click', async () => {
  const { startTextMode } = await import('./modes/text-mode.js');
  startTextMode(ctx);
});

$('#modeVoiceBtn')?.addEventListener('click', async () => {
  const { startVoiceMode } = await import('./modes/voice-mode.js');
  startVoiceMode(ctx);
});

$('#startBtn').addEventListener('click', () => {
  gated(() => showScreen('mode-select'));
});

// Eagerly consume ?k= from the URL so a shared link primes localStorage
// even if the user lingers on the landing screen.
(async () => {
  const { getAccessCode } = await import('./access-gate.js');
  getAccessCode();
})();
