/**
 * X407 Voice Engine — Text-to-Speech
 * Supports two engines:
 *   1. Browser (Web Speech API) — free, instant, offline
 *   2. ElevenLabs — premium AI voices via Cloudflare Worker proxy
 * Provides transport controls, voice selection, speed control, waveform visualizer.
 */
(() => {
  'use strict';

  /* ─── Configuration ─── */
  const WORKER_URL = 'https://x407-ai-proxy.kevanbtc.workers.dev';

  /* ─── State ─── */
  const synth = window.speechSynthesis;
  let browserVoices = [];
  let elevenVoices = [];
  let currentUtterance = null;
  let queue = [];
  let queueIndex = 0;
  let isPaused = false;
  let isSpeaking = false;
  let currentSectionId = null;
  let audioElement = null; // For ElevenLabs playback
  let currentEngine = 'browser'; // 'browser' | 'elevenlabs'

  /* ─── Preferences (persisted in localStorage) ─── */
  const PREF_KEY = 'x407_voice_prefs';
  const defaults = { voiceURI: '', rate: 1.0, engine: 'browser', elevenVoiceId: '' };
  function loadPrefs() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREF_KEY)) }; }
    catch { return { ...defaults }; }
  }
  function savePrefs(p) { localStorage.setItem(PREF_KEY, JSON.stringify(p)); }
  let prefs = loadPrefs();
  currentEngine = prefs.engine || 'browser';

  /* ─── Voice Loading — Browser ─── */
  function loadBrowserVoices() {
    browserVoices = synth.getVoices().filter(v => v.lang.startsWith('en'));
    updateVoiceSelect();
  }
  if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadBrowserVoices;
  setTimeout(loadBrowserVoices, 200);

  /* ─── Voice Loading — ElevenLabs ─── */
  async function loadElevenVoices() {
    try {
      const res = await fetch(`${WORKER_URL}/voices`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        elevenVoices = data.voices || [];
      }
    } catch (err) {
      console.warn('ElevenLabs voices unavailable:', err.message);
      elevenVoices = [];
    }
    updateVoiceSelect();
  }

  function updateVoiceSelect() {
    const sel = document.getElementById('x407-voice-select');
    if (!sel) return;
    sel.innerHTML = '';
    if (currentEngine === 'browser') {
      browserVoices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = `${v.name} (${v.lang})`;
        if (v.voiceURI === prefs.voiceURI || (!prefs.voiceURI && v.default)) opt.selected = true;
        sel.appendChild(opt);
      });
    } else {
      if (elevenVoices.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Loading voices…';
        sel.appendChild(opt);
        return;
      }
      elevenVoices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.voice_id;
        opt.textContent = `${v.name} (${v.category || 'AI'})`;
        if (v.voice_id === prefs.elevenVoiceId) opt.selected = true;
        sel.appendChild(opt);
      });
    }
  }

  /* ─── Section Content Extraction ─── */
  const SECTION_MAP = [
    { id: 'hero',           label: 'Hero',           selector: '.hero' },
    { id: 'positioning',    label: 'Positioning',    selector: '#positioning' },
    { id: 'architecture',   label: 'Architecture',   selector: '#architecture' },
    { id: 'infrastructure', label: 'Infrastructure', selector: '#infrastructure' },
    { id: 'execution',      label: 'Execution',      selector: '#execution' },
    { id: 'growth',         label: 'Growth',         selector: '#growth' },
    { id: 'insights',       label: 'Insights',       selector: '#insights' },
    { id: 'docs',           label: 'Docs',           selector: '#docs' },
  ];

  function extractText(el) {
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('script, style, pre.mermaid, .x407-section-listen').forEach(n => n.remove());
    let text = clone.innerText || clone.textContent || '';
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }

  function getSectionText(sectionId) {
    const sec = SECTION_MAP.find(s => s.id === sectionId);
    if (!sec) return '';
    const el = document.querySelector(sec.selector);
    return extractText(el);
  }

  function getAllText() {
    if (isMainPage()) {
      return SECTION_MAP.map(s => {
        const el = document.querySelector(s.selector);
        const text = extractText(el);
        return text ? `${s.label} section. ${text}` : '';
      }).filter(Boolean).join('. Next section. ');
    }
    const main = document.querySelector('main') || document.querySelector('article') || document.querySelector('.container');
    return main ? extractText(main) : extractText(document.body);
  }

  function isMainPage() {
    return !!document.querySelector('.hero');
  }

  /* ─── Speak Engine — Browser (Web Speech API) ─── */
  function speakBrowser(text, label, onEnd) {
    synth.cancel();

    // Split long text into chunks
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks = [];
    let current = '';
    for (const s of sentences) {
      if ((current + s).length > 400) {
        if (current) chunks.push(current.trim());
        current = s;
      } else {
        current += s;
      }
    }
    if (current.trim()) chunks.push(current.trim());

    queue = chunks;
    queueIndex = 0;
    isSpeaking = true;
    isPaused = false;

    updateUI(label || 'Content');
    speakNextBrowser(onEnd);
  }

  function speakNextBrowser(onEnd) {
    if (queueIndex >= queue.length) {
      isSpeaking = false;
      currentUtterance = null;
      updateUI(null);
      updateWaveform(false);
      if (onEnd) onEnd();
      return;
    }

    const utter = new SpeechSynthesisUtterance(queue[queueIndex]);
    const selectedVoice = browserVoices.find(v => v.voiceURI === prefs.voiceURI);
    if (selectedVoice) utter.voice = selectedVoice;
    utter.rate = prefs.rate;
    utter.pitch = 1;

    utter.onstart = () => updateWaveform(true);
    utter.onend = () => { queueIndex++; speakNextBrowser(onEnd); };
    utter.onerror = (e) => {
      if (e.error !== 'canceled') console.warn('X407 Voice error:', e.error);
      isSpeaking = false; updateWaveform(false);
    };

    currentUtterance = utter;
    synth.speak(utter);
  }

  /* ─── Speak Engine — ElevenLabs ─── */
  async function speakElevenLabs(text, label, onEnd) {
    stopAudio();

    // ElevenLabs has ~5000 char limit; handle long text by chunking
    const maxLen = 4500;
    const chunks = [];
    if (text.length <= maxLen) {
      chunks.push(text);
    } else {
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      let current = '';
      for (const s of sentences) {
        if ((current + s).length > maxLen) {
          if (current) chunks.push(current.trim());
          current = s;
        } else {
          current += s;
        }
      }
      if (current.trim()) chunks.push(current.trim());
    }

    queue = chunks;
    queueIndex = 0;
    isSpeaking = true;
    isPaused = false;

    updateUI(label ? `${label} ⚡` : 'Content ⚡');
    await speakNextElevenLabs(onEnd);
  }

  async function speakNextElevenLabs(onEnd) {
    if (queueIndex >= queue.length) {
      isSpeaking = false;
      updateUI(null);
      updateWaveform(false);
      if (onEnd) onEnd();
      return;
    }

    updateWaveform(true);

    try {
      const res = await fetch(`${WORKER_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: queue[queueIndex],
          voice_id: prefs.elevenVoiceId || undefined,
        }),
      });

      if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      audioElement = new Audio(url);
      audioElement.playbackRate = prefs.rate;

      audioElement.onended = () => {
        URL.revokeObjectURL(url);
        queueIndex++;
        speakNextElevenLabs(onEnd);
      };

      audioElement.onerror = (e) => {
        console.warn('ElevenLabs audio error:', e);
        URL.revokeObjectURL(url);
        isSpeaking = false;
        updateWaveform(false);
      };

      await audioElement.play();
    } catch (err) {
      console.warn('ElevenLabs TTS failed, falling back to browser:', err.message);
      // Fall back to browser TTS for this session
      currentEngine = 'browser';
      updateEngineToggle();
      speakBrowser(queue.slice(queueIndex).join(' '), 'Content (fallback)', onEnd);
    }
  }

  function stopAudio() {
    if (audioElement) {
      audioElement.pause();
      audioElement.src = '';
      audioElement = null;
    }
  }

  /* ─── Unified Speak / Transport ─── */
  function speak(text, label, onEnd) {
    stop();
    if (currentEngine === 'elevenlabs') {
      speakElevenLabs(text, label, onEnd);
    } else {
      speakBrowser(text, label, onEnd);
    }
  }

  function pause() {
    if (currentEngine === 'elevenlabs' && audioElement) {
      audioElement.pause();
      isPaused = true;
      updateWaveform(false);
      updatePlayButton();
    } else if (synth.speaking && !synth.paused) {
      synth.pause();
      isPaused = true;
      updateWaveform(false);
      updatePlayButton();
    }
  }

  function resume() {
    if (currentEngine === 'elevenlabs' && audioElement && isPaused) {
      audioElement.play();
      isPaused = false;
      updateWaveform(true);
      updatePlayButton();
    } else if (synth.paused) {
      synth.resume();
      isPaused = false;
      updateWaveform(true);
      updatePlayButton();
    }
  }

  function stop() {
    synth.cancel();
    stopAudio();
    queue = [];
    queueIndex = 0;
    isPaused = false;
    isSpeaking = false;
    currentUtterance = null;
    currentSectionId = null;
    updateWaveform(false);
    updateUI(null);
    clearSectionHighlights();
  }

  function skipBack() {
    if (queueIndex > 0) {
      if (currentEngine === 'elevenlabs') {
        stopAudio();
      } else {
        synth.cancel();
      }
      queueIndex = Math.max(0, queueIndex - 1);
      if (currentEngine === 'elevenlabs') speakNextElevenLabs();
      else speakNextBrowser();
    }
  }

  function skipForward() {
    if (queueIndex < queue.length - 1) {
      if (currentEngine === 'elevenlabs') {
        stopAudio();
      } else {
        synth.cancel();
      }
      queueIndex = Math.min(queue.length - 1, queueIndex + 1);
      if (currentEngine === 'elevenlabs') speakNextElevenLabs();
      else speakNextBrowser();
    }
  }

  /* ─── UI Updates ─── */
  function updateUI(label) {
    const nowReading = document.querySelector('.x407-now-reading');
    if (nowReading) {
      nowReading.innerHTML = label
        ? `Now reading: <strong>${label}</strong>`
        : 'Select a section or press play to read all';
    }
    updatePlayButton();
    document.querySelectorAll('.x407-section-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === currentSectionId);
    });
  }

  function updatePlayButton() {
    const btn = document.querySelector('.x407-play-btn');
    if (!btn) return;
    if (isSpeaking && !isPaused) {
      btn.innerHTML = '⏸'; btn.title = 'Pause';
    } else {
      btn.innerHTML = '▶'; btn.title = 'Play';
    }
  }

  function updateWaveform(active) {
    const wf = document.querySelector('.x407-waveform');
    if (!wf) return;
    if (active) {
      wf.classList.remove('idle');
      animateWaveform(wf);
    } else {
      wf.classList.add('idle');
    }
  }

  let waveRAF = null;
  function animateWaveform(wf) {
    const bars = wf.querySelectorAll('.bar');
    function frame() {
      if (!isSpeaking || isPaused) return;
      bars.forEach(bar => { bar.style.height = (3 + Math.random() * 18) + 'px'; });
      waveRAF = requestAnimationFrame(frame);
    }
    if (waveRAF) cancelAnimationFrame(waveRAF);
    frame();
  }

  function clearSectionHighlights() {
    document.querySelectorAll('.x407-section-listen.speaking').forEach(btn => {
      btn.classList.remove('speaking');
      btn.textContent = '🔊 Listen';
    });
  }

  function updateEngineToggle() {
    const toggle = document.querySelector('.x407-engine-toggle');
    if (!toggle) return;
    toggle.querySelectorAll('.x407-engine-opt').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.engine === currentEngine);
    });
    updateVoiceSelect();
    // Show/hide speed slider label hint
    const speedLabel = document.querySelector('.x407-speed-hint');
    if (speedLabel) {
      speedLabel.textContent = currentEngine === 'elevenlabs' ? '(playback rate)' : '';
    }
  }

  /* ─── Build UI ─── */
  function buildAudioBar() {
    const bar = document.createElement('div');
    bar.className = 'x407-audio-bar';
    bar.innerHTML = `
      <div class="x407-audio-bar-header">
        <h4><span class="pulse-dot"></span> X407 Voice</h4>
        <button class="x407-audio-close" title="Close">✕</button>
      </div>
      <div class="x407-engine-toggle">
        <button class="x407-engine-opt ${currentEngine === 'browser' ? 'active' : ''}" data-engine="browser" title="Browser TTS (free, offline)">🖥 Browser</button>
        <button class="x407-engine-opt ${currentEngine === 'elevenlabs' ? 'active' : ''}" data-engine="elevenlabs" title="ElevenLabs AI voice (premium)">⚡ ElevenLabs</button>
      </div>
      <div class="x407-now-reading">Select a section or press play to read all</div>
      <div class="x407-waveform idle">${'<span class="bar"></span>'.repeat(28)}</div>
      <div class="x407-transport">
        <button class="x407-skip-back" title="Previous chunk">⏮</button>
        <button class="x407-stop-btn" title="Stop">⏹</button>
        <button class="x407-play-btn play-btn" title="Play">▶</button>
        <button class="x407-skip-fwd" title="Next chunk">⏭</button>
      </div>
      ${isMainPage() ? `<div class="x407-section-nav">
        ${SECTION_MAP.map(s => `<button class="x407-section-btn" data-section="${s.id}">${s.label}</button>`).join('')}
      </div>` : ''}
      <div class="x407-audio-settings">
        <label>Voice <select id="x407-voice-select"></select></label>
        <label>Speed <input type="range" id="x407-speed" min="0.5" max="2" step="0.1" value="${prefs.rate}"> <span class="x407-speed-value">${prefs.rate}×</span> <span class="x407-speed-hint"></span></label>
      </div>
    `;
    document.body.appendChild(bar);

    // Engine toggle
    bar.querySelectorAll('.x407-engine-opt').forEach(opt => {
      opt.onclick = () => {
        stop();
        currentEngine = opt.dataset.engine;
        prefs.engine = currentEngine;
        savePrefs(prefs);
        updateEngineToggle();
        // Load ElevenLabs voices if needed
        if (currentEngine === 'elevenlabs' && elevenVoices.length === 0) {
          loadElevenVoices();
        }
      };
    });

    // Close
    bar.querySelector('.x407-audio-close').onclick = () => toggleAudioBar(false);

    // Transport
    bar.querySelector('.x407-play-btn').onclick = () => {
      if (isSpeaking && !isPaused) {
        pause();
      } else if (isPaused) {
        resume();
      } else {
        currentSectionId = null;
        speak(getAllText(), 'Full Page');
      }
    };

    bar.querySelector('.x407-stop-btn').onclick = stop;
    bar.querySelector('.x407-skip-back').onclick = skipBack;
    bar.querySelector('.x407-skip-fwd').onclick = skipForward;

    // Section buttons
    bar.querySelectorAll('.x407-section-btn').forEach(btn => {
      btn.onclick = () => {
        const sId = btn.dataset.section;
        currentSectionId = sId;
        const sec = SECTION_MAP.find(s => s.id === sId);
        const text = getSectionText(sId);
        if (text) speak(text, sec.label);
      };
    });

    // Voice selector
    const voiceSel = bar.querySelector('#x407-voice-select');
    voiceSel.onchange = () => {
      if (currentEngine === 'browser') {
        prefs.voiceURI = voiceSel.value;
      } else {
        prefs.elevenVoiceId = voiceSel.value;
      }
      savePrefs(prefs);
    };

    // Speed slider
    const speedSlider = bar.querySelector('#x407-speed');
    const speedVal = bar.querySelector('.x407-speed-value');
    speedSlider.oninput = () => {
      prefs.rate = parseFloat(speedSlider.value);
      speedVal.textContent = prefs.rate + '×';
      savePrefs(prefs);
      // Apply to active audio immediately
      if (audioElement) audioElement.playbackRate = prefs.rate;
    };

    loadBrowserVoices();
    // Pre-load ElevenLabs voices if that engine is selected
    if (currentEngine === 'elevenlabs') loadElevenVoices();

    return bar;
  }

  /* ─── FAB button for audio ─── */
  function buildAudioFab() {
    const fab = document.createElement('button');
    fab.className = 'x407-fab x407-fab-audio';
    fab.title = 'Listen to page';
    fab.innerHTML = '🔊';
    fab.onclick = () => toggleAudioBar();
    return fab;
  }

  let audioBar = null;
  function toggleAudioBar(forceState) {
    if (!audioBar) audioBar = buildAudioBar();
    const isOpen = audioBar.classList.contains('open');
    const newState = forceState !== undefined ? forceState : !isOpen;
    audioBar.classList.toggle('open', newState);
    document.querySelector('.x407-fab-audio')?.classList.toggle('active', newState);
    if (newState) {
      document.querySelector('.x407-chat-panel')?.classList.remove('open');
      document.querySelector('.x407-fab-chat')?.classList.remove('active');
    }
  }

  /* ─── Per-Section Listen Buttons ─── */
  function injectSectionListenButtons() {
    SECTION_MAP.forEach(sec => {
      const el = document.querySelector(sec.selector);
      if (!el) return;
      const heading = el.querySelector('h1, h2');
      if (!heading) return;
      if (heading.querySelector('.x407-section-listen')) return;
      const btn = document.createElement('button');
      btn.className = 'x407-section-listen';
      btn.textContent = '🔊 Listen';
      btn.title = `Listen to ${sec.label} section`;
      btn.onclick = (e) => {
        e.preventDefault();
        clearSectionHighlights();
        btn.classList.add('speaking');
        btn.textContent = '🔊 Speaking…';
        currentSectionId = sec.id;
        const text = getSectionText(sec.id);
        speak(text, sec.label, () => {
          btn.classList.remove('speaking');
          btn.textContent = '🔊 Listen';
        });
        toggleAudioBar(true);
      };
      heading.appendChild(btn);
    });
  }

  /* ─── Public API ─── */
  window.X407Voice = {
    speak,
    stop,
    pause,
    resume,
    getSectionText,
    getAllText,
    get isSpeaking() { return isSpeaking; },
    get isPaused() { return isPaused; },
    get engine() { return currentEngine; },
    toggleAudioBar,
    buildAudioFab,
    injectSectionListenButtons,
  };
})();
