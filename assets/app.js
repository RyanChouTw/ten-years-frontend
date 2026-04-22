// API base: localhost in dev, api.hypertec.tw in prod
const API_BASE = (() => {
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.')) {
    return 'http://localhost:3001';
  }
  return 'https://api.hypertec.tw';
})();

const MIRROR_MAX_TURNS = 15;

// ---------- State ----------
const state = {
  quizHistory: [],        // [{role, content}]
  profile: null,
  monologue: '',
  mirrorHistory: [],      // [{role, content}]
  mirrorTurn: 0,
  letter: '',
};

// ---------- DOM helpers ----------
const $ = (sel) => document.querySelector(sel);
const screens = {
  intro: $('[data-screen=intro]'),
  quiz: $('[data-screen=quiz]'),
  monologue: $('[data-screen=monologue]'),
  mirror: $('[data-screen=mirror]'),
  letter: $('[data-screen=letter]'),
};

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.hidden = key !== name;
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

async function api(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Network error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------- Flow: Intro → Quiz ----------
$('#startBtn').addEventListener('click', async () => {
  setLoader(true);
  try {
    const data = await api('/ten-years/quiz/next', { history: [] });
    state.quizHistory = [{ role: 'assistant', content: data.question }];
    renderQuiz(data.question, 0);
    showScreen('quiz');
  } catch (e) {
    toast(e.message);
  } finally {
    setLoader(false);
  }
});

// ---------- Quiz ----------
function renderQuiz(question, turnAnswered) {
  $('#quizQuestion').textContent = question;
  $('#quizAnswer').value = '';
  $('#quizAnswer').focus();
  const pct = Math.min(85, Math.round((turnAnswered / 11) * 85));
  $('#quizFill').style.width = pct + '%';
  $('#quizValue').textContent = pct + '%';
}

$('#quizForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const answer = $('#quizAnswer').value.trim();
  if (!answer) return;
  setLoader(true);
  try {
    state.quizHistory.push({ role: 'user', content: answer });
    const data = await api('/ten-years/quiz/next', {
      history: state.quizHistory.slice(0, -1),
      answer,
    });
    if (data.done) {
      state.profile = data.profile;
      state.monologue = data.monologue;
      // Fill final confidence
      $('#quizFill').style.width = '95%';
      $('#quizValue').textContent = '95%';
      setTimeout(() => renderMonologue(), 500);
    } else {
      state.quizHistory.push({ role: 'assistant', content: data.question });
      renderQuiz(data.question, data.turn);
    }
  } catch (err) {
    state.quizHistory.pop();   // rollback the user turn on error
    toast(err.message);
  } finally {
    setLoader(false);
  }
});

// ---------- Monologue ----------
function renderMonologue() {
  const el = $('#monologueBody');
  el.textContent = '';
  typewriter(el, state.monologue, 30);
  showScreen('monologue');
}

function typewriter(el, text, speed = 25) {
  let i = 0;
  const tick = () => {
    if (i >= text.length) return;
    el.textContent += text[i];
    i++;
    setTimeout(tick, speed);
  };
  tick();
}

$('#summonBtn').addEventListener('click', async () => {
  setLoader(true);
  try {
    const data = await api('/ten-years/mirror/open', { profile: state.profile });
    state.mirrorHistory = [{ role: 'assistant', content: data.message }];
    state.mirrorTurn = 0;
    renderMirror();
    showScreen('mirror');
  } catch (e) {
    toast(e.message);
  } finally {
    setLoader(false);
  }
});

// ---------- Mirror ----------
function renderMirror() {
  const log = $('#mirrorLog');
  log.innerHTML = '';
  for (const msg of state.mirrorHistory) {
    const el = document.createElement('div');
    el.className = 'msg msg--' + (msg.role === 'user' ? 'user' : 'ai');
    el.textContent = msg.content;
    log.appendChild(el);
  }
  $('#mirrorTurn').textContent = `${state.mirrorTurn} / ${MIRROR_MAX_TURNS}`;
  log.scrollTop = log.scrollHeight;
  $('#mirrorInput').focus();
}

$('#mirrorForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const userMessage = $('#mirrorInput').value.trim();
  if (!userMessage) return;
  if (state.mirrorTurn >= MIRROR_MAX_TURNS) {
    return goToLetter();
  }
  setLoader(true);
  $('#mirrorInput').value = '';
  state.mirrorHistory.push({ role: 'user', content: userMessage });
  renderMirror();
  try {
    const data = await api('/ten-years/mirror/reply', {
      profile: state.profile,
      history: state.mirrorHistory.slice(0, -1),
      userMessage,
    });
    state.mirrorHistory.push({ role: 'assistant', content: data.message });
    state.mirrorTurn = data.turn;
    renderMirror();
    if (state.mirrorTurn >= MIRROR_MAX_TURNS) {
      // Auto-advance to letter after a beat
      setTimeout(goToLetter, 2500);
    }
  } catch (err) {
    state.mirrorHistory.pop();
    toast(err.message);
  } finally {
    setLoader(false);
  }
});

// ---------- Letter ----------
async function goToLetter() {
  setLoader(true);
  try {
    const data = await api('/ten-years/letter', {
      profile: state.profile,
      history: state.mirrorHistory,
    });
    state.letter = data.letter;
    $('#letterBody').textContent = '';
    showScreen('letter');
    typewriter($('#letterBody'), state.letter, 20);
  } catch (e) {
    toast(e.message);
  } finally {
    setLoader(false);
  }
}

$('#letterCopyBtn').addEventListener('click', async () => {
  const text = `${state.letter}\n\n---\n讓強大的科技，走進每個人的日常\nHypertec Studio · hypertec.tw/ten-years`;
  try {
    await navigator.clipboard.writeText(text);
    toast('已複製');
  } catch {
    toast('複製失敗');
  }
});

$('#letterRestartBtn').addEventListener('click', () => {
  location.reload();
});
