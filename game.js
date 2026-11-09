(() => {
  'use strict';
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = { start: $('startOverlay'), end: $('endOverlay'), startButton: $('startButton'), retry: $('retryButton'), toast: $('toast'), status: $('statusText'), sound: $('soundButton'), soundState: $('soundState'), soundIcon: $('soundIcon') };
  const DAY = new Date();
  const dateKey = `${DAY.getFullYear()}-${String(DAY.getMonth()+1).padStart(2,'0')}-${String(DAY.getDate()).padStart(2,'0')}`;
  const dateLabel = DAY.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: '2-digit' }).toUpperCase();
  const shortDate = DAY.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase();
  $('dateStamp').textContent = shortDate;
  $('fullDate').textContent = dateLabel;
  const stored = readRecord();
  renderRecord();
  const W = 1200, H = 760, DURATION = 120;
  let state = 'menu', lastFrame = 0, elapsed = 0, remaining = DURATION, lives = 3, rescued = 0, tags = 0;
  let player, hunters = [], friends = [], grass = [], buildings = [], trees = [], decor = [], rescueTarget = null;
  let toastTimer = 0, hitFlash = 0, soundOn = false, audioCtx = null;
  const keys = new Set(), touch = { x: 0, y: 0, action: false, dash: false };
  let seed = 0;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  function readRecord(){ try { return JSON.parse(localStorage.getItem('zero-hour-record') || '{}'); } catch { return {}; } }
  function renderRecord(){
    const r = readRecord();
    $('bestTime').textContent = r.best ? '02:00' : '--:--';
    $('streakCount').textContent = String(r.streak || 0);
    $('rescuedLifetime').textContent = `${r.rescues || 0} FRIEND${r.rescues === 1 ? '' : 'S'} RESCUED`;
    $('recordHint').textContent = r.best ? 'BEST RUN · FULL EXTRACTION' : 'YOUR FIRST RUN AWAITS';
    $('bestBar').style.width = r.best ? '100%' : '0%';
  }
  function random(){ seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function hashDate(){ let n=2166136261; for(const c of dateKey) n=Math.imul(n^c.charCodeAt(0),16777619); return n>>>0; }
  function resize(){
    const rect=canvas.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,2);
    if(!rect.width||!rect.height)return;
    const w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  }
  new ResizeObserver(resize).observe(canvas);
  function setupRun(){
    seed=hashDate(); elapsed=0;remaining=DURATION;lives=3;rescued=0;tags=0;hitFlash=0;rescueTarget=null;
    player={x:125,y:385,r:15,speed:162,stamina:100,dash:0,dashCd:0,freeze:0,invuln:0,dir:0,hidden:false,steps:0};
    friends=[{x:875,y:135,label:'MICA',rescued:false,captured:false,color:'#f7a963'}, {x:1158,y:540,label:'JUNE',rescued:false,captured:false,color:'#75d9c7'}, {x:575,y:642,label:'SOL',rescued:false,captured:false,color:'#c49aff'}];
    hunters=[{x:790,y:190,r:18,speed:82,dir:0,alert:0,target:null,tagCd:0,phase:random()*8,color:'#ef6a4e'}, {x:840,y:558,r:18,speed:77,dir:0,alert:0,target:null,tagCd:0,phase:random()*8,color:'#f18b58'}, {x:410,y:170,r:17,speed:74,dir:0,alert:0,target:null,tagCd:0,phase:random()*8,color:'#df6754'}];
    buildWorld(); state='playing';ui.start.classList.add('hidden');ui.end.classList.add('hidden');ui.status.textContent='OPERATION IN PROGRESS';say('FIND YOUR CREW. STAY OUT OF SIGHT.');
  }
  function buildWorld(){
    buildings=[];trees=[];grass=[];decor=[];
    const blocks=[
      [215,90,160,103],[465,87,176,112],[908,73,170,123],
      [64,253,165,128],[314,267,176,120],[586,262,175,119],[893,286,211,113],
      [192,502,190,108],[432,498,175,117],[728,490,165,117],[1001,470,140,111]
    ];
    for(let i=0;i<blocks.length;i++){const [x,y,w,h]=blocks[i];buildings.push({x,y,w,h,id:i,light:random()});}
    grass=[{x:287,y:205,r:48},{x:746,y:212,r:44},{x:432,y:397,r:57},{x:835,y:405,r:47},{x:490,y:670,r:46},{x:1120,y:225,r:39},{x:81,y:655,r:48}];
    for(let i=0;i<73;i++){
      const x=35+random()*1130,y=37+random()*686;
      if(buildings.some(b=>x>b.x-18&&x<b.x+b.w+18&&y>b.y-15&&y<b.y+b.h+15))continue;
      trees.push({x,y,r:7+random()*9,shade:random(),type:random()>.18?'tree':'bush'});
    }
    for(let i=0;i<190;i++) decor.push({x:random()*W,y:random()*H,a:random(),t:random()});
  }
  function startRun(){ if(soundOn)beep(420,.06); setupRun(); }
  ui.startButton.addEventListener('click',startRun);ui.retry.addEventListener('click',startRun);
  function say(text){ui.toast.textContent=text;ui.toast.classList.add('show');toastTimer=2.1;}
  function keyName(e){return e.key.toLowerCase();}
  addEventListener('keydown',e=>{const k=keyName(e);if(['arrowup','arrowdown','arrowleft','arrowright',' ','shift'].includes(k))e.preventDefault();keys.add(k);if(k===' '&&!e.repeat)dash();if(k==='enter'&&state!=='playing')startRun();});
  addEventListener('keyup',e=>keys.delete(keyName(e)));
  $('touchAction').addEventListener('pointerdown',e=>{e.preventDefault();touch.action=true;$('touchAction').setPointerCapture(e.pointerId);});
  $('touchAction').addEventListener('pointerup',()=>touch.action=false);$('touchAction').addEventListener('pointercancel',()=>touch.action=false);$('touchAction').addEventListener('lostpointercapture',()=>touch.action=false);
  $('touchDash').addEventListener('pointerdown',e=>{e.preventDefault();dash();});$('touchDash').addEventListener('pointerup',()=>{touch.dash=false;});$('touchDash').addEventListener('pointercancel',()=>{touch.dash=false;});
  const joy=$('joystick'),knob=$('joyKnob');let joyPointer=null;
  joy.addEventListener('pointerdown',e=>{e.preventDefault();joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);moveJoy(e);});
  joy.addEventListener('pointermove',e=>{if(e.pointerId===joyPointer)moveJoy(e);});
  joy.addEventListener('pointerup',endJoy);joy.addEventListener('pointercancel',endJoy);
  function moveJoy(e){const r=joy.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),m=Math.max(1,Math.hypot(dx,dy)),n=Math.min(m,23);touch.x=dx/m*n/23;touch.y=dy/m*n/23;knob.style.transform=`translate(${touch.x*22}px,${touch.y*22}px)`;}
  function endJoy(){joyPointer=null;touch.x=0;touch.y=0;knob.style.transform='';}
  function dash(){if(state!=='playing'||player.dashCd>0||player.stamina<17)return;player.dash=.19;player.dashCd=1.15;player.stamina=Math.max(0,player.stamina-17);if(soundOn)beep(260,.07);}
  $('soundButton').addEventListener('click',()=>{soundOn=!soundOn;ui.soundState.textContent=soundOn?'ON':'OFF';ui.soundIcon.textContent=soundOn?'♫':'♩';if(soundOn){audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();beep(510,.08);}});
  function beep(freq,duration){if(!audioCtx||!soundOn)return;try{const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(.035,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+duration);}catch{}}
  function update(dt){
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)ui.toast.classList.remove('show');}
    if(state!=='playing')return;
    elapsed+=dt;remaining=Math.max(0,DURATION-elapsed);hitFlash=Math.max(0,hitFlash-dt);
    if(player.invuln>0)player.invuln-=dt;if(player.dashCd>0)player.dashCd-=dt;if(player.freeze>0)player.freeze-=dt;
    let ix=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+touch.x;
    let iy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+touch.y;
    let mag=Math.hypot(ix,iy);if(mag>1){ix/=mag;iy/=mag;mag=1;}
    const sprint=(keys.has('shift')||touch.dash)&&mag>.1&&player.stamina>2&&player.freeze<=0;
    if(sprint)player.stamina=Math.max(0,player.stamina-27*dt);else player.stamina=Math.min(100,player.stamina+19*dt);
    player.hidden=grass.some(g=>Math.hypot(player.x-g.x,player.y-g.y)<g.r+4)&&!sprint&&mag<.55;
    let speed=sprint?player.speed*1.36:player.speed;
    if(player.dash>0){player.dash-=dt;speed=player.speed*3.1;}
    if(player.freeze>0){speed*=.22;if(keys.has('e')||touch.action){player.freeze=Math.max(0,player.freeze-2.3*dt);}}
    if(player.hidden)speed*=.76;
    if(mag>.04&&player.freeze<=0){player.dir=Math.atan2(iy,ix);player.x+=ix*speed*dt;player.y+=iy*speed*dt;player.steps+=dt*(sprint?1.9:1);}
    player.x=clamp(player.x,24,W-24);player.y=clamp(player.y,37,H-28);resolveBuildings(player);
    rescueTarget=null;
    for(const f of friends){if(f.rescued)continue;if(dist(player,f)<46){rescueTarget=f;break;}}
    const action=keys.has('e')||touch.action;
    if(rescueTarget&&action&&player.freeze<=0){rescueTarget.progress=(rescueTarget.progress||0)+dt;if(rescueTarget.progress>=1.15){rescueTarget.rescued=true;rescueTarget.captured=false;rescued++;rescueTarget.progress=0;say(`${rescueTarget.label} IS BACK IN THE GAME`);if(soundOn)beep(740,.12);}}
    else for(const f of friends)if(f.progress)f.progress=Math.max(0,f.progress-dt*.8);
    for(const h of hunters){
      h.phase+=dt;h.tagCd=Math.max(0,h.tagCd-dt);
      let target=player,near=dist(h,player);
      if(player.hidden&&near>100){let nearest=null,nd=Infinity;for(const f of friends){if(f.rescued||f.captured)continue;const d=dist(h,f);if(d<nd){nd=d;nearest=f;}}if(nearest&&nd<310)target=nearest;else target=null;}
      if(target){const d=dist(h,target);h.alert=d<285?Math.min(1,h.alert+dt*.7):Math.max(0,h.alert-dt*.25);if(d<350){h.target=target;h.dir=Math.atan2(target.y-h.y,target.x-h.x);const sp=h.speed*(d<130?1.13:1);h.x+=Math.cos(h.dir)*sp*dt;h.y+=Math.sin(h.dir)*sp*dt;}else wander(h,dt);}
      else {h.alert=Math.max(0,h.alert-dt*.2);wander(h,dt);}
      h.x=clamp(h.x,24,W-24);h.y=clamp(h.y,35,H-25);resolveBuildings(h);
      if(target===player&&dist(h,player)<h.r+player.r+4&&h.tagCd<=0&&player.invuln<=0&&player.dash<=0){tagPlayer(h);}
      if(target&&target!==player&&target.progress!==undefined&&dist(h,target)<h.r+13&&h.tagCd<=0){target.captured=true;target.progress=0;h.tagCd=3;say(`${target.label} WAS TAKEN — GET THEM BACK!`);}
    }
    if(player.freeze<=0&&player._wasFrozen){player._wasFrozen=false;player.invuln=1.6;say('BREAK FREE! KEEP MOVING');}
    if(player.freeze>0)player._wasFrozen=true;
    if(lives<=0){finish(false,'THE HUNTERS GOT YOU.');return;}
    if(remaining<=0){if(rescued===friends.length)finish(true,'YOU BROUGHT EVERYONE HOME.');else finish(false,'THE CITY WENT DARK.');}
  }
  function wander(h,dt){if(!h.wander||h.wander<=0){h.wander=1.5+random()*2;h.dir=random()*Math.PI*2;}h.wander-=dt;h.x+=Math.cos(h.dir)*h.speed*.24*dt;h.y+=Math.sin(h.dir)*h.speed*.24*dt;if(h.x<30||h.x>W-30||h.y<35||h.y>H-25)h.dir+=Math.PI*.8;}
  function resolveBuildings(entity){for(const b of buildings){const px=clamp(entity.x,b.x,b.x+b.w),py=clamp(entity.y,b.y,b.y+b.h),dx=entity.x-px,dy=entity.y-py,d=Math.hypot(dx,dy);if(d<entity.r&&d>0){entity.x+=dx/d*(entity.r-d);entity.y+=dy/d*(entity.r-d);}}}
  function tagPlayer(h){lives--;tags++;player.freeze=1.05;player._wasFrozen=true;player.invuln=1.25;h.tagCd=1.8;hitFlash=.25;if(soundOn)beep(130,.18);say(lives>0?'FROZEN! TAP E TO BREAK FREE':'LAST HEART — RUN!');}
  function finish(win,message){state=win?'won':'lost';ui.status.textContent=win?'CREW EXTRACTED':'SIGNAL LOST';$('endKicker').textContent=win?'OPERATION COMPLETE':'MISSION FAILED';$('endTitle').textContent=win?'CREW EXTRACTED':'FROZEN OUT';$('endMessage').textContent=message;$('endStats').innerHTML=`<div class="end-stat"><b>${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(Math.floor(elapsed%60)).padStart(2,'0')}</b><span>SURVIVED</span></div><div class="end-stat"><b>${rescued}/3</b><span>RESCUED</span></div><div class="end-stat"><b>${tags}</b><span>TAGS TAKEN</span></div>`;ui.end.classList.remove('hidden');if(win)saveWin();}
  function saveWin(){const r=readRecord(),yesterday=new Date(DAY);yesterday.setDate(yesterday.getDate()-1);const ykey=`${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;r.streak=r.lastDay===ykey?(r.streak||0)+1:r.lastDay===dateKey?(r.streak||1):1;r.lastDay=dateKey;r.rescues=(r.rescues||0)+rescued;r.best=true;try{localStorage.setItem('zero-hour-record',JSON.stringify(r));}catch{}renderRecord();}
  function rounded(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
  function drawWorld(){
    ctx.fillStyle='#19291f';ctx.fillRect(0,0,W,H);
    for(const d of decor){ctx.globalAlpha=.12+d.a*.18;ctx.fillStyle=d.t>.5?'#718044':'#98a361';ctx.fillRect(d.x,d.y,1+d.a*2,1+d.a*2);}ctx.globalAlpha=1;
    // Quiet residential streets cut the overgrown block into narrow lanes.
    ctx.lineCap='round';ctx.lineJoin='round';
    for(const x of [405,865]){ctx.strokeStyle='#26312a';ctx.lineWidth=68;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();ctx.strokeStyle='#303c32';ctx.lineWidth=60;ctx.stroke();ctx.strokeStyle='#586047';ctx.lineWidth=1;ctx.setLineDash([12,16]);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();ctx.setLineDash([]);}
    for(const y of [230,458]){ctx.strokeStyle='#26312a';ctx.lineWidth=66;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();ctx.strokeStyle='#303c32';ctx.lineWidth=58;ctx.stroke();ctx.strokeStyle='#586047';ctx.lineWidth=1;ctx.setLineDash([13,15]);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();ctx.setLineDash([]);}
    for(const g of grass){ctx.fillStyle='#35502d';ctx.globalAlpha=.8;ctx.beginPath();ctx.ellipse(g.x,g.y,g.r,g.r*.66,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.9;for(let i=0;i<20;i++){const a=i*2.4,r=g.r*(.25+(i%4)*.17),x=g.x+Math.cos(a)*r,y=g.y+Math.sin(a)*r*.65;ctx.strokeStyle=i%3?'#71874a':'#a0a762';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y+3);ctx.lineTo(x+Math.sin(a)*3,y-3);ctx.stroke();}ctx.globalAlpha=1;}
    for(const b of buildings)drawBuilding(b);
    for(const t of trees)drawTree(t);
    // Rendezvous marker: extraction starts when the timer expires and the crew is safe.
    ctx.save();ctx.translate(1132,681);ctx.strokeStyle='#d5fa5466';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,23+Math.sin(elapsed*3)*2,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#d5fa5425';ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d5fa54';ctx.fillRect(-2,-13,4,22);ctx.beginPath();ctx.moveTo(2,-13);ctx.lineTo(13,-9);ctx.lineTo(2,-5);ctx.fill();ctx.font='600 10px Chakra';ctx.fillStyle='#d7e1c4';ctx.textAlign='center';ctx.fillText('EXTRACT',0,35);ctx.restore();
  }
  function drawBuilding(b){
    ctx.save();ctx.shadowColor='#080c09';ctx.shadowBlur=12;ctx.shadowOffsetY=7;rounded(b.x,b.y,b.w,b.h,4,'#29352f','#435047');ctx.restore();
    rounded(b.x+5,b.y+5,b.w-10,b.h-10,3,['#344039','#303b35','#394139'][b.id%3],'#4b5548');
    ctx.fillStyle='#26322c';ctx.fillRect(b.x+8,b.y+8,b.w-16,9);
    for(let i=0;i<3;i++){const wx=b.x+20+i*((b.w-52)/3);ctx.fillStyle=(i===1&&b.light>.4)?'#a9ad6870':'#a3b99520';ctx.fillRect(wx,b.y+19,17,9);ctx.fillRect(wx,b.y+b.h-23,17,9);ctx.fillStyle='#4b5748';ctx.fillRect(wx+7,b.y+19,1,9);}
    ctx.strokeStyle='#66705a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(b.x+14,b.y+b.h*.5);ctx.lineTo(b.x+b.w-14,b.y+b.h*.5);ctx.stroke();
    ctx.fillStyle='#65705d';ctx.font='600 8px Chakra';ctx.textAlign='center';ctx.fillText(['LAUNDROMAT','BLOCK 04','CORNER STORE','CLINIC','BUS DEPOT','APARTMENTS','NIGHT MARKET','GARAGE','COMMUNITY HALL','FLATS','OLD STATION'][b.id],b.x+b.w/2,b.y+b.h*.5+3);
    ctx.fillStyle='#b9cc9e';ctx.globalAlpha=.26;ctx.fillRect(b.x+b.w-17,b.y+13,5,3);ctx.globalAlpha=1;
  }
  function drawTree(t){ctx.save();ctx.translate(t.x,t.y);if(t.type==='bush'){ctx.fillStyle='#263b29';ctx.beginPath();ctx.ellipse(0,3,t.r*1.25,t.r*.72,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#50673a';ctx.beginPath();ctx.arc(-t.r*.35,0,t.r*.62,0,7);ctx.arc(t.r*.35,-2,t.r*.66,0,7);ctx.fill();}else{ctx.fillStyle='#382f22';ctx.fillRect(-2,1,4,t.r*.7);ctx.fillStyle=t.shade>.5?'#263b2b':'#30432d';ctx.beginPath();ctx.arc(0,-2,t.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#52633b';ctx.globalAlpha=.72;ctx.beginPath();ctx.arc(-t.r*.25,-t.r*.24,t.r*.47,0,Math.PI*2);ctx.fill();}ctx.restore();}
  function drawPerson(p,type){
    ctx.save();ctx.translate(p.x,p.y);
    if(type==='hunter'){
      ctx.shadowColor='#f26a4c';ctx.shadowBlur=p.alert?20:9;ctx.fillStyle='#111817';ctx.beginPath();ctx.arc(0,2,p.r+4,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      ctx.fillStyle='#d65d4c';ctx.beginPath();ctx.arc(0,1,p.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f28461';ctx.beginPath();ctx.arc(-4,-5,7,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#f2d5a5';ctx.fillRect(-7,-3,4,3);ctx.fillRect(3,-3,4,3);ctx.fillStyle='#161a17';ctx.fillRect(-6,-2,2,2);ctx.fillRect(4,-2,2,2);
      if(p.alert>.18){ctx.strokeStyle='#f98b6a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,p.r+6+Math.sin(elapsed*8)*2,-2.5,-.7);ctx.stroke();}
    }else if(type==='frozen'){
      ctx.fillStyle=p.captured?'#f2735633':'#74cbe333';ctx.beginPath();ctx.arc(0,0,p.r+8,0,Math.PI*2);ctx.fill();ctx.fillStyle=p.captured?'#d76c58':'#59b8c2';ctx.beginPath();ctx.arc(0,0,p.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#baf5e9';ctx.beginPath();ctx.arc(-4,-5,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#15353a';ctx.fillRect(-6,-2,3,2);ctx.fillRect(3,-2,3,2);
      ctx.strokeStyle='#d3fff2';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-p.r-9);ctx.lineTo(0,p.r+9);ctx.moveTo(-p.r-8,0);ctx.lineTo(p.r+8,0);ctx.moveTo(-6,-6);ctx.lineTo(6,6);ctx.stroke();
    }else{
      const color=type==='player'?(player.invuln>0&&Math.floor(elapsed*16)%2?'#ffffff':'#d5fa54'):p.color;
      ctx.fillStyle='#070d0b88';ctx.beginPath();ctx.ellipse(1,9,p.r+4,p.r*.72,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=type==='player'?'#19221a':'#17211f';ctx.beginPath();ctx.arc(0,0,p.r+2,0,Math.PI*2);ctx.fill();ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,-1,p.r-2,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#f6e5bb';ctx.beginPath();ctx.arc(-4,-5,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#16231b';ctx.fillRect(-5,-3,2,2);ctx.fillRect(3,-3,2,2);
      if(type==='player'){ctx.strokeStyle='#efffa0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,p.r+5,player.dir-.65,player.dir+.65);ctx.stroke();}
    }
    ctx.restore();
    if(type==='frozen'&&p.label&&!p.rescued){ctx.font='600 8px Chakra';ctx.textAlign='center';ctx.fillStyle=p.captured?'#ff9b78':'#a9e3dc';ctx.fillText(p.captured?`${p.label} · TAKEN`:p.label,p.x,p.y+28);if(p.progress>0){ctx.strokeStyle='#d5fa54';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,p.r+12,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,p.progress/1.15));ctx.stroke();}}
  }
  function drawHud(w,h){
    const pad=14, mmW=112, mmH=71;
    rounded(pad,pad,186,57,3,'#0a1312dd','#60705d');
    ctx.fillStyle='#94a49a';ctx.font='600 8px Chakra';ctx.textAlign='left';ctx.fillText('TIME TO EXTRACT',pad+11,pad+15);
    ctx.fillStyle=remaining<20?'#ff8b67':'#eff1df';ctx.font='700 25px Chakra';ctx.fillText(`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(Math.floor(remaining%60)).padStart(2,'0')}`,pad+10,pad+42);
    ctx.fillStyle='#91a092';ctx.font='600 8px Chakra';ctx.fillText('CREW',pad+104,pad+16);
    for(let i=0;i<friends.length;i++){ctx.fillStyle=friends[i].rescued?'#d5fa54':friends[i].captured?'#f27356':'#53b9bc';ctx.beginPath();ctx.arc(pad+109+i*17,pad+33,5,0,Math.PI*2);ctx.fill();ctx.strokeStyle=friends[i].rescued?'#efffac':'#a2e3dc';ctx.lineWidth=1;ctx.stroke();}
    ctx.fillStyle='#9aa59a';ctx.font='600 7px Chakra';ctx.fillText(`${rescued} / 3 SAFE`,pad+101,pad+50);
    rounded(w-mmW-pad,pad,mmW,mmH,3,'#0a1312dd','#60705d');
    const mx=w-mmW-pad+7,my=pad+7,mw=mmW-14,mh=mmH-14;
    ctx.fillStyle='#223429';ctx.fillRect(mx,my,mw,mh);
    for(const b of buildings){ctx.fillStyle='#526054';ctx.fillRect(mx+b.x/W*mw,my+b.y/H*mh,b.w/W*mw,b.h/H*mh);}
    for(const f of friends){if(f.rescued)continue;ctx.fillStyle=f.captured?'#f27356':'#73e0d1';ctx.beginPath();ctx.arc(mx+f.x/W*mw,my+f.y/H*mh,2.4,0,Math.PI*2);ctx.fill();}
    for(const hu of hunters){ctx.fillStyle='#fa795d';ctx.beginPath();ctx.arc(mx+hu.x/W*mw,my+hu.y/H*mh,2.5,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#d5fa54';ctx.beginPath();ctx.arc(mx+player.x/W*mw,my+player.y/H*mh,3,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#0a1312dd';ctx.fillRect(pad,h-pad-22,140,12);ctx.fillStyle='#78867b';ctx.font='600 7px Chakra';ctx.fillText('STAMINA',pad+1,h-pad-26);
    ctx.fillStyle=player.stamina<24?'#f77a50':'#d5fa54';ctx.fillRect(pad+3,h-pad-19,134*player.stamina/100,6);
    ctx.fillStyle='#0a1312dd';ctx.fillRect(w-pad-74,h-pad-31,74,25);ctx.fillStyle='#96a296';ctx.font='600 7px Chakra';ctx.textAlign='right';ctx.fillText('HEARTS',w-pad-7,h-pad-22);
    ctx.textAlign='left';for(let i=0;i<3;i++){drawHeart(w-pad-65+i*20,h-pad-11,i<lives?'#f77a50':'#534644');}
    if(player.hidden){ctx.fillStyle='#d5fa54';ctx.font='600 9px Chakra';ctx.textAlign='center';ctx.fillText('HIDDEN IN THE GRASS',w/2,24);}
    if(rescueTarget&&!rescueTarget.rescued){ctx.fillStyle='#d5fa54';ctx.font='600 10px Chakra';ctx.textAlign='center';ctx.fillText((keys.has('e')||touch.action)?`THAWING ${rescueTarget.label}…`:`HOLD E TO THAW ${rescueTarget.label}`,w/2,h-48);}
    if(player.freeze>0){ctx.fillStyle='#64cad9';ctx.font='700 14px Chakra';ctx.textAlign='center';ctx.fillText('FROZEN — TAP E TO BREAK FREE',w/2,h*.46);}
    ctx.textAlign='left';
  }
  function drawHeart(x,y,color){ctx.save();ctx.translate(x,y);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,6);ctx.bezierCurveTo(-14,-3,-5,-11,0,-5);ctx.bezierCurveTo(6,-12,14,-3,0,6);ctx.fill();ctx.restore();}
  function render(){
    resize();const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),cw=rect.width,ch=rect.height;
    if(!cw||!ch)return;
    ctx.setTransform(dpr*cw/W,0,0,dpr*ch/H,0,0);drawWorld();
    for(const f of friends){if(f.rescued)continue;if(!f.captured&&dist(player||{x:0,y:0},f)<110){ctx.strokeStyle='#77d7d066';ctx.lineWidth=1;ctx.setLineDash([3,5]);ctx.beginPath();ctx.arc(f.x,f.y,26,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}drawPerson(f,'frozen');}
    for(const h of hunters)drawPerson(h,'hunter');if(player)drawPerson(player,'player');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if(state==='playing')drawHud(cw,ch);
    if(hitFlash>0){ctx.fillStyle=`rgba(240,83,60,${hitFlash*.35})`;ctx.fillRect(0,0,cw,ch);}
  }
  function loop(now){const dt=Math.min(.04,(now-lastFrame)/1000||0);lastFrame=now;update(dt);render();requestAnimationFrame(loop);}
  requestAnimationFrame(loop);
})();
