import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('esbuild');
const source = readFileSync(new URL('../supabase/functions/game-telemetry/index.ts', import.meta.url), 'utf8');
const code = transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
const key = 'sb_publishable_5zxeux70gYwvKeh03hw3LA_ENLcTu5K';

function endpoint(status = 200, error = {}) {
  const calls = [];
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Response, TextDecoder, AbortSignal,
    Deno: { env: { get: name => name === 'SUPABASE_URL' ? 'https://example.test' : 'server-only-key' }, serve() {} },
    fetch: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return { ok: status === 200, json: async () => error };
    }
  });
  return { handle: module.exports.handle, calls };
}
const event = () => ({ event_id: randomUUID(), installation_id: randomUUID(), game_id: 'soccer',
  mode: 'solo', app_version: '0.9.6', platform: 'darwin', played_at: new Date().toISOString() });
const request = (body, apiKey = key) => new Request('https://example.test', {
  method: 'POST', headers: { apikey: apiKey, 'content-type': 'application/json' }, body: JSON.stringify(body)
});

test('valid batch is forwarded; nickname, invalid modes and mixed installations never reach storage', async () => {
  const api = endpoint();
  assert.equal((await api.handle(request({ events: [event()] }))).status, 204);
  for (const events of [[{ ...event(), nickname: 'private' }], [{ ...event(), mode: 'invalid' }], [event(), event()], []]) {
    assert.equal((await api.handle(request({ events }))).status, 400);
  }
  assert.equal(api.calls.length, 1);
});

test('wrong key, large payloads and unavailable database fail without exposing credentials', async () => {
  const api = endpoint();
  assert.equal((await api.handle(request({ events: [event()] }, 'wrong'))).status, 401);
  assert.equal((await api.handle(request({ events: [], padding: 'x'.repeat(33000) }))).status, 400);
  assert.equal(api.calls.length, 0);
  assert.equal((await endpoint(400, { message: 'rate_limit' }).handle(request({ events: [event()] }))).status, 429);
  const failure = await endpoint(500, { message: 'secret internal info' }).handle(request({ events: [event()] }));
  assert.equal(failure.status, 503);
  assert.equal(await failure.text(), '{"error":"storage"}');
});
