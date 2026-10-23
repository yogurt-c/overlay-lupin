/** Real 320×280 Electron shell smoke test for 곤충채집, plus art sheets for review. All saves are isolated in a temporary folder. */
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {InsectStore}=require('../dist/main/insect-store.js');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lupin-insect-ui-')),store=new InsectStore(directory);
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/insect'),errors=[];let win;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const reply=fn=>{try{return{ok:true,data:fn()};}catch(e){return{ok:false,error:e.message};}};
ipcMain.handle('net:whoami',()=>({id:'me',name:'테스트'}));ipcMain.handle('shortcuts:get',()=>({hide:'PageDown',show:'PageUp'}));ipcMain.handle('analytics:get',()=>false);
ipcMain.handle('insect:load',()=>reply(()=>store.load()));ipcMain.handle('insect:act',(_e,a)=>reply(()=>store.act(a)));
ipcMain.handle('insect:export',()=>({ok:false,cancelled:true}));ipcMain.handle('insect:import',()=>({ok:false,cancelled:true}));
const png=dataUrl=>Buffer.from(dataUrl.split(',')[1],'base64');
app.whenReady().then(async()=>{
  win=new BrowserWindow({width:320,height:280,useContentSize:true,frame:false,show:false,transparent:true,webPreferences:{preload:path.join(root,'dist/preload/preload.js'),contextIsolation:true,backgroundThrottling:false}});
  win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
  const js=code=>win.webContents.executeJavaScript(code);
  const frame=()=>js(`testMatch.render(document.getElementById('field').getContext('2d'),{width:320,height:280,pixelRatio:devicePixelRatio})`);
  const shot=async name=>{await pause(60);fs.writeFileSync(path.join(out,name),(await win.webContents.capturePage()).toPNG());};
  fs.mkdirSync(out,{recursive:true});
  await win.loadFile(path.join(root,'dist/renderer/index.html'));
  await js(`document.getElementById('idle-icon').click(); [...document.querySelectorAll('#game-tabs button')].find(b=>b.textContent==='곤충채집').click(); document.getElementById('solo-btn').click()`);
  await pause(150);
  assert.equal(await js(`document.body.dataset.game`),'insect');
  assert.equal(await js(`document.querySelectorAll('#insect-ui').length`),1);
  assert.equal(await js(`(()=>{const r=document.getElementById('leave-btn').getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;let region='none';
    for(const n of document.querySelectorAll('body *')){const b=n.getBoundingClientRect();if(!n.getClientRects().length||x<b.left||x>b.right||y<b.top||y>b.bottom)continue;const v=getComputedStyle(n).webkitAppRegion;if(v&&v!=='none')region=v;}return region;})()`),'no-drag','leave button must not sit under a later drag region');
  await js(`document.querySelector('#leave-btn').click();document.querySelector('#leave-btn').click()`);assert.equal(await js(`document.querySelectorAll('#insect-ui').length`),0);
  // Art sheet: every species in the catalog plate style, normal and 금색 side by side, plus field sprites (idle, alert, flying).
  const sheet=await js(`(async()=>{const {SPECIES}=await import('../shared/insect.js');const {drawInsect,SIDE_VIEW}=await import('./games/insect/art.js');const {fieldSize}=await import('./games/insect/draw.js');
    const c=document.createElement('canvas'),cw=150,ch=104;c.width=cw*6;c.height=ch*10;const x=c.getContext('2d');x.fillStyle='#f4f0e6';x.fillRect(0,0,c.width,c.height);
    SPECIES.forEach((s,i)=>{const col=(i%3)*2,row=Math.floor(i/3),ox=col*cw,oy=row*ch;
      for(const g of [0,1])drawInsect(x,s,ox+g*cw+cw/2,oy+ch/2-6,78,{detail:true,golden:!!g},SIDE_VIEW.has(s.plan));
      ['idle','alert','fly'].forEach((pose,k)=>drawInsect(x,s,ox+14+k*24,oy+ch-14,fieldSize(s,s.maxMm),{pose,frame:k*4},SIDE_VIEW.has(s.plan)));
      x.font='11px sans-serif';x.fillStyle='#14181a';x.fillText(s.name,ox+4,oy+12);});
    return c.toDataURL();})()`);
  fs.writeFileSync(path.join(out,'art-sheet.png'),png(sheet));
  // Mount the real module with four collectors and a full field.
  await js(`(async()=>{ const {InsectMatch}=await import('./games/insect/module.js'); window.testMatch=new InsectMatch(true,'me','나'); document.body.dataset.game='insect'; })()`);
  await pause(150);
  await js(`testMatch.setMembers([{id:'f1',name:'모모'},{id:'f2',name:'초록'},{id:'f3',name:'하늘'}]); for(let i=0;i<400;i++)testMatch.step({});`);
  assert.equal(await js(`testMatch.engine.world.players.length`),4);
  assert.equal(await js(`testMatch.engine.world.bugs.filter(b=>b.state==='live').length`),6);
  // Put a golden insect right under my net, mid-glint, with the ring showing; one insect nearly startled, a friend emoting, another sneaking.
  await js(`{const w=testMatch.engine.world,me=w.players[0],b=w.bugs.find(b=>b.state==='live');me.x=b.x-.045;me.facing=1;b.golden=true;b.glintAt=w.tick+1;window.goldBug=b.id;
    const other=w.bugs.find(o=>o!==b&&o.state==='live');other.alert=85;w.players[1].emoji=1;w.players[1].emojiUntil=w.tick+100;w.players[2].sneak=true;w.players[2].walking=true;w.players[2].move=1;
    for(let i=0;i<4;i++)testMatch.engine.step();}`);
  await frame();await shot('field.png');
  await js(`document.body.style.background='#1b1d22'`);await frame();await shot('field-dark.png');await js(`document.body.style.background=''`);
  // Catch it inside the window through the real input path; the save goes through main-process IPC.
  await js(`{const w=testMatch.engine.world,me=w.players[0],b=w.bugs.find(b=>b.id===goldBug);b.timer=1e9;b.pauseUntil=1e9;
    for(let i=0;i<200&&Math.abs((w.tick+b.seed)%72-36)>3;i++)testMatch.step({});
    me.x=b.x-.045;me.facing=1;testMatch.step({swing:true});}`);
  assert.equal(await js(`testMatch.engine.world.players[0].phase`),'catch');
  await js(`for(let i=0;i<40;i++)testMatch.step({});`);await frame();await shot('catch.png');
  await js(`for(let i=0;i<30;i++)testMatch.step({});`);await pause(150);await js(`testMatch.step({});`);
  assert.equal(store.read().catches.length,1,'catch saved by real main-process IPC');assert.equal(store.read().catches[0].golden,true);
  assert.equal(await js(`testMatch.engine.world.players[0].phase`),'free','saved acknowledgement frees the collector');
  assert.ok(await js(`!document.querySelector('.bug-card').hidden && document.querySelector('.bug-card').textContent.includes('금색 첫 발견')`));
  await frame();await shot('result-card.png');
  // B brags from the card; the trophy shows over my head for everyone.
  await js(`testMatch.step({brag:true});for(let i=0;i<12;i++)testMatch.step({});`);
  assert.equal(await js(`testMatch.engine.world.players[0].shown?.golden`),true);
  await frame();await shot('brag.png');
  // C opens the notebook; the catalog lists all 30 with the gold counter.
  await js(`testMatch.step({collection:true});`);assert.equal(await js(`testMatch.ui.opened`),true);
  assert.ok(await js(`document.querySelector('#insect-ui .fish-stats').textContent.includes('도감 1/30 · 금색 1/30')`));
  await shot('collection.png');
  await js(`[...document.querySelectorAll('#insect-ui .fish-tab')].find(b=>b.textContent.startsWith('도감')).click()`);await shot('catalog.png');
  await js(`document.querySelector('#insect-ui .fish-card').click()`);await shot('detail.png');
  await js(`testMatch.step({collection:true});`);assert.equal(await js(`testMatch.ui.opened`),false);
  assert.deepEqual(errors,[]);
  console.log('insect renderer smoke test passed');app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
