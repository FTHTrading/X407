/**
 * X407 AI Assistant — Knowledge-base chat with TTS integration
 * Answers questions about the X407 system, architecture, strategy,
 * and infrastructure. Speaks responses aloud on request.
 */
(() => {
  'use strict';

  /* ─── Knowledge Base ─── */
  const KB = [
    {
      keys: ['what is x407', 'about x407', 'explain x407', 'overview', 'what does x407 do', 'tell me about'],
      answer: 'X407 is the agent commerce operating layer for AI-to-AI payments, AWS-hosted application infrastructure, Layer 1 settlement orchestration, programmable payment challenges, receipts, compliance evidence, and enterprise-grade machine commerce. It provides a monetization and trust operating layer for AI-to-AI systems, combining challenge logic, proof verification, geo-aware policy enforcement, metering, receipts, and compliance into one platform.'
    },
    {
      keys: ['architecture', 'system design', 'how does it work', 'how it works', 'components', 'stack'],
      answer: 'X407 has a 5-layer architecture: (1) AWS App Layer — application services, control-plane logic, APIs, and enterprise integrations; (2) Gateway — programmable paid access, route protection, and proof verification; (3) Policy and Metering — tiering, geography, route pricing, usage balances, receipts, and provider intelligence; (4) Compliance — evidence bundles, audit logs, and exportable trust artifacts; (5) Layer 1 Settlement — finality routing, settlement anchoring, and future multi-rail orchestration. The flow is: AI Agent sends request → Policy Gateway issues 402 payment challenge → Agent sends signed proof → Gateway verifies and routes to the origin API → Receipt and metering engine logs the transaction → Evidence goes to the compliance ledger and Layer 1 settlement.'
    },
    {
      keys: ['payment', 'how payments work', '402', 'challenge', 'proof', 'http 402', 'payment flow'],
      answer: 'X407 uses the HTTP 402 Payment Required status code as its foundation. When an AI agent requests a monetized API route, the gateway issues a payment challenge with terms (price, currency, proof type). The agent signs a cryptographic proof (using Ed25519 signatures) and submits it. The facilitator verifies the signature, debits the agent\'s prepaid balance, issues a cryptographic receipt, and forwards the request to the origin API. Replay protection ensures the same invoice cannot be redeemed twice.'
    },
    {
      keys: ['receipt', 'compliance', 'audit', 'evidence', 'trust', 'enterprise'],
      answer: 'Enterprise trust is built on three pillars: (1) Cryptographic receipts — every payment generates a signed receipt with amount, proof type, and facilitator signature; (2) Evidence bundles — audit-ready collections of receipts, policy decisions, and transaction metadata; (3) Compliance ledger — immutable log of all transactions exportable for regulatory review. These artifacts become sales assets for enterprise adoption, procurement confidence, and compliance review.'
    },
    {
      keys: ['facilitator', 'fth-x402-facilitator', 'port 3100'],
      answer: 'The facilitator is the core verification and settlement service running on Fastify v5.8.4 at port 3100. It handles wallet registration, balance management, invoice creation, proof verification, receipt generation, and batch settlement. It connects to PostgreSQL for state management, runs periodic invoice expiry (60s), L1 anchor sweeps (60s), rate limit cleanup (15min), and webhook retries (5min). It uses Ed25519 (tweetnacl) for cryptographic signatures and has sliding-window rate limiting backed by PostgreSQL.'
    },
    {
      keys: ['gateway', 'cloudflare', 'worker', 'edge', 'fth-x402-gateway', 'wrangler'],
      answer: 'The gateway is a Cloudflare Worker that runs at the edge, providing programmable paid access and route protection. It intercepts API requests, checks payment policies, issues 402 challenges, and verifies proofs before forwarding to origin servers. It uses Wrangler v4 for deployment and is configured with compatibility_date 2026-03-01.'
    },
    {
      keys: ['treasury', 'funding', 'agent funding', 'fth-x402-treasury'],
      answer: 'The treasury service runs on Fastify v5.8.4 at port 3200. It handles policy-driven automated agent funding, treasury management, and balance operations. It works alongside the facilitator to ensure agents have adequate funding for their commerce activities.'
    },
    {
      keys: ['wallet', 'ed25519', 'crypto', 'signature', 'key'],
      answer: 'X407 uses Ed25519 cryptographic wallets (via tweetnacl). Each agent generates a keypair, registers the public key with the facilitator, and signs payment proofs with the private key. Wallet addresses follow the format uny1_test_[base58pubkey]. The facilitator verifies signatures against registered public keys before processing payments.'
    },
    {
      keys: ['database', 'postgres', 'postgresql', 'tables', 'migration'],
      answer: 'X407 uses PostgreSQL 16.11 with 16 tables for state management. The database handles wallets, balances, invoices, receipts, rate limits, webhooks, and settlement records. It runs in a Docker container with health checks. A least-privilege role (fth_x402_app) is used for application connections, while the admin user is reserved for migrations only. Production and staging enforce SSL connections.'
    },
    {
      keys: ['security', 'rate limit', 'replay', 'auth', 'cors', 'protection'],
      answer: 'X407 implements multiple security layers: (1) Ed25519 cryptographic signatures for all payment proofs; (2) Sliding-window rate limiter backed by PostgreSQL; (3) Replay guard using invoice_id + nonce combinations; (4) Admin authentication via Bearer token and X-Admin-Token header; (5) CORS configuration per service; (6) Least-privilege database access (no superuser for app connections); (7) SSL-enforced database connections in production; (8) Non-root Docker containers with dedicated user (fth:1001).'
    },
    {
      keys: ['infrastructure', 'aws', 'cloud', 'docker', 'deploy', 'deployment'],
      answer: 'X407 infrastructure spans three layers: (1) AWS Application Plane — hosts APIs, orchestration, control logic, analytics, and partner integrations; (2) Built-in System Controls — challenge issuance, proof verification, metering, receipts, and compliance evidence; (3) Layer 1 Settlement — finality routing and open network interoperability. Docker containers use multi-stage builds with node:22-alpine, non-root users, and health checks. Cloudflare tunnels (QUIC) connect edge services.'
    },
    {
      keys: ['positioning', 'competitive', 'market', 'moat', 'advantage', 'why x407'],
      answer: 'X407 wins on three fronts: (1) Developer simplicity — easier to monetize a route with X407 than bolt-on API-key billing; (2) Enterprise trust — receipts, audit trails, and evidence bundles stronger than alternatives; (3) Commercial moat — public protocol surface for adoption with protected premium engines for defensibility. Against legacy billing (static credentials, monthly opacity), X407 offers route-level monetization. Against chain rails (settlement-only), X407 adds receipts and policy controls. Against closed platforms (lock-in), X407 provides white-label independence.'
    },
    {
      keys: ['execution', '90 day', 'timeline', 'roadmap', 'plan', 'launch'],
      answer: 'The 90-day execution plan has three phases: Days 1-30 (Foundation) — protect internal routes, define challenge and receipt schemas, build benchmark harness; Days 31-60 (Pilot Activation) — onboard 2-3 design partners, launch sandbox kit, collect latency and conversion proof; Days 61-90 (Public Proof) — publish benchmark note, release case study, package white-label and enterprise materials.'
    },
    {
      keys: ['growth', 'adoption', 'partner', 'flywheel', 'go to market', 'gtm'],
      answer: 'The growth engine follows a partner flywheel: Easy Integration → More Providers → More Payable Endpoints → More Agent Wallet Utility → More Agent Volume → More Revenue for Providers → More Promotion and Referrals → cycle repeats. The go-to-market stack includes a technical blog series, enterprise trust content, provider monetization guides, white-label partner packaging, certification badges, directories, and benchmark/case-study publishing.'
    },
    {
      keys: ['pilot', 'partner program', 'onboard', 'sandbox'],
      answer: 'The Pilot Partner Program targets 3-5 initial design partners. Partners get access to a sandbox kit, integration support, and measurable benchmarks. The program validates latency, conversion rates, and enterprise trust metrics before scaling to public availability.'
    },
    {
      keys: ['metering', 'usage', 'billing', 'balance', 'pricing', 'fth-metering'],
      answer: 'X407 includes a metering system (fth-metering) integrated with OpenMeter for usage tracking. The pricing engine (fth-x402-pricing) handles route-level pricing, tiering, and geographic pricing policies. Agent balances are tracked in USDF (a stablecoin unit) with 7 decimal places of precision. Deposits, debits, and balance queries are all handled through the facilitator API.'
    },
    {
      keys: ['ip', 'protection', 'intellectual property', 'open source', 'license', 'white label'],
      answer: 'X407 uses a dual-layer IP model: a public protocol surface for adoption (open standards, integration guides) and protected premium engines for defensibility (proprietary policy engine, advanced metering, white-label packaging). This allows ecosystem growth without giving away the commercial moat. White-label partners gain revenue and control without surrendering the customer relationship.'
    },
    {
      keys: ['sdk', 'developer', 'integrate', 'api', 'fth-x402-sdk'],
      answer: 'The fth-x402-sdk package provides developers with a client library for integrating with the X407 payment system. It handles wallet management, proof signing, invoice parsing, and receipt verification. The SDK simplifies the 402 payment flow so developers can add payment challenges to any API route with minimal code.'
    },
    {
      keys: ['layer 1', 'settlement', 'blockchain', 'chain', 'finality', 'anchor'],
      answer: 'X407 uses Layer 1 connectivity for settlement finality and open network interoperability. The L1 anchor sweep runs every 60 seconds to batch-anchor receipts on-chain. This provides cryptographic proof of settlement that is independent of any single party, strengthening the enterprise trust model.'
    },
    {
      keys: ['status', 'health', 'system status', 'is it running', 'operational'],
      answer: 'The X407 system status can be checked via the facilitator health endpoint at /health. A healthy response includes: status "ok", service name, version (currently 0.2.0), timestamp, uptime, and database connection status. The full smoke test validates 11 steps: health check, wallet generation, registration, deposit, balance, invoice, signing, verification, receipt lookup, balance debit, and replay protection.'
    },
    {
      keys: ['help', 'commands', 'what can you do', 'capabilities'],
      answer: 'I can help you understand the X407 agent commerce system. Ask me about: system architecture, payment flow, security measures, the facilitator, gateway, treasury, database, deployment infrastructure, market positioning, the 90-day execution plan, growth strategy, the pilot partner program, metering and pricing, SDK integration, Layer 1 settlement, IP protection, or system status. You can also click the speaker icon on any response to hear it read aloud.'
    }
  ];

  /* ─── Quick Action Chips ─── */
  const QUICK_ACTIONS = [
    'What is X407?',
    'How do payments work?',
    'System architecture',
    'Security measures',
    'System status',
  ];

  /* ─── Matching Engine ─── */
  function findAnswer(input) {
    const q = input.toLowerCase().trim();
    if (!q) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (const entry of KB) {
      let score = 0;
      for (const key of entry.keys) {
        const keyLower = key.toLowerCase();
        // Exact match
        if (q === keyLower) { score += 100; continue; }
        // Contains full key phrase
        if (q.includes(keyLower)) { score += 60; continue; }
        // Key words overlap
        const keyWords = keyLower.split(/\s+/);
        const qWords = q.split(/\s+/);
        const overlap = keyWords.filter(kw => qWords.some(qw =>
          qw.includes(kw) || kw.includes(qw) ||
          (kw.length > 3 && qw.length > 3 && levenshtein(kw, qw) <= 2)
        ));
        if (overlap.length > 0) {
          score += (overlap.length / keyWords.length) * 40;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }

    if (bestScore >= 15) return bestMatch.answer;

    // Fallback
    return "I don't have specific information on that topic. Try asking about X407's architecture, payment flow, security, infrastructure, market positioning, execution plan, or growth strategy. Type \"help\" to see all topics I can discuss.";
  }

  /* ─── Levenshtein Distance ─── */
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] :
          1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return dp[m][n];
  }

  /* ─── Chat UI ─── */
  let chatPanel = null;
  let messagesContainer = null;

  function buildChatPanel() {
    const panel = document.createElement('div');
    panel.className = 'x407-chat-panel';
    panel.innerHTML = `
      <div class="x407-chat-header">
        <div class="x407-chat-avatar">X</div>
        <div class="x407-chat-header-text">
          <h4>X407 Assistant</h4>
          <span>● Online — Ask about the system</span>
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

    function sendMessage() {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      addMessage(text, 'user');
      showTyping();
      setTimeout(() => {
        hideTyping();
        const answer = findAnswer(text);
        addMessage(answer, 'bot');
      }, 400 + Math.random() * 600);
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
      addMessage("Welcome to X407. I'm the system assistant — ask me anything about the agent commerce platform, architecture, security, payments, or strategy. You can also click 🔊 on any reply to hear it read aloud.", 'bot');
    }, 300);

    return panel;
  }

  function addMessage(text, type) {
    const msg = document.createElement('div');
    msg.className = `x407-msg ${type}`;

    const content = document.createElement('div');
    content.textContent = text;
    msg.appendChild(content);

    // Add speak button to bot messages
    if (type === 'bot') {
      const speakBtn = document.createElement('button');
      speakBtn.className = 'speak-reply';
      speakBtn.innerHTML = '🔊 Listen';
      speakBtn.onclick = () => {
        if (window.X407Voice) {
          window.X407Voice.speak(text, 'Assistant');
          window.X407Voice.toggleAudioBar(true);
        }
      };
      msg.appendChild(speakBtn);
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
    toggleChat,
    buildChatFab,
    addMessage,
  };
})();
