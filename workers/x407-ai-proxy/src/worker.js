/**
 * X407 AI Proxy — Cloudflare Worker
 * Securely proxies requests to OpenAI and ElevenLabs.
 * API keys are stored as encrypted Worker secrets.
 *
 * Endpoints:
 *   POST /chat    → OpenAI Chat Completions (streaming)
 *   POST /tts     → ElevenLabs Text-to-Speech (returns audio/mpeg)
 *   GET  /voices  → ElevenLabs available voices
 *   GET  /health  → Health check
 */

const X407_SYSTEM_PROMPT = `You are X407 Assistant, the AI guide for the X407 agent commerce platform.

X407 is the monetization and trust operating layer for AI-to-AI systems. Key facts:

ARCHITECTURE:
- 5-layer stack: AWS App Layer → Gateway → Policy & Metering → Compliance → Layer 1 Settlement
- Payment flow: AI Agent request → 402 Payment Challenge → Signed Proof → Verification → Receipt → Fulfillment
- Uses HTTP 402 Payment Required as the protocol foundation

COMPONENTS:
- Facilitator (Fastify v5.8.4, port 3100): Core verification, settlement, wallet management, receipts
- Gateway (Cloudflare Worker, Wrangler v4): Edge route protection, challenge issuance, proof verification
- Treasury (Fastify v5.8.4, port 3200): Policy-driven agent funding and balance operations
- Database: PostgreSQL 16.11, 16 tables, least-privilege access (fth_x402_app role)
- Metering: OpenMeter integration for usage tracking
- SDK: Client library for 402 payment integration

SECURITY:
- Ed25519 cryptographic signatures (tweetnacl) for all payment proofs
- Sliding-window rate limiter (PostgreSQL-backed)
- Replay guard (invoice_id + nonce)
- Non-root Docker containers (node:22-alpine, user fth:1001)
- SSL-enforced database connections in production
- Admin auth via Bearer token / X-Admin-Token

MARKET POSITIONING:
- Wins against legacy billing (static credentials) with route-level monetization
- Wins against chain-only rails with receipts, policy controls, and compliance
- Wins against closed platforms with white-label independence
- 5 core moats, 90-day execution plan, 3-5 pilot partners target
- Dual IP model: public protocol for adoption + protected premium engines

INFRASTRUCTURE:
- AWS application plane for APIs, orchestration, analytics
- Cloudflare edge for gateway, tunnels (QUIC), DNS
- Layer 1 settlement anchoring for finality and interoperability

Be concise, technical, and helpful. Answer questions about X407 architecture, payments, security, strategy, infrastructure, and roadmap. If asked about something outside X407, politely redirect to X407 topics.`;

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(env, new Response(null, { status: 204 }));
    }

    // Origin check
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim());
    // Allow localhost for dev
    const isAllowed = allowed.includes(origin) ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1');

    if (!isAllowed && origin) {
      return new Response('Forbidden', { status: 403 });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/health') {
        return corsResponse(env, Response.json({
          status: 'ok',
          service: 'x407-ai-proxy',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          capabilities: {
            chat: !!env.OPENAI_API_KEY,
            tts: !!env.ELEVENLABS_API_KEY,
          }
        }));
      }

      if (path === '/chat' && request.method === 'POST') {
        return await handleChat(request, env);
      }

      if (path === '/tts' && request.method === 'POST') {
        return await handleTTS(request, env);
      }

      if (path === '/voices' && request.method === 'GET') {
        return await handleVoices(env);
      }

      return corsResponse(env, Response.json(
        { error: 'Not found', endpoints: ['/chat', '/tts', '/voices', '/health'] },
        { status: 404 }
      ));
    } catch (err) {
      console.error('Worker error:', err);
      return corsResponse(env, Response.json(
        { error: 'Internal error', message: err.message },
        { status: 500 }
      ));
    }
  }
};

/* ─── OpenAI Chat ─── */
async function handleChat(request, env) {
  if (!env.OPENAI_API_KEY) {
    return corsResponse(env, Response.json(
      { error: 'OpenAI not configured' },
      { status: 503 }
    ));
  }

  const body = await request.json();
  const userMessage = body.message || body.prompt || '';
  const history = body.history || [];

  if (!userMessage) {
    return corsResponse(env, Response.json(
      { error: 'message is required' },
      { status: 400 }
    ));
  }

  // Build messages array with system prompt + history + user message
  const messages = [
    { role: 'system', content: X407_SYSTEM_PROMPT },
    ...history.slice(-10).map(h => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.content
    })),
    { role: 'user', content: userMessage }
  ];

  const model = env.OPENAI_MODEL || 'gpt-4o-mini';

  // Streaming response
  if (body.stream) {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      return corsResponse(env, Response.json(
        { error: 'OpenAI error', detail: err },
        { status: openaiRes.status }
      ));
    }

    // Pass through the SSE stream
    return corsResponse(env, new Response(openaiRes.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      }
    }));
  }

  // Non-streaming response
  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  if (!openaiRes.ok) {
    const err = await openaiRes.text();
    return corsResponse(env, Response.json(
      { error: 'OpenAI error', detail: err },
      { status: openaiRes.status }
    ));
  }

  const data = await openaiRes.json();
  const reply = data.choices?.[0]?.message?.content || 'No response generated.';

  return corsResponse(env, Response.json({
    reply,
    model,
    usage: data.usage,
  }));
}

/* ─── ElevenLabs TTS ─── */
async function handleTTS(request, env) {
  if (!env.ELEVENLABS_API_KEY) {
    return corsResponse(env, Response.json(
      { error: 'ElevenLabs not configured' },
      { status: 503 }
    ));
  }

  const body = await request.json();
  const text = body.text || '';
  const voiceId = body.voice_id || env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  const modelId = body.model_id || env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

  if (!text) {
    return corsResponse(env, Response.json(
      { error: 'text is required' },
      { status: 400 }
    ));
  }

  // Truncate to ElevenLabs limit (~5000 chars per request)
  const truncated = text.slice(0, 4800);

  const elRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: truncated,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        }
      }),
    }
  );

  if (!elRes.ok) {
    const err = await elRes.text();
    return corsResponse(env, Response.json(
      { error: 'ElevenLabs error', detail: err },
      { status: elRes.status }
    ));
  }

  return corsResponse(env, new Response(elRes.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=3600',
    }
  }));
}

/* ─── ElevenLabs Voices ─── */
async function handleVoices(env) {
  if (!env.ELEVENLABS_API_KEY) {
    return corsResponse(env, Response.json(
      { error: 'ElevenLabs not configured' },
      { status: 503 }
    ));
  }

  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
  });

  if (!res.ok) {
    return corsResponse(env, Response.json(
      { error: 'Failed to fetch voices' },
      { status: res.status }
    ));
  }

  const data = await res.json();
  const voices = (data.voices || []).map(v => ({
    voice_id: v.voice_id,
    name: v.name,
    category: v.category,
    labels: v.labels,
    preview_url: v.preview_url,
  }));

  return corsResponse(env, Response.json({ voices }));
}

/* ─── CORS Helper ─── */
function corsResponse(env, response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
