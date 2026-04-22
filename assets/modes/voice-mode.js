import { startCapture } from '../voice/audio-capture.js';
import { createPlayer } from '../voice/audio-playback.js';
import { createOrb } from '../voice/orb.js';
import { openWs } from '../voice/ws-client.js';

const AGE_MIN = 15, AGE_MAX = 80;
const ECHO_TAIL_MS = 500;
// Gemini 3.1 Live sends GoAway around 10 minutes into an audio-only session.
// Soft-prompt the user a few minutes before that so they can finalize cleanly.
const READER_SOFT_LIMIT_MS = 7 * 60 * 1000;

export function startVoiceMode(ctx) {
  const { apiBase, wsBase, showScreen, setLoader, toast } = ctx;

  let wakeLock = null;
  async function acquireWakeLock() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch {}
  }
  acquireWakeLock();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !wakeLock) acquireWakeLock();
  });

  const ageSel = document.getElementById('profileAge');
  if (ageSel.options.length <= 1) {
    for (let a = AGE_MIN; a <= AGE_MAX; a += 1) {
      const opt = document.createElement('option');
      opt.value = a; opt.textContent = String(a);
      ageSel.appendChild(opt);
    }
  }

  const state = {
    age: null,
    gender: null,
    profile: null,
    quizTurn: 0,
    mirrorTurn: 0,
    letter: '',
    readerIo: null,
    summonReady: false,
  };

  showScreen('profile');

  document.getElementById('profileForm').onsubmit = (e) => {
    e.preventDefault();
    state.age = Number(document.getElementById('profileAge').value);
    state.gender = document.getElementById('profileGender').value;
    if (!state.age || !state.gender) return;
    runReaderPhase();
  };

  for (const id of ['voiceFallbackBtn1', 'voiceFallbackBtn2']) {
    const el = document.getElementById(id);
    if (el) el.onclick = () => { location.href = location.pathname; };
  }

  async function runReaderPhase() {
    showScreen('voice-quiz');
    const orb = createOrb(document.getElementById('voiceOrb'));
    let capture, player, ws;

    try {
      orb.setState('thinking');
      player = createPlayer({
        onVolume: (v) => { if (orb.state === 'speaking') orb.setIntensity(v); },
      });
      capture = await startCapture({
        onChunk: (b64) => ws?.send({ type: 'audio', data: b64 }),
        onVolume: (v) => { if (orb.state === 'listening') orb.setIntensity(v); },
      });
    } catch (err) {
      toast('需要麥克風才能繼續');
      document.getElementById('voiceFallbackBtn1').style.display = 'inline-block';
      return;
    }

    const url = `${wsBase}/ten-years/voice/reader?age=${state.age}&gender=${encodeURIComponent(state.gender)}`;
    const io = { orb, player, ws: null, capture };
    ws = openWs(url, {
      onOpen: () => {},
      onMessage: (msg) => handleReaderMsg(msg, io),
      onClose: () => {},
      onError: () => toast('連線中斷'),
    });
    io.ws = ws;

    const doneBtn = document.getElementById('voiceQuizDoneBtn');
    const highlightDoneBtn = () => {
      if (!doneBtn) return;
      doneBtn.style.animation = 'pulse 1.6s ease-in-out infinite';
      doneBtn.style.boxShadow = '0 0 18px rgba(255,255,255,0.45)';
    };

    state.readerSoftTimer = setTimeout(() => {
      toast('對話差不多了，可以按「我答完了」繼續');
      highlightDoneBtn();
    }, READER_SOFT_LIMIT_MS);

    state.readerClosedEarly = false;
    doneBtn.onclick = () => {
      clearTimeout(state.readerSoftTimer);
      if (state.readerClosedEarly) {
        toast('對話已中斷，正在以目前內容整理，請稍候');
      }
      ws.send({ type: 'finalize_profile' });
      orb.setState('thinking');
      setLoader(true);
    };

    state.readerIo = io;
    state.readerHighlightDone = highlightDoneBtn;
  }

  function handleReaderMsg(msg, io) {
    const { orb, player, ws, capture } = io;
    if (msg.type === 'ready') {
      orb.setState('listening');
    } else if (msg.type === 'audio') {
      if (orb.state !== 'speaking') orb.setState('speaking');
      capture.setMuted(true);
      player.enqueue(msg.data);
    } else if (msg.type === 'turn_end') {
      const unmuteAt = player.msUntilIdle() + ECHO_TAIL_MS;
      setTimeout(() => {
        orb.setState('listening');
        capture.setMuted(false);
      }, unmuteAt);
      if (state.profile && !state.summonReady) {
        state.summonReady = true;
        const btn = document.getElementById('voiceSummonBtn');
        if (btn) btn.hidden = false;
      }
    } else if (msg.type === 'profile') {
      setLoader(false);
      clearTimeout(state.readerSoftTimer);
      state.profile = msg.profile;
      capture.stop();
      transitionToMonologueScreen(io);
    } else if (msg.type === 'live_closed') {
      // Gemini hit its session duration limit. Mic input is useless now.
      state.readerClosedEarly = true;
      capture?.setMuted(true);
      orb.setState('thinking');
      clearTimeout(state.readerSoftTimer);
      toast('對話時間已到，請按「我答完了」結束這段');
      state.readerHighlightDone?.();
    } else if (msg.type === 'error') {
      setLoader(false);
      toast(msg.message);
    }
  }

  function transitionToMonologueScreen(io) {
    showScreen('voice-monologue');
    const monoOrb = createOrb(document.getElementById('voiceOrbMono'));
    monoOrb.setState('speaking');
    io.player.setVolumeTarget?.((v) => monoOrb.setIntensity(v));
    io.orb = monoOrb;

    document.getElementById('voiceSummonBtn').onclick = () => {
      io.ws.close();
      io.player.close();
      runMirrorPhase();
    };
  }

  async function runMirrorPhase() {
    showScreen('voice-mirror');
    const orb = createOrb(document.getElementById('voiceOrbMirror'));
    const turnLabel = document.getElementById('voiceMirrorTurn');

    let capture, player, ws;
    try {
      player = createPlayer({
        onVolume: (v) => { if (orb.state === 'speaking') orb.setIntensity(v); },
      });
      capture = await startCapture({
        onChunk: (b64) => ws?.send({ type: 'audio', data: b64 }),
        onVolume: (v) => {
          if (orb.state === 'listening') orb.setIntensity(v);
          if (orb.state === 'speaking' && v > 0.15 && capture?.isMuted()) {
            player.flush();
            capture.setMuted(false);
            ws?.send({ type: 'interrupt' });
            orb.setState('listening');
          }
        },
      });
    } catch (err) {
      toast('需要麥克風');
      return;
    }

    const url = `${wsBase}/ten-years/voice/mirror?profile=${encodeURIComponent(JSON.stringify(state.profile))}`;
    ws = openWs(url, {
      onMessage: (msg) => {
        if (msg.type === 'ready') orb.setState('listening');
        else if (msg.type === 'audio') {
          if (orb.state !== 'speaking') orb.setState('speaking');
          capture.setMuted(true);
          player.enqueue(msg.data);
        }
        else if (msg.type === 'turn_end') {
          const unmuteAt = player.msUntilIdle() + ECHO_TAIL_MS;
          setTimeout(() => {
            orb.setState('listening');
            capture.setMuted(false);
          }, unmuteAt);
          ws.send({ type: 'user_turn_end' });
        }
        else if (msg.type === 'user_turn_counted') {
          state.mirrorTurn = msg.turn;
          turnLabel.textContent = `${msg.turn} / 10`;
        }
        else if (msg.type === 'mirror_limit_reached') {
          setTimeout(() => {
            capture.stop(); player.close(); ws.close();
            runLetterPhase();
          }, 2500);
        }
        else if (msg.type === 'error') toast(msg.message);
      },
      onError: () => toast('連線中斷'),
    });
  }

  async function runLetterPhase() {
    showScreen('voice-letter');
    setLoader(true);
    const res = await fetch(`${apiBase}/ten-years/letter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: state.profile, history: [] }),
    }).then((r) => r.json());
    setLoader(false);

    state.letter = res.letter;

    const body = document.getElementById('voiceLetterBody');
    body.textContent = '';
    const paras = state.letter.split(/\n\n+/).filter(Boolean);
    for (let i = 0; i < paras.length; i += 1) {
      setTimeout(() => {
        const p = document.createElement('p');
        p.textContent = paras[i];
        p.style.opacity = 0;
        p.style.transition = 'opacity 1.2s ease';
        body.appendChild(p);
        requestAnimationFrame(() => { p.style.opacity = 1; });
      }, i * 2000);
    }

    setTimeout(() => {
      document.getElementById('voiceLetterCopyBtn').hidden = false;
      document.getElementById('voiceLetterRestartBtn').hidden = false;
    }, paras.length * 2000 + 1500);

    document.getElementById('voiceLetterCopyBtn').onclick = async () => {
      const text = `${state.letter}\n\n---\n讓強大的科技，走進每個人的日常\nHypertec Studio · hypertec.tw/ten-years`;
      try { await navigator.clipboard.writeText(text); toast('已複製'); }
      catch { toast('複製失敗'); }
    };
    document.getElementById('voiceLetterRestartBtn').onclick = () => location.reload();
  }
}
