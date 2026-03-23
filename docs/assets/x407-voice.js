/**
 * X407 Voice Engine — Text-to-Speech using Web Speech API
 * Reads page sections, full-page content, or arbitrary text aloud.
 * Provides transport controls (play/pause/stop), voice selection, speed control.
 */
(() => {
  'use strict';

  /* ─── State ─── */
  const synth = window.speechSynthesis;
  let voices = [];
  let currentUtterance = null;
  let queue = [];
  let queueIndex = 0;
  let isPaused = false;
  let isSpeaking = false;
  let currentSectionId = null;

  /* ─── Preferences (persisted in localStorage) ─── */
  const PREF_KEY = 'x407_voice_prefs';
  const defaults = { voiceURI: '', rate: 1.0 };
  function loadPrefs() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREF_KEY)) }; }
    catch { return { ...defaults }; }
  }
  function savePrefs(p) { localStorage.setItem(PREF_KEY, JSON.stringify(p)); }
  let prefs = loadPrefs();

  /* ─── Voice Loading ─── */
  function loadVoices() {
    voices = synth.getVoices().filter(v => v.lang.startsWith('en'));
    const sel = document.getElementById('x407-voice-select');
    if (!sel) return;
    sel.innerHTML = '';
    voices.forEach((v, i) => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      if (v.voiceURI === prefs.voiceURI || (!prefs.voiceURI && v.default)) opt.selected = true;
      sel.appendChild(opt);
    });
  }
  if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices;
  setTimeout(loadVoices, 200);

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
    // Clone and remove script/style/mermaid content
    const clone = el.cloneNode(true);
    clone.querySelectorAll('script, style, pre.mermaid, .x407-section-listen').forEach(n => n.remove());
    let text = clone.innerText || clone.textContent || '';
    // Clean up whitespace
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
    // Check if we're on the main page (has hero section)
    const isMainPage = !!document.querySelector('.hero');
    if (isMainPage) {
      return SECTION_MAP.map(s => {
        const el = document.querySelector(s.selector);
        const text = extractText(el);
        return text ? `${s.label} section. ${text}` : '';
      }).filter(Boolean).join('. Next section. ');
    }
    // Sub-page: read main/article content
    const main = document.querySelector('main') || document.querySelector('article') || document.querySelector('.container');
    return main ? extractText(main) : extractText(document.body);
  }

  function isMainPage() {
    return !!document.querySelector('.hero');
  }

  /* ─── Speak Engine ─── */
  function speak(text, label, onEnd) {
    stop();

    // Split long text into chunks (synth has a ~200 word limit in some browsers)
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
    speakNext(onEnd);
  }

  function speakNext(onEnd) {
    if (queueIndex >= queue.length) {
      isSpeaking = false;
      currentUtterance = null;
      updateUI(null);
      updateWaveform(false);
      if (onEnd) onEnd();
      return;
    }

    const utter = new SpeechSynthesisUtterance(queue[queueIndex]);
    const selectedVoice = voices.find(v => v.voiceURI === prefs.voiceURI);
    if (selectedVoice) utter.voice = selectedVoice;
    utter.rate = prefs.rate;
    utter.pitch = 1;

    utter.onstart = () => updateWaveform(true);
    utter.onend = () => {
      queueIndex++;
      speakNext(onEnd);
    };
    utter.onerror = (e) => {
      if (e.error !== 'canceled') console.warn('X407 Voice error:', e.error);
      isSpeaking = false;
      updateWaveform(false);
    };

    currentUtterance = utter;
    synth.speak(utter);
  }

  function pause() {
    if (synth.speaking && !synth.paused) {
      synth.pause();
      isPaused = true;
      updateWaveform(false);
      updatePlayButton();
    }
  }

  function resume() {
    if (synth.paused) {
      synth.resume();
      isPaused = false;
      updateWaveform(true);
      updatePlayButton();
    }
  }

  function stop() {
    synth.cancel();
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
      synth.cancel();
      queueIndex = Math.max(0, queueIndex - 1);
      speakNext();
    }
  }

  function skipForward() {
    if (queueIndex < queue.length - 1) {
      synth.cancel();
      queueIndex = Math.min(queue.length - 1, queueIndex + 1);
      speakNext();
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
    // Update section button highlights
    document.querySelectorAll('.x407-section-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === currentSectionId);
    });
  }

  function updatePlayButton() {
    const btn = document.querySelector('.x407-play-btn');
    if (!btn) return;
    if (isSpeaking && !isPaused) {
      btn.innerHTML = '⏸';
      btn.title = 'Pause';
    } else {
      btn.innerHTML = '▶';
      btn.title = 'Play';
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
      bars.forEach(bar => {
        bar.style.height = (3 + Math.random() * 18) + 'px';
      });
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

  /* ─── Build UI ─── */
  function buildAudioBar() {
    const bar = document.createElement('div');
    bar.className = 'x407-audio-bar';
    bar.innerHTML = `
      <div class="x407-audio-bar-header">
        <h4><span class="pulse-dot"></span> X407 Voice</h4>
        <button class="x407-audio-close" title="Close">✕</button>
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
        <label>Speed <input type="range" id="x407-speed" min="0.5" max="2" step="0.1" value="${prefs.rate}"> <span class="x407-speed-value">${prefs.rate}×</span></label>
      </div>
    `;
    document.body.appendChild(bar);

    // Event listeners
    bar.querySelector('.x407-audio-close').onclick = () => toggleAudioBar(false);

    bar.querySelector('.x407-play-btn').onclick = () => {
      if (isSpeaking && !isPaused) {
        pause();
      } else if (isPaused) {
        resume();
      } else {
        // Read all
        currentSectionId = null;
        speak(getAllText(), 'Full Page');
      }
    };

    bar.querySelector('.x407-stop-btn').onclick = stop;
    bar.querySelector('.x407-skip-back').onclick = skipBack;
    bar.querySelector('.x407-skip-fwd').onclick = skipForward;

    bar.querySelectorAll('.x407-section-btn').forEach(btn => {
      btn.onclick = () => {
        const sId = btn.dataset.section;
        currentSectionId = sId;
        const sec = SECTION_MAP.find(s => s.id === sId);
        const text = getSectionText(sId);
        if (text) speak(text, sec.label);
      };
    });

    const voiceSel = bar.querySelector('#x407-voice-select');
    voiceSel.onchange = () => { prefs.voiceURI = voiceSel.value; savePrefs(prefs); };

    const speedSlider = bar.querySelector('#x407-speed');
    const speedVal = bar.querySelector('.x407-speed-value');
    speedSlider.oninput = () => {
      prefs.rate = parseFloat(speedSlider.value);
      speedVal.textContent = prefs.rate + '×';
      savePrefs(prefs);
    };

    loadVoices();
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
    // Close chat if opening audio
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
      // Avoid duplicates
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
        // Open audio bar
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
    toggleAudioBar,
    buildAudioFab,
    injectSectionListenButtons,
  };
})();
