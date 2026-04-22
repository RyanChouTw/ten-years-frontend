import { startCapture } from '../voice/audio-capture.js';
import { createPlayer } from '../voice/audio-playback.js';
import { createOrb } from '../voice/orb.js';
import { openWs } from '../voice/ws-client.js';

const AGE_MIN = 15, AGE_MAX = 80;

export function startVoiceMode(ctx) {
  const { apiBase, wsBase, showScreen, setLoader, toast } = ctx;

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

    document.getElementById('voiceQuizDoneBtn').onclick = () => {
      ws.send({ type: 'finalize_profile' });
      orb.setState('thinking');
      setLoader(true);
    };

    state.readerIo = io;
  }

  function handleReaderMsg(msg, io) {
    const { orb, player, ws, capture } = io;
    if (msg.type === 'ready') {
      orb.setState('listening');
    } else if (msg.type === 'audio') {
      if (orb.state !== 'speaking') orb.setState('speaking');
      player.enqueue(msg.data);
    } else if (msg.type === 'turn_end') {
      orb.setState('listening');
      if (state.profile && !state.summonReady) {
        state.summonReady = true;
        const btn = document.getElementById('voiceSummonBtn');
        if (btn) btn.hidden = false;
      }
    } else if (msg.type === 'profile') {
      setLoader(false);
      state.profile = msg.profile;
      capture.stop();
      transitionToMonologueScreen(io);
    } else if (msg.type === 'error') {
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
          if (orb.state === 'speaking' && v > 0.15) {
            player.flush();
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
          player.enqueue(msg.data);
        }
        else if (msg.type === 'turn_end') {
          orb.setState('listening');
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
