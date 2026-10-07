// Standalone: paste this file into the Supabase Edge Function editor.
// Disable the legacy JWT check for this function (client uses a publishable key).
const PUBLIC_KEY = 'sb_publishable_5zxeux70gYwvKeh03hw3LA_ENLcTu5K';
const MAX_BYTES = 32 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reply(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

async function readBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error('body');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('size'); }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

export async function handle(request: Request): Promise<Response> {
  if (request.method !== 'POST') return reply(405, 'method');
  // This is a public app credential, not user authentication.
  if (request.headers.get('apikey') !== PUBLIC_KEY) return reply(401, 'key');
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, 'content_type');
  if (Number(request.headers.get('content-length')) > MAX_BYTES) return reply(413, 'size');

  let body: { events?: unknown[] };
  try { body = await readBody(request) as typeof body; }
  catch { return reply(400, 'body'); }
  if (!body || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 50) return reply(400, 'events');
  const allowed = ['event_id', 'installation_id', 'game_id', 'mode', 'app_version', 'platform', 'played_at'];
  let installation: string | undefined;
  for (const input of body.events) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return reply(400, 'event');
    const e = input as Record<string, unknown>;
    if (Object.keys(e).length !== allowed.length || Object.keys(e).some(k => !allowed.includes(k))) return reply(400, 'fields');
    if (typeof e.event_id !== 'string' || !uuid.test(e.event_id) ||
      typeof e.installation_id !== 'string' || !uuid.test(e.installation_id) ||
      typeof e.game_id !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(e.game_id) ||
      typeof e.mode !== 'string' || !['solo', 'duel', 'room'].includes(e.mode) ||
      typeof e.app_version !== 'string' || e.app_version.length < 1 || e.app_version.length > 64 ||
      typeof e.platform !== 'string' || !['darwin', 'win32', 'linux'].includes(e.platform) ||
      typeof e.played_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(e.played_at) ||
      !Number.isFinite(Date.parse(e.played_at))) return reply(400, 'event');
    if (installation && installation !== e.installation_id) return reply(400, 'installation');
    installation = e.installation_id;
  }

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply(503, 'configuration');
  try {
    const response = await fetch(`${url}/rest/v1/rpc/ingest_game_plays`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: body.events }), signal: AbortSignal.timeout(4000)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return reply(error.message === 'rate_limit' ? 429 : 503, error.message === 'rate_limit' ? 'rate_limit' : 'storage');
    }
    return new Response(null, { status: 204 });
  } catch { return reply(503, 'storage'); }
}

Deno.serve(handle);
