const LS_KEY = 'ten_years_access_code';
const CONSENT_KEY = 'ten_years_privacy_agreed';
const CONSENT_VERSION = '2026-04-23';

export function getAccessCode() {
  return localStorage.getItem(LS_KEY) || null;
}

export function clearAccessCode() {
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(CONSENT_KEY);
}

function urlCode() {
  return new URLSearchParams(location.search).get('k') || '';
}

function hasConsent() {
  return localStorage.getItem(CONSENT_KEY) === CONSENT_VERSION;
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

async function verifyCode(apiBase, code) {
  try {
    const r = await fetch(`${apiBase}/verify`, { headers: { 'X-Access-Code': code } });
    return r.ok;
  } catch {
    return false;
  }
}

function showGate({ apiBase, prefill = '', initialError = '' } = {}) {
  return new Promise((resolve) => {
    const gateEl = document.getElementById('accessGate');
    const inputEl = document.getElementById('accessGateInput');
    const btnEl = document.getElementById('accessGateBtn');
    const cancelEl = document.getElementById('accessGateCancel');
    const errEl = document.getElementById('accessGateErr');
    if (!gateEl || !inputEl || !btnEl) { resolve(null); return; }
    gateEl.hidden = false;
    inputEl.value = prefill;
    if (errEl) errEl.textContent = initialError;
    setTimeout(() => inputEl.focus(), 50);
    const cleanup = (result) => {
      gateEl.hidden = true;
      btnEl.onclick = null;
      inputEl.onkeydown = null;
      if (cancelEl) cancelEl.onclick = null;
      resolve(result);
    };
    const submit = async () => {
      const code = inputEl.value.trim();
      if (!code) { if (errEl) errEl.textContent = '請輸入通行碼'; return; }
      btnEl.disabled = true;
      if (errEl) errEl.textContent = '驗證中…';
      const ok = await verifyCode(apiBase, code);
      btnEl.disabled = false;
      if (ok) {
        localStorage.setItem(LS_KEY, code);
        localStorage.setItem(CONSENT_KEY, CONSENT_VERSION);
        cleanup(code);
      } else {
        if (errEl) errEl.textContent = '通行碼錯誤，請再確認';
      }
    };
    btnEl.onclick = submit;
    inputEl.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    if (cancelEl) cancelEl.onclick = () => cleanup(null);
  });
}

// Returns a valid stored code, or null if user cancels / fails to enter one.
// Shows the combined gate (passcode + consent-via-submit) when needed.
export async function ensureValidAccess({ apiBase }) {
  if (hasConsent() && getAccessCode()) return getAccessCode();
  return showGate({ apiBase, prefill: urlCode() });
}

// Called by fetch/WS handlers when an API call comes back 401: the stored code
// was valid once but has been rotated or revoked. Clear everything and
// re-gate with a message.
export async function reprompt(apiBase, message) {
  clearAccessCode();
  return showGate({ apiBase, initialError: message || '' });
}
