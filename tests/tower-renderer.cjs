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
async function press(w, code) {
  await w.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{code:${JSON.stringify(code)}}))`);
  await pause(35);
  await w.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keyup',{code:${JSON.stringify(code)}}))`);
}
app.whenReady().then(async () => {
  const extreme = await create();
  await extreme.webContents.executeJavaScript(`[...document.querySelectorAll('#game-tabs button')].find(b=>b.textContent==='동물탑').click()`);
  assert.equal(await extreme.webContents.executeJavaScript(`document.getElementById('variant-choice').hidden`), false, '동물탑 offers rules');
  await extreme.webContents.executeJavaScript(`[...document.querySelectorAll('#game-tabs button')].find(b=>b.textContent==='축구').click()`);
  assert.equal(await extreme.webContents.executeJavaScript(`document.getElementById('variant-choice').hidden`), true, 'a game without variants has no chooser');
  await extreme.webContents.executeJavaScript(`[...document.querySelectorAll('#game-tabs button')].find(b=>b.textContent==='동물탑').click(); [...document.querySelectorAll('#variant-choice button')].find(b=>b.textContent==='극한').click(); document.getElementById('solo-btn').click()`);
  await waitFor(extreme, `document.getElementById('score').textContent.includes('극한')`, '극한 HUD');
  // Nobody touches the keyboard here: the five-second fuse has to place the animal on its own.
  await waitFor(extreme, `document.getElementById('score').textContent.includes('1마리')`, 'fuse places the animal unaided', 240);
  fs.writeFileSync(path.join(require('node:os').tmpdir(), 'overlay-lupin-tower-extreme.png'), (await extreme.webContents.capturePage()).toPNG());
  extreme.destroy();

  const solo = await create();
  await solo.webContents.executeJavaScript(`[...document.querySelectorAll('#game-tabs button')].find(b=>b.textContent==='동물탑').click(); document.getElementById('solo-btn').click()`);
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

  // The rule travels with the invite: whichever side ends up hosting runs the inviter's pick.
  const invited = await create();
  invited.webContents.send('net:match-found', { peer: { id: 'zzz' }, isHost: true, gameId: 'tower', variant: 'extreme' });
  await waitFor(invited, `document.getElementById('score').textContent.includes('극한')`, 'invited rule reaches the host');
  invited.destroy();
  const nonsense = await create();
  nonsense.webContents.send('net:match-found', { peer: { id: 'zzz' }, isHost: true, gameId: 'tower', variant: 'no-such-rule' });
  await waitFor(nonsense, `document.getElementById('score').textContent.includes('내 차례')`, 'unknown rule still starts');
  assert.ok(!(await nonsense.webContents.executeJavaScript(`document.getElementById('score').textContent`)).includes('극한'),
    'an unrecognised rule falls back to the default');
  nonsense.destroy();

  const host = await create(), guest = await create();
  host.webContents.send('net:match-found', { peer: { id: 'guest' }, isHost: true, gameId: 'tower' });
  guest.webContents.send('net:match-found', { peer: { id: 'host' }, isHost: false, gameId: 'tower' });
  await waitFor(guest, `document.getElementById('score').textContent.includes('상대 차례')`, 'guest snapshot');
  await press(host, 'Space');
  await waitFor(guest, `document.getElementById('score').textContent.includes('내 차례')`, 'guest turn');
  // An animal-change token travels the same client path and must not stall the aim it pauses.
  const traded = await guest.webContents.executeJavaScript(`document.getElementById('score').textContent`);
  await press(guest, 'KeyR');
  await pause(200);
  assert.equal(await guest.webContents.executeJavaScript(`document.getElementById('score').textContent`), traded);
  // Deliberate miss: client controls travel through the real preload + IPC + shell callbacks.
  await guest.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowRight'}))`);
  await pause(1700);
  await guest.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowRight'}))`);
  await press(guest, 'Space');
  await waitFor(guest, `document.getElementById('banner').textContent === '패배' && !document.getElementById('banner').hidden`, 'guest loses');
  await waitFor(host, `document.getElementById('banner').textContent === '승리' && !document.getElementById('banner').hidden`, 'host wins');
  assert.ok(packetCount > 0); assert.ok(maxPacketBytes < 1200);
  assert.deepEqual(errors, []);
  console.log(`PASS Electron: rule chooser, 극한 fuse placing unaided, invited rule honoured, solo bot turn and placement, resize, two-window duel, guest loss / host win; ${packetCount} packets, max ${maxPacketBytes} bytes`);
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
