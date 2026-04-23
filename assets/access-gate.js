const LS_KEY = 'ten_years_access_code';

export function getAccessCode() {
  // URL param wins so a `?k=xxx` link can be shared with friends.
  const params = new URLSearchParams(location.search);
  const urlCode = params.get('k');
  if (urlCode) {
    localStorage.setItem(LS_KEY, urlCode);
    return urlCode;
  }
  return localStorage.getItem(LS_KEY) || null;
}

export function setAccessCode(code) {
  localStorage.setItem(LS_KEY, code);
}

export function clearAccessCode() {
  localStorage.removeItem(LS_KEY);
}

export function withAccessQuery(urlStr) {
  const code = getAccessCode();
  if (!code) return urlStr;
  const sep = urlStr.includes('?') ? '&' : '?';
  return `${urlStr}${sep}k=${encodeURIComponent(code)}`;
}

export function withAccessHeader(init = {}, sessionId) {
  const code = getAccessCode();
  const headers = { ...(init.headers || {}) };
  if (code) headers['X-Access-Code'] = code;
  if (sessionId) headers['X-Session-Id'] = sessionId;
  return { ...init, headers };
}

export function newSessionId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

const CONSENT_KEY = 'ten_years_privacy_agreed';
const CONSENT_VERSION = '2026-04-23'; // bump this when the policy changes to force reconsent

export function hasConsent() {
  return localStorage.getItem(CONSENT_KEY) === CONSENT_VERSION;
}

export function requestConsent() {
  return new Promise((resolve) => {
    const el = document.getElementById('privacyConsent');
    const accept = document.getElementById('privacyAcceptBtn');
    const cancel = document.getElementById('privacyCancelBtn');
    if (!el || !accept || !cancel) { resolve(true); return; }
    el.hidden = false;
    const cleanup = () => {
      el.hidden = true;
      accept.onclick = null;
      cancel.onclick = null;
    };
    accept.onclick = () => {
      localStorage.setItem(CONSENT_KEY, CONSENT_VERSION);
      cleanup();
      resolve(true);
    };
    cancel.onclick = () => { cleanup(); resolve(false); };
  });
}

export async function ensureConsent() {
  if (hasConsent()) return true;
  return requestConsent();
}

function showGate() {
  return new Promise((resolve) => {
    const gateEl = document.getElementById('accessGate');
    const inputEl = document.getElementById('accessGateInput');
    const btnEl = document.getElementById('accessGateBtn');
    const errEl = document.getElementById('accessGateErr');
    if (!gateEl || !inputEl || !btnEl) { resolve(null); return; }
    gateEl.hidden = false;
    inputEl.value = '';
    if (errEl) errEl.textContent = '';
    setTimeout(() => inputEl.focus(), 50);
    const handle = () => {
      const code = inputEl.value.trim();
      if (!code) { if (errEl) errEl.textContent = '請輸入通行碼'; return; }
      setAccessCode(code);
      gateEl.hidden = true;
      resolve(code);
    };
    btnEl.onclick = handle;
    inputEl.onkeydown = (e) => { if (e.key === 'Enter') handle(); };
  });
}

export async function ensureAccessCode() {
  const existing = getAccessCode();
  if (existing) return existing;
  return showGate();
}

export async function reprompt(message) {
  clearAccessCode();
  const errEl = document.getElementById('accessGateErr');
  if (errEl && message) errEl.textContent = message;
  return showGate();
}
