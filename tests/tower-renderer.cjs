/** Real Electron shell + Canvas smoke test; LAN transport is relayed in-process here. */
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
app.on('window-all-closed', () => {});
const root = path.resolve(__dirname, '..');
const windows = [];
const errors = [];
let packetCount = 0, maxPacketBytes = 0;
ipcMain.handle('net:whoami', event => ({ id: String(event.sender.id), name: 'Tower test' }));
ipcMain.handle('shortcuts:get', () => ({ hide: 'PageDown', show: 'PageUp' }));
ipcMain.on('net:pos', (event, payload) => {
  packetCount++;
  maxPacketBytes = Math.max(maxPacketBytes, Buffer.byteLength(JSON.stringify(payload)));
  for (const w of windows) if (!w.isDestroyed() && w.webContents.id !== event.sender.id) w.webContents.send('net:opponent-state', payload);
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(w, expression, label, attempts = 120) {
  for (let i = 0; i < attempts; i++) {
    if (await w.webContents.executeJavaScript(expression)) return;
    await pause(50);
  }
  throw new Error(`Timed out: ${label}`);
}
async function create() {
  const w = new BrowserWindow({ width: 320, height: 280, useContentSize: true, show: false, frame: false, transparent: true,
    webPreferences: { preload: path.join(root, 'dist/preload/preload.js'), contextIsolation: true, backgroundThrottling: false } });
  windows.push(w);
  w.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  await w.loadFile(path.join(root, 'dist/renderer/index.html'));
  await w.webContents.executeJavaScript(`document.getElementById('idle-icon').click()`);
  await waitFor(w, `document.querySelectorAll('#game-tabs button').length === 7`, 'seven game entries');
  return w;
}
async function startSolo(w, draw) {
  await w.webContents.executeJavaScript(`(() => {
    const random = Math.random;
    Math.random = () => ${draw};
    try { document.getElementById('solo-btn').click(); }
    finally { Math.random = random; }
  })()`);
}
async function press(w, code) {
  await w.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{code:${JSON.stringify(code)}}))`);
  await pause(35);
  await w.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keyup',{code:${JSON.stringify(code)}}))`);
}
app.whenReady().then(async () => {
  const extreme = await create();
  // Exercise every Path2D, then capture enlarged and actual-size new pieces for visual review.
  const lineup = await extreme.webContents.executeJavaScript(`(async () => {
    const { ANIMALS } = await import('./games/tower/animals.js');
    const { GEOMETRY } = await import('./games/tower/geometry.js');
    const { drawAnimal } = await import('./games/tower/draw.js');
    const canvas = document.createElement('canvas');
    canvas.width = 960; canvas.height = 620;
    const ctx = canvas.getContext('2d');
    ANIMALS.forEach((_, kind) => drawAnimal(ctx, kind, 100, 100, Math.PI / 3, '#14181a'));
    ctx.fillStyle = '#f5f2e9'; ctx.fillRect(0, 0, 960, 620);
    ctx.fillStyle = '#14181a'; ctx.textAlign = 'center'; ctx.font = '22px sans-serif';
    ctx.fillText('동물탑 · 신규 7종 실제 게임 그림', 480, 36);
    const ids = ['sloth', 'pillbug', 'camel', 'toucan', 'gorilla', 'frog', 'pangolin', 'hedgehog'];
    ids.forEach((id, i) => {
      const kind = ANIMALS.findIndex(a => a.id === id), x = 120 + i % 4 * 240, y = 160 + Math.floor(i / 4) * 280;
      drawAnimal(ctx, kind, x, y, 0, '#14181a', 125 / GEOMETRY[kind].extent);
      drawAnimal(ctx, kind, x, y + 104, 0, '#14181a');
      ctx.fillStyle = '#14181a'; ctx.font = '15px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(ANIMALS[kind].label + ' · ' + GEOMETRY[kind].extent + 'px', x, y - 82);
    });
    return canvas.toDataURL('image/png').split(',')[1];
  })()`);
  fs.writeFileSync(path.join(require('node:os').tmpdir(), 'overlay-lupin-tower-lineup.png'), Buffer.from(lineup, 'base64'));
  await extreme.webContents.executeJavaScript(`[...document.querySelectorAll('#game-tabs button')].find(b=>b.textContent==='동물탑').click()`);
  assert.equal(await extreme.webContents.executeJavaScript(`document.getElementById('variant-choice').hidden`), false, '동물탑 offers rules');
  await extreme.webContents.executeJavaScript(`[...document.querySelectorAll('#game-tabs button')].find(b=>b.textContent==='축구').click()`);
  assert.equal(await extreme.webContents.executeJavaScript(`document.getElementById('variant-choice').hidden`), true, 'a game without variants has no chooser');
  await extreme.webContents.executeJavaScript(`[...document.querySelectorAll('#game-tabs button')].find(b=>b.textContent==='동물탑').click(); [...document.querySelectorAll('#variant-choice button')].find(b=>b.textContent==='극한').click()`);
  await startSolo(extreme, 0.25);
  await waitFor(extreme, `document.getElementById('score').textContent.includes('극한')`, '극한 HUD');
  // Nobody touches the keyboard here: the five-second fuse has to place the animal on its own.
  await waitFor(extreme, `document.getElementById('score').textContent.includes('1마리')`, 'fuse places the animal unaided', 240);
  fs.writeFileSync(path.join(require('node:os').tmpdir(), 'overlay-lupin-tower-extreme.png'), (await extreme.webContents.capturePage()).toPNG());
  extreme.destroy();

  const solo = await create();
  await solo.webContents.executeJavaScript(`[...document.querySelectorAll('#game-tabs button')].find(b=>b.textContent==='동물탑').click()`);
  await startSolo(solo, 0.25);
  await waitFor(solo, `document.getElementById('score').textContent.includes('내 차례')`, 'solo HUD');
  await press(solo, 'Space');
  await waitFor(solo, `document.getElementById('score').textContent.includes('1마리')`, 'solo stable landing');
  await waitFor(solo, `document.getElementById('score').textContent.includes('봇 차례')`, 'bot turn visible');
  await waitFor(solo, `document.getElementById('score').textContent.includes('2마리') || (!document.getElementById('banner').hidden && document.getElementById('banner').textContent === '승리')`, 'bot places and settles or loses', 240);
  assert.equal(packetCount, 0, 'bot match stays local');
  fs.writeFileSync(path.join(require('node:os').tmpdir(), 'overlay-lupin-tower-gameplay.png'), (await solo.webContents.capturePage()).toPNG());
  // Exercise renderer resize as well as camera/canvas transforms.
  solo.setContentSize(160, 140); await pause(100);
  assert.equal(await solo.webContents.executeJavaScript('innerWidth'), 160);
  solo.destroy();

  const botFirst = await create();
  await botFirst.webContents.executeJavaScript(`[...document.querySelectorAll('#game-tabs button')].find(b=>b.textContent==='동물탑').click()`);
  await startSolo(botFirst, 0.75);
  await waitFor(botFirst, `document.getElementById('score').textContent.includes('봇 차례')`, 'bot wins opening draw');
  await waitFor(botFirst, `document.getElementById('score').textContent.includes('1마리') && document.getElementById('score').textContent.includes('내 차례')`, 'bot opens unaided and hands over', 240);
  botFirst.destroy();

  // The rule travels with the invite: whichever side ends up hosting runs the inviter's pick.
  const invited = await create();
  invited.webContents.send('net:match-found', { peer: { id: 'zzz' }, isHost: true, gameId: 'tower', variant: 'extreme' });
  await waitFor(invited, `document.getElementById('score').textContent.includes('극한')`, 'invited rule reaches the host');
  invited.destroy();
  const nonsense = await create();
  nonsense.webContents.send('net:match-found', { peer: { id: 'zzz' }, isHost: true, gameId: 'tower', variant: 'no-such-rule' });
  await waitFor(nonsense, `/내 차례|상대 차례/.test(document.getElementById('score').textContent)`, 'unknown rule still starts');
  assert.ok(!(await nonsense.webContents.executeJavaScript(`document.getElementById('score').textContent`)).includes('극한'),
    'an unrecognised rule falls back to the default');
  nonsense.destroy();

  for (const draw of [0.25, 0.75]) {
    const host = await create(), guest = await create();
    await host.webContents.executeJavaScript(`window.testRandom = Math.random; Math.random = () => ${draw}; void 0`);
    host.webContents.send('net:match-found', { peer: { id: 'guest' }, isHost: true, gameId: 'tower' });
    guest.webContents.send('net:match-found', { peer: { id: 'host' }, isHost: false, gameId: 'tower' });
    const first = draw < 0.5 ? host : guest, second = draw < 0.5 ? guest : host;
    await waitFor(first, `document.getElementById('score').textContent.includes('내 차례')`, 'drawn starter sees own turn');
    await waitFor(second, `document.getElementById('score').textContent.includes('상대 차례')`, 'opponent sees same opening draw');
    await host.webContents.executeJavaScript(`Math.random = window.testRandom; delete window.testRandom`);
    // The waiting player cannot place the opening block.
    await press(second, 'Space');
    assert.ok((await first.webContents.executeJavaScript(`document.getElementById('score').textContent`)).includes('0마리'));
    await press(first, 'Space');
    await waitFor(second, `document.getElementById('score').textContent.includes('내 차례')`, 'opening drop hands over');
    const traded = await second.webContents.executeJavaScript(`document.getElementById('score').textContent`);
    await press(second, 'KeyR');
    await pause(200);
    assert.equal(await second.webContents.executeJavaScript(`document.getElementById('score').textContent`), traded);
    // Deliberate miss through the real preload + IPC + shell, with either side owning it.
    await second.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowRight'}))`);
    await pause(1700);
    await second.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowRight'}))`);
    await press(second, 'Space');
    await waitFor(second, `document.getElementById('banner').textContent === '패배' && !document.getElementById('banner').hidden`, 'second player loses');
    await waitFor(first, `document.getElementById('banner').textContent === '승리' && !document.getElementById('banner').hidden`, 'starter wins');
    host.destroy(); guest.destroy();
  }
  assert.ok(packetCount > 0); assert.ok(maxPacketBytes < 1200);
  assert.deepEqual(errors, []);
  console.log(`PASS Electron: rule chooser, 극한 fuse placing unaided, invited rule honoured, human/bot opening draws, resize, host/guest opening draws and win/loss; ${packetCount} packets, max ${maxPacketBytes} bytes`);
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
