import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../docs/site.js', import.meta.url), 'utf8').split("const commentStoreKey =")[1];
const comments = Array.from({ length: 63 }, (_, i) => ({ name: `user ${i}`, body: `comment ${i}` }));
async function page(count, local = false) {
  const elements = new Map();
  const makeElement = () => ({
    children: [], listeners: {}, disabled: false,
    append(...items) { this.children.push(...items); },
    replaceChildren() { this.children = []; },
    setAttribute() {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    querySelector() { return {}; },
    elements: { name: { value: 'new' }, body: { value: 'hello' } },
    reset() {},
  });
  let fail = false;
  const data = comments.slice(0, count);
  vm.runInNewContext(`const commentStoreKey =${source}`, {
    document: {
      getElementById(id) { if (!elements.has(id)) elements.set(id, makeElement()); return elements.get(id); },
      createElement: makeElement,
    },
    commentsConfig: { url: local ? '' : 'https://example.test', anonKey: 'test' },
    commentsApiUrl: 'https://example.test',
    localStorage: { getItem: () => JSON.stringify(data) },
    fetch: async (url, options) => {
      if (fail) throw new Error('offline');
      if (options.method === 'POST') { data.unshift({ name: 'new', body: 'hello' }); return { ok: true }; }
      const params = new URL(url).searchParams;
      const offset = Number(params.get('offset'));
      return { ok: true, json: async () => data.slice(offset, offset + Number(params.get('limit'))) };
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  return { get: id => elements.get(`comment-${id}`), form: elements.get('anonymous-comment-form'), fail: value => { fail = value; } };
}

test('ten comments per page, with access beyond the former 50-comment limit', async () => {
  const p = await page(63);
  assert.equal(p.get('list').children.length, 10);
  assert.equal(p.get('prev').disabled, true);
  for (let i = 0; i < 6; i++) await p.get('next').listeners.click();
  assert.equal(p.get('page').textContent, '7 페이지');
  assert.equal(p.get('list').children.length, 3);
  assert.equal(p.get('next').disabled, true);
  await p.get('prev').listeners.click();
  assert.equal(p.get('list').children.length, 10);
  assert.equal(p.get('list').children[0].children[0].textContent, 'user 50');
});

test('empty and exact ten-comment pages hide pagination', async () => {
  for (const count of [0, 10]) {
    const p = await page(count);
    assert.equal(p.get('pagination').hidden, true);
    assert.equal(p.get('list').children.length, count);
  }
});

test('failed navigation preserves the page and allows retry; posting returns to page one', async () => {
  const p = await page(23);
  p.fail(true);
  await p.get('next').listeners.click();
  assert.equal(p.get('page').textContent, '1 페이지');
  assert.equal(p.get('next').disabled, false);
  assert.match(p.get('status').textContent, /불러오지 못/);
  p.fail(false);
  await p.get('next').listeners.click();
  assert.equal(p.get('page').textContent, '2 페이지');
  await p.form.listeners.submit({ preventDefault() {} });
  assert.equal(p.get('page').textContent, '1 페이지');
  assert.equal(p.get('list').children[0].children[0].textContent, 'new');
});

test('local preview also paginates in groups of ten', async () => {
  const p = await page(11, true);
  assert.equal(p.get('list').children.length, 10);
  await p.get('next').listeners.click();
  assert.equal(p.get('list').children.length, 1);
  assert.equal(p.get('next').disabled, true);
});
