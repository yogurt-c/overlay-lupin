/** Real shell / keyboard / worker smoke test, with duel packets relayed through IPC. */
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const { attachOverlayVisibility } = require('../dist/main/window.js');
const windows = [], errors = [];
let packets = 0;
app.on('window-all-closed', () => {});
ipcMain.handle('net:whoami', event => ({ id: String(event.sender.id), name: '오목 테스트' }));
ipcMain.handle('shortcuts:get', () => ({ hide: 'PageDown', show: 'PageUp' }));
ipcMain.handle('analytics:get', () => false);
ipcMain.on('net:pos', (event, packet) => {
  if (++packets % 5 === 0) return; // Deliberately lose every fifth snapshot/command.
  for (const w of windows) if (!w.isDestroyed() && w.webContents.id !== event.sender.id) w.webContents.send('net:opponent-state', packet);
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = (w, code) => w.webContents.executeJavaScript(code);
async function wait(w, expression) {
  for (let i = 0; i < 100; i++) { if (await run(w, expression)) return; await pause(50); }
  throw new Error('Timeout: ' + expression);
}
async function press(w, code) {
  await run(w, `window.dispatchEvent(new KeyboardEvent('keydown',{code:'${code}'}))`);
  await pause(35);
  await run(w, `window.dispatchEvent(new KeyboardEvent('keyup',{code:'${code}'}))`);
  await pause(35);
}
async function create(x) {
  const w = new BrowserWindow({ width:320, height:280, x, y:80, useContentSize:true, show:true, frame:false, transparent:true,
    webPreferences:{ preload:path.join(root,'dist/preload/preload.js'), contextIsolation:true, backgroundThrottling:false } });
  attachOverlayVisibility(w);
  windows.push(w);
  w.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  await w.loadFile(path.join(root, 'dist/renderer/index.html'));
  await run(w, `(async () => {
    const { gomokuModule } = await import('./games/gomoku/module.js');
    for (const name of ['createMatch','createSoloMatch']) {
      const make = gomokuModule[name]; gomokuModule[name] = (...args) => (window.testMatch = make(...args));
    }
    Math.random = () => 0;
    document.getElementById('idle-icon').click();
    [...document.querySelectorAll('#game-tabs button')].find(b => b.textContent === '오목').click();
  })()`);
  assert.equal(await run(w, `document.getElementById('versus-btn').textContent`), '같이하기');
  return w;
}
app.whenReady().then(async () => {
  const a = await create(80);
  await run(a, `document.getElementById('solo-btn').click()`);
  await press(a, 'Space'); // normal difficulty
  await press(a, 'Enter');
  assert.equal(await run(a, 'testMatch.current().turn'), 0);
  await press(a, 'Space');
  // Keep the pending response open while macOS finishes its hide animation.
  await run(a, 'testMatch.botDelay = 120');
  a.hide();
  await wait(a, 'testMatch.hidden');
  await pause(500);
  assert.equal(await run(a, 'testMatch.current().turn'), 1, 'native hide pauses solo AI');
  a.show();
  await wait(a, 'testMatch.current().turn === 2'); // Includes a real module Worker response.
  assert.equal(await run(a, 'testMatch.current().board[112]'), 1);
  fs.mkdirSync(path.join(root,'output/gomoku'), {recursive:true});
  fs.writeFileSync(path.join(root,'output/gomoku/solo.png'), (await a.webContents.capturePage()).toPNG());
  // Arrow navigation into the keyboard toolbar, then undo the human + AI pair.
  for (let i=0;i<8;i++) await press(a,'ArrowDown');
  await press(a,'ArrowRight'); await press(a,'Space');
  assert.equal(await run(a,'testMatch.current().turn'),0);
  // Leave via the existing confirmed shell button; then exercise a live duel.
  await run(a, `document.getElementById('leave-btn').click(); document.getElementById('leave-btn').click()`);
  assert.equal(await run(a, 'testMatch.disposed'),true);
  const b = await create(450);
  a.webContents.send('net:match-found',{peer:{id:'b',name:'상대'},isHost:true,gameId:'gomoku'});
  b.webContents.send('net:match-found',{peer:{id:'a',name:'상대'},isHost:false,gameId:'gomoku'});
  await wait(b,'testMatch && testMatch.current() !== null');
  await press(a,'Space'); await wait(b,'testMatch.current().turn === 1');
  await press(b,'ArrowRight'); await press(b,'Space'); await wait(a,'testMatch.current().turn === 2');
  await wait(b,'testMatch.current().turn === 2');
  assert.deepEqual(await run(a,'testMatch.current().board'),await run(b,'testMatch.current().board'));
  // Win through keyboard moves, with the opponent staying on a separate row.
  await press(b,'ArrowDown');
  for (let i=0;i<4;i++) {
    await press(a,'ArrowLeft'); await press(a,'Space');
    await wait(b,`testMatch.current().turn === ${3+i*2}`);
    if (i<3) { await press(b,'ArrowRight'); await press(b,'Space'); await wait(a,`testMatch.current().turn === ${4+i*2}`); }
  }
  await wait(b,'testMatch.current().result === 1');
  assert.equal(await run(a,'document.body.dataset.game'),'gomoku');
  fs.writeFileSync(path.join(root,'output/gomoku/duel-win.png'),(await a.webContents.capturePage()).toPNG());
  await press(a,'Space'); await press(b,'Space');
  await wait(a,'testMatch.current().round === 2'); await wait(b,'testMatch.current().round === 2');
  assert.equal(await run(a,'testMatch.current().black'),1);
  b.webContents.send('net:match-lost','timeout');
  await wait(b,'testMatch.disconnected');
  assert.equal(await run(b,'document.body.dataset.game'),'gomoku');
  await press(b,'Space'); await wait(b,"document.body.dataset.game === ''");
  assert.deepEqual(errors,[]);
  console.log('PASS: shell, arrows + Space, real AI Worker, undo, lossy duel, win, rematch and disconnect; screenshots in output/gomoku');
  for (const w of windows) w.destroy(); app.exit(0);
}).catch(error => { console.error(error); for (const w of windows) w.destroy(); app.exit(1); });
