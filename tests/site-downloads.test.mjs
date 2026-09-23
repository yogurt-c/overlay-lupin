import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../docs/site.js', import.meta.url), 'utf8');

async function page({ releaseFails = false, storageFails = false, configured = true } = {}) {
  const elements = new Map();
  const requests = [];
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, {
        dataset: {}, listeners: {}, href: 'https://github.com/yogurt-c/overlay-lupin/releases/latest',
        addEventListener(type, handler) { this.listeners[type] = handler; },
        querySelector() { return {}; }, replaceChildren() {}, setAttribute() {},
      });
      return elements.get(id);
    },
  };
  vm.runInNewContext(source, {
    document, URL, AbortController, setTimeout, clearTimeout,
    window: configured ? {} : { OVERLAY_LUPIN_COMMENTS: { url: '', anonKey: '' } },
    localStorage: { getItem: () => null },
    fetch: async (url, options) => {
      if (url.includes('api.github.com')) {
        if (releaseFails) throw new Error('offline');
        return { ok: true, json: async () => ({ tag_name: 'v1.2.3', assets: [
          { name: 'app.dmg', browser_download_url: 'https://github.com/yogurt-c/overlay-lupin/releases/download/v1.2.3/app.dmg' },
        ] }) };
      }
      if (url.endsWith('/download_events')) {
        requests.push({ url, ...options, body: JSON.parse(options.body) });
        if (storageFails) throw new Error('offline');
        return { ok: true };
      }
      return { ok: true, json: async () => [] };
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  return { elements, requests };
}

test('records the selected OS and resolved version without intercepting navigation', async () => {
  const { elements, requests } = await page();
  assert.equal(requests.length, 0);
  const mac = elements.get('download-mac');
  await mac.listeners.click({ type: 'click', preventDefault() { assert.fail('navigation blocked'); } });
  assert.deepEqual(requests[0].body, { platform: 'mac', version: 'v1.2.3' });
  assert.equal(requests[0].keepalive, true);
  assert.equal(requests[0].method, 'POST');
  assert.match(mac.href, /app\.dmg$/);
  await elements.get('download-win').listeners.click({ type: 'click' });
  assert.deepEqual(requests[1].body, { platform: 'windows', version: null });
});

test('release and storage failures leave the fallback link usable', async () => {
  const { elements, requests } = await page({ releaseFails: true, storageFails: true });
  const mac = elements.get('download-mac');
  await mac.listeners.click({ type: 'click' });
  assert.equal(requests[0].body.version, null);
  assert.match(mac.href, /releases\/latest$/);
});

test('records middle clicks but ignores right clicks and unconfigured previews', async () => {
  const { elements, requests } = await page();
  const mac = elements.get('download-mac');
  await mac.listeners.auxclick({ type: 'auxclick', button: 2 });
  assert.equal(requests.length, 0);
  await mac.listeners.auxclick({ type: 'auxclick', button: 1 });
  assert.equal(requests.length, 1);
  const preview = await page({ configured: false });
  await preview.elements.get('download-mac').listeners.click({ type: 'click' });
  assert.equal(preview.requests.length, 0);
});
