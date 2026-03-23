/**
 * X407 AI Assistant — OpenAI-powered chat via Cloudflare Worker proxy
 * Falls back to local knowledge base when the API is unavailable.
 * Speaks responses aloud on request via TTS integration.
 */
(() => {
  'use strict';

  /* ─── Configuration ─── */
  const WORKER_URL = 'https://x407-ai-proxy.kevanbtc.workers.dev';
  const MAX_HISTORY = 12;   // Conversation turns sent to OpenAI
  const TIMEOUT_MS = 15000; // API request timeout

  /* ─── Conversation State ─── */
  let conversationHistory = [];
  let aiAvailable = null; // null = unknown, true/false after first check

  /* ─── Knowledge Base (offline fallback) ─── */
  const KB = [
    { keys: ['what is x407','about x407','explain x407','overview','what does x407 do','tell me about'], answer: 'X407 is the agent commerce operating layer for AI-to-AI payments, AWS-hosted application infrastructure, Layer 1 settlement orchestration, programmable payment challenges, receipts, compliance evidence, and enterprise-grade machine commerce.' },
    { keys: ['architecture','system design','how does it work','how it works','components','stack'], answer: 'X407 has a 5-layer architecture: (1) AWS App Layer, (2) Gateway — route protection and proof verification, (3) Policy & Metering — tiering, pricing, balances, receipts, (4) Compliance — evidence bundles and audit logs, (5) Layer 1 Settlement — finality routing and anchoring.' },
    { keys: ['payment','how payments work','402','challenge','proof','http 402','payment flow'], answer: 'X407 uses HTTP 402. An AI agent requests a monetized route → Gateway issues a payment challenge → Agent signs an Ed25519 proof → Facilitator verifies, debits balance, issues receipt → Request forwards to origin API.' },
    { keys: ['receipt','compliance','audit','evidence','trust','enterprise'], answer: 'Enterprise trust: cryptographic receipts, evidence bundles, and a compliance ledger — immutable, exportable, and audit-ready.' },
    { keys: ['facilitator','fth-x402-facilitator','port 3100'], answer: 'The Facilitator (Fastify v5.8.4, port 3100) handles wallet management, proof verification, receipt generation, and batch settlement with Ed25519 signatures and PostgreSQL-backed rate limiting.' },
    { keys: ['gateway','cloudflare','worker','edge','fth-x402-gateway','wrangler'], answer: 'The Gateway is a Cloudflare Worker providing edge route protection, 402 challenge issuance, and proof verification. Deployed with Wrangler v4.' },
    { keys: ['treasury','funding','agent funding','fth-x402-treasury'], answer: 'The Treasury (Fastify v5.8.4, port 3200) handles policy-driven automated agent funding, treasury management, and balance operations.' },
    { keys: ['wallet','ed25519','crypto','signature','key'], answer: 'X407 uses Ed25519 wallets (tweetnacl). Agents generate keypairs, register public keys, and sign proofs. Addresses: uny1_test_[base58pubkey].' },
    { keys: ['database','postgres','postgresql','tables','migration'], answer: 'PostgreSQL 16.11, 16 tables, Docker-hosted with health checks. Least-privilege role fth_x402_app for app access, admin reserved for migrations. SSL enforced in production.' },
    { keys: ['security','rate limit','replay','auth','cors','protection'], answer: 'Security layers: Ed25519 signatures, sliding-window rate limiter (PG-backed), replay guard (invoice_id + nonce), Bearer/X-Admin-Token auth, CORS, least-privilege DB, SSL, non-root Docker (fth:1001).' },
    { keys: ['infrastructure','aws','cloud','docker','deploy','deployment'], answer: 'AWS app plane for APIs and orchestration, Cloudflare edge for gateway and tunnels (QUIC), Docker multi-stage builds with node:22-alpine, Layer 1 for settlement anchoring.' },
    { keys: ['positioning','competitive','market','moat','advantage','why x407'], answer: 'X407 wins on developer simplicity, enterprise trust (receipts + evidence), and commercial moat (public protocol + protected premium engines). Beats legacy billing, chain-only rails, and closed platforms.' },
    { keys: ['execution','90 day','timeline','roadmap','plan','launch'], answer: '90-day plan: Days 1-30 (Foundation) → protect routes, schemas, benchmarks. Days 31-60 (Pilot) → 2-3 partners, sandbox kit, proof collection. Days 61-90 (Public Proof) → benchmarks, case studies, white-label packaging.' },
    { keys: ['growth','adoption','partner','flywheel','go to market','gtm'], answer: 'Partner flywheel: Easy Integration → More Providers → More Endpoints → More Wallet Utility → More Volume → More Revenue → More Referrals → cycle repeats.' },
    { keys: ['pilot','partner program','onboard','sandbox'], answer: 'Pilot Partner Program: 3-5 design partners with sandbox kit, integration support, and measurable benchmarks for latency, conversion, and trust metrics.' },
    { keys: ['metering','usage','billing','balance','pricing','fth-metering'], answer: 'fth-metering + OpenMeter for usage tracking. fth-x402-pricing for route-level pricing, tiering, and geo policies. Balances in USDF with 7 decimal places.' },
    { keys: ['ip','protection','intellectual property','open source','license','white label'], answer: 'Dual IP model: public protocol surface for adoption + protected premium engines for defensibility. White-label partners get revenue and control.' },
    { keys: ['sdk','developer','integrate','api','fth-x402-sdk'], answer: 'fth-x402-sdk: client library for wallet management, proof signing, invoice parsing, and receipt verification. Add 402 payment challenges to any route with minimal code.' },
    { keys: ['layer 1','settlement','blockchain','chain','finality','anchor'], answer: 'Layer 1 settlement: L1 anchor sweep every 60s batches receipts on-chain for cryptographic finality independent of any single party.' },
    { keys: ['status','health','system status','is it running','operational'], answer: 'Check /health on the facilitator. Healthy response: status ok, version, uptime, DB status. Full smoke test: 11 steps from health to replay protection.' },
    { keys: ['help','commands','what can you do','capabilities'], answer: 'I\'m the X407 AI assistant powered by OpenAI. Ask about architecture, payments, security, infrastructure, positioning, roadmap, growth, metering, SDK, settlement, or system status. Click 🔊 to hear replies read aloud.' }
  ];

  /* ─── Quick Action Chips ─── */
  const QUICK_ACTIONS = [
    'What is X407?',
    'How do payments work?',
    'System architecture',
    'Security measures',
    'Explain the 90-day plan',
  ];

  /* ─── Local KB Matching (fallback) ─── */
  function findAnswerLocal(input) {
    const q = input.toLowerCase().trim();
    if (!q) return null;
    let bestMatch = null, bestScore = 0;
    for (const entry of KB) {
      let score = 0;
      for (const key of entry.keys) {
        const kl = key.toLowerCase();
        if (q === kl) { score += 100; continue; }
        if (q.includes(kl)) { score += 60; continue; }
        const kw = kl.split(/\s+/), qw = q.split(/\s+/);
        const overlap = kw.filter(k => qw.some(w => w.includes(k) || k.includes(w) || (k.length > 3 && w.length > 3 && levenshtein(k, w) <= 2)));
        if (overlap.length > 0) score += (overlap.length / kw.length) * 40;
      }
      if (score > bestScore) { bestScore = score; bestMatch = entry; }
    }
    return bestScore >= 15 ? bestMatch.answer : null;
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return dp[m][n];
  }

  /* ─── OpenAI via Worker Proxy ─── */
  async function askOpenAI(message) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${WORKER_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: conversationHistory.slice(-MAX_HISTORY),
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      aiAvailable = true;
      return data.reply || null;
    } catch (err) {
      clearTimeout(timer);
      console.warn('X407 AI proxy unavailable:', err.message);
      aiAvailable = false;
      return null;
    }
  }

  /* ─── Combined Answer Engine ─── */
  async function findAnswer(input) {
    const q = input.trim();
    if (!q) return 'Please type a question.';

    // Try OpenAI first
    const aiReply = await askOpenAI(q);
    if (aiReply) {
      conversationHistory.push({ role: 'user', content: q });
      conversationHistory.push({ role: 'assistant', content: aiReply });
      return aiReply;
    }

    // Fall back to local KB
    const kbReply = findAnswerLocal(q);
    if (kbReply) return kbReply;

    return "I don't have specific information on that topic. Try asking about X407's architecture, payment flow, security, infrastructure, market positioning, execution plan, or growth strategy.";
  }

  /* ─── Health Check (runs once on load) ─── */
  async function checkHealth() {
    try {
      const res = await fetch(`${WORKER_URL}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        aiAvailable = data.capabilities?.chat === true;
      } else {
        aiAvailable = false;
      }
    } catch {
      aiAvailable = false;
    }
    updateStatusIndicator();
  }

  function updateStatusIndicator() {
    const indicator = document.querySelector('.x407-chat-header-text span');
    if (!indicator) return;
    if (aiAvailable) {
      indicator.innerHTML = '<span style="color:var(--green)">●</span> AI Online — GPT-4o mini';
    } else {
      indicator.innerHTML = '<span style="color:var(--amber,#f59e0b)">●</span> Offline mode — Local KB';
    }
  }

  /* ─── Chat UI ─── */
  let chatPanel = null;
  let messagesContainer = null;
  let isSending = false;

  function buildChatPanel() {
    const panel = document.createElement('div');
    panel.className = 'x407-chat-panel';
    panel.innerHTML = `
      <div class="x407-chat-header">
        <div class="x407-chat-avatar">X</div>
        <div class="x407-chat-header-text">
          <h4>X407 Assistant</h4>
          <span><span style="color:var(--muted)">●</span> Connecting…</span>
        </div>
        <button class="x407-chat-close" title="Close">✕</button>
      </div>
      <div class="x407-chat-messages"></div>
      <div class="x407-quick-actions">
        ${QUICK_ACTIONS.map(q => `<button class="x407-quick-chip">${q}</button>`).join('')}
      </div>
      <div class="x407-chat-input-area">
        <input class="x407-chat-input" type="text" placeholder="Ask about X407…" autocomplete="off">
        <button class="x407-chat-send" title="Send">➤</button>
      </div>
    `;
    document.body.appendChild(panel);

    messagesContainer = panel.querySelector('.x407-chat-messages');

    // Close
    panel.querySelector('.x407-chat-close').onclick = () => toggleChat(false);

    // Send
    const input = panel.querySelector('.x407-chat-input');
    const sendBtn = panel.querySelector('.x407-chat-send');

    async function sendMessage() {
      const text = input.value.trim();
      if (!text || isSending) return;
      isSending = true;
      input.value = '';
      input.disabled = true;
      sendBtn.disabled = true;
      addMessage(text, 'user');
      showTyping();
      try {
        const answer = await findAnswer(text);
        hideTyping();
        addMessage(answer, 'bot');
        updateStatusIndicator();
      } catch (err) {
        hideTyping();
        addMessage('Sorry, something went wrong. Please try again.', 'bot');
      }
      isSending = false;
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }

    sendBtn.onclick = sendMessage;
    input.onkeydown = (e) => { if (e.key === 'Enter') sendMessage(); };

    // Quick actions
    panel.querySelectorAll('.x407-quick-chip').forEach(chip => {
      chip.onclick = () => {
        input.value = chip.textContent;
        sendMessage();
      };
    });

    // Welcome message
    setTimeout(() => {
      const mode = aiAvailable ? 'Powered by OpenAI GPT-4o mini' : 'Running in offline mode';
      addMessage(`Welcome to X407. I'm the system assistant — ${mode}. Ask me anything about the agent commerce platform, architecture, security, payments, or strategy. Click 🔊 on any reply to hear it read aloud.`, 'bot');
    }, 300);

    // Check AI health
    checkHealth();

    return panel;
  }

  function addMessage(text, type) {
    const msg = document.createElement('div');
    msg.className = `x407-msg ${type}`;

    const content = document.createElement('div');
    content.className = 'x407-msg-content';
    content.textContent = text;
    msg.appendChild(content);

    // Add speak button + source badge to bot messages
    if (type === 'bot') {
      const meta = document.createElement('div');
      meta.className = 'x407-msg-meta';

      const speakBtn = document.createElement('button');
      speakBtn.className = 'speak-reply';
      speakBtn.innerHTML = '🔊 Listen';
      speakBtn.onclick = () => {
        if (window.X407Voice) {
          window.X407Voice.speak(text, 'Assistant');
          window.X407Voice.toggleAudioBar(true);
        }
      };
      meta.appendChild(speakBtn);

      // Source badge
      const badge = document.createElement('span');
      badge.className = 'x407-source-badge';
      badge.textContent = aiAvailable ? '⚡ GPT' : '📚 KB';
      badge.title = aiAvailable ? 'Response from OpenAI GPT-4o mini' : 'Response from local knowledge base';
      meta.appendChild(badge);

      msg.appendChild(meta);
    }

    messagesContainer.appendChild(msg);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  let typingEl = null;
  function showTyping() {
    typingEl = document.createElement('div');
    typingEl.className = 'x407-typing';
    typingEl.innerHTML = '<span></span><span></span><span></span>';
    messagesContainer.appendChild(typingEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function hideTyping() {
    if (typingEl) { typingEl.remove(); typingEl = null; }
  }

  /* ─── FAB button for chat ─── */
  function buildChatFab() {
    const fab = document.createElement('button');
    fab.className = 'x407-fab x407-fab-chat';
    fab.title = 'Ask the AI assistant';
    fab.innerHTML = '💬';
    fab.onclick = () => toggleChat();
    return fab;
  }

  function toggleChat(forceState) {
    if (!chatPanel) chatPanel = buildChatPanel();
    const isOpen = chatPanel.classList.contains('open');
    const newState = forceState !== undefined ? forceState : !isOpen;
    chatPanel.classList.toggle('open', newState);
    document.querySelector('.x407-fab-chat')?.classList.toggle('active', newState);
    if (newState) {
      // Close audio bar if opening chat
      document.querySelector('.x407-audio-bar')?.classList.remove('open');
      document.querySelector('.x407-fab-audio')?.classList.remove('active');
      // Focus input
      setTimeout(() => chatPanel.querySelector('.x407-chat-input')?.focus(), 350);
    }
  }

  /* ─── Public API ─── */
  window.X407Assistant = {
    findAnswer,
    findAnswerLocal,
    toggleChat,
    buildChatFab,
    addMessage,
    get aiAvailable() { return aiAvailable; },
    clearHistory() { conversationHistory = []; },
    WORKER_URL,
  };
})();
