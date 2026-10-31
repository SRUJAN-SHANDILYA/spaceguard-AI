(function(){
'use strict';
const $=id=>document.getElementById(id);
const {RE,TWO_PI,D2R,OMEGA_E}=SG;
const clamp=SG.clamp;
const EPOCH=Date.UTC(2026,9,31,0,0,0);
const pad=(n,w)=>String(Math.floor(n)).padStart(w||2,'0');
const fmtT=s=>{s=Math.max(0,s);return 'T+'+pad(s/3600)+':'+pad((s%3600)/60)+':'+pad(s%60);};
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtUTC=s=>{const d=new Date(EPOCH+s*1000);return d.getUTCDate()+' '+MON[d.getUTCMonth()]+' '+d.getUTCFullYear()+' '+pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())+' UTC';};
const SUP={'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
const fmtPc=p=>{if(!(p>1e-15))return '< 10⁻¹⁵';const q=p.toExponential(1).split('e');return q[0]+' × 10'+String(parseInt(q[1],10)).replace(/./g,c=>SUP[c]);};
const fmtDist=km=>km<1?(km*1000).toFixed(0)+' m':(km<100?km.toFixed(2)+' km':km.toFixed(0)+' km');
const fmtProp=g=>g<1000?g.toFixed(g<10?1:0)+' g':(g/1000).toFixed(2)+' kg';
const CLS={active:'Active satellite',defunct:'Defunct satellite',debris:'Debris',rocket:'Rocket body'};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- theme ---------- */
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let TH={};
function readTheme(){TH={bg:css('--bg'),stage:css('--stage'),line:css('--line'),fg:css('--fg'),muted:css('--muted'),accent:css('--accent'),ok:css('--ok'),warn:css('--warn'),crit:css('--crit'),earth:css('--earth'),grid:css('--grid'),surface2:css('--surface-2'),active:css('--c-active'),defunct:css('--c-defunct'),debris:css('--c-debris'),rocket:css('--c-rocket')};}
readTheme();
function themeChanged(){readTheme();drawPlots();}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',themeChanged);
new MutationObserver(themeChanged).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
$('themeBtn').addEventListener('click',()=>{
  const root=document.documentElement,cur=root.getAttribute('data-theme');
  const isDark=cur?cur==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.setAttribute('data-theme',isDark?'light':'dark');
});
function fit(c){
  const r=c.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
  const w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));
  if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  return {ctx:ctx,W:r.width,H:r.height};
}

/* ---------- catalogue ---------- */
const CAT=SG.buildCatalogue(2026);
const OBJ=CAT.list,byId=new Map(OBJ.map(o=>[o.id,o]));
const POS=new Array(OBJ.length),VEL=new Array(OBJ.length),SCR=new Array(OBJ.length);

/* ---------- tabs ---------- */
const TABS=['explorer','collision','decision','method'];
let curTab='explorer';
function show(name){
  if(!TABS.includes(name))name='explorer';
  curTab=name;
  TABS.forEach(t=>{$('p-'+t).hidden=t!==name;$('t-'+t).setAttribute('aria-selected',String(t===name));});
  if(name==='collision')renderCP();
  try{if(history.replaceState)history.replaceState(null,'','#'+name);}catch(err){try{location.hash=name;}catch(e2){}}
}
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>show(b.dataset.tab)));
window.addEventListener('hashchange',()=>{const h=location.hash.slice(1);if(TABS.includes(h)&&h!==curTab)show(h);});

/* =========================================================
   MODULE 1  Orbital Surveillance Explorer
   ========================================================= */
const ST={t:0,speed:60,playing:true,yaw:0.7,pitch:0.5,k:2.3,tk:2.3,sel:byId.get('SG-EO-002'),fc:{active:true,defunct:true,debris:true,rocket:true},fr:{LEO:true,MEO:true,GEO:true,HEO:true},q:''};
const gcv=$('globe');
const REG_LABEL={LEO:'Low Earth',MEO:'Medium Earth',GEO:'Geostationary',HEO:'Elliptical'};

function renderLegends(){
  const cnt=k=>OBJ.filter(o=>o.cls===k).length,rc=k=>OBJ.filter(o=>o.regime===k).length;
  $('clsLegend').innerHTML=Object.keys(CLS).map(k=>'<button type="button" class="tog" data-cls="'+k+'" aria-pressed="'+ST.fc[k]+'" style="--dot:var(--c-'+k+')"><i></i>'+CLS[k]+' <b>'+cnt(k)+'</b></button>').join('');
  $('regLegend').innerHTML=Object.keys(REG_LABEL).map(k=>'<button type="button" class="tog" data-reg="'+k+'" aria-pressed="'+ST.fr[k]+'" style="--dot:var(--muted)"><i></i>'+k+' <span class="dim" style="font-size:12px">'+REG_LABEL[k]+'</span> <b>'+rc(k)+'</b></button>').join('');
}
$('clsLegend').addEventListener('click',e=>{const b=e.target.closest('[data-cls]');if(!b)return;ST.fc[b.dataset.cls]=!ST.fc[b.dataset.cls];renderLegends();renderList();});
$('regLegend').addEventListener('click',e=>{const b=e.target.closest('[data-reg]');if(!b)return;ST.fr[b.dataset.reg]=!ST.fr[b.dataset.reg];renderLegends();renderList();});

function visibleObj(o){return ST.fc[o.cls]&&ST.fr[o.regime]&&(!ST.q||o.id.toLowerCase().includes(ST.q));}
function renderList(){
  const h=[];
  for(const o of OBJ){
    if(!visibleObj(o))continue;
    h.push('<button type="button" class="row" data-id="'+o.id+'" style="--dot:var(--c-'+o.cls+')"'+(ST.sel===o?' aria-current="true"':'')+'><i></i>'+o.id+'<span class="r">'+o.regime+'</span></button>');
  }
  $('objList').innerHTML=h.join('')||'<p class="note" style="padding:8px">No objects match the current filters.</p>';
}
$('objList').addEventListener('click',e=>{const b=e.target.closest('[data-id]');if(b)select(byId.get(b.dataset.id),false);});
$('search').addEventListener('input',e=>{ST.q=e.target.value.trim().toLowerCase();renderList();});

function select(o,scrollList){
  ST.sel=o;o._path=o._path||SG.orbitPath(o.el,240);
  renderInspector();
  document.querySelectorAll('#objList .row').forEach(r=>r.removeAttribute('aria-current'));
  const row=$('objList').querySelector('[data-id="'+o.id+'"]');
  if(row){row.setAttribute('aria-current','true');if(scrollList){const L=$('objList');L.scrollTop=row.offsetTop-L.clientHeight/2;}}
}
function renderInspector(){
  const o=ST.sel;if(!o){$('inspBody').innerHTML='<p class="note">Select an object on the globe or in the catalogue.</p>';return;}
  const el=o.el;
  $('inspBody').innerHTML=
   '<div class="insp-head"><strong>'+o.id+'</strong><span class="chip">'+o.regime+'</span></div>'+
   '<p class="note" style="margin:0 0 10px">'+CLS[o.cls]+' · '+esc(o.role)+(o.scenario?'. Constructed for the collision demo.':'')+'</p>'+
   '<dl class="kv">'+
   '<dt>Altitude now</dt><dd id="lvAlt">–</dd>'+
   '<dt>Speed now</dt><dd id="lvSpd">–</dd>'+
   '<dt>Perigee × apogee</dt><dd>'+Math.round(el.rp-RE)+' × '+Math.round(el.ra-RE)+' km</dd>'+
   '<dt>Inclination</dt><dd>'+(el.i/D2R).toFixed(2)+'°</dd>'+
   '<dt>Eccentricity</dt><dd>'+el.e.toFixed(4)+'</dd>'+
   '<dt>Period</dt><dd>'+(el.T/60).toFixed(1)+' min</dd>'+
   '<dt>RAAN</dt><dd>'+(el.raan/D2R).toFixed(1)+'°</dd>'+
   '<dt>Nearest object</dt><dd id="lvNear">–</dd></dl>'+
   '<div class="actions"><button type="button" class="btn primary sm" id="useAsPrim">Analyse as primary</button><button type="button" class="btn sm" id="useAsSec">Use as secondary</button></div>';
  $('useAsPrim').onclick=()=>{CP.prim=o.id;if(CP.sec===o.id)CP.sec=OBJ.find(x=>x!==o).id;syncCPControls();scan();show('collision');};
  $('useAsSec').onclick=()=>{CP.sec=o.id;if(CP.prim===o.id)CP.prim=OBJ.find(x=>x!==o).id;syncCPControls();scan();show('collision');};
}
function liveInspector(){
  const o=ST.sel;if(!o||!$('lvAlt'))return;const i=o.idx;if(!POS[i])return;
  $('lvAlt').textContent=(SG.norm(POS[i])-RE).toFixed(0)+' km';
  $('lvSpd').textContent=SG.norm(VEL[i]).toFixed(2)+' km/s';
  let best=Infinity,bj=-1;
  for(let j=0;j<OBJ.length;j++){if(j===i||!POS[j])continue;const d=SG.norm(SG.sub(POS[j],POS[i]));if(d<best){best=d;bj=j;}}
  $('lvNear').textContent=bj>=0?OBJ[bj].id+' · '+(best<100?best.toFixed(1):best.toFixed(0))+' km':'–';
}

$('viewSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;ST.tk=+b.dataset.k;syncViewSeg();});
function syncViewSeg(){document.querySelectorAll('#viewSeg button').forEach(b=>b.setAttribute('aria-pressed',String(Math.abs(+b.dataset.k-ST.tk)<0.01)));}
$('playBtn').addEventListener('click',()=>{ST.playing=!ST.playing;$('playBtn').textContent=ST.playing?'Pause':'Play';});
$('speedSel').addEventListener('change',e=>{ST.speed=+e.target.value;});
$('resetBtn').addEventListener('click',()=>{ST.t=0;});

/* pointer controls */
const ptrs=new Map();let moved=0,pinch0=0,k0=0;
gcv.addEventListener('pointerdown',e=>{gcv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});moved=0;gcv.style.cursor='grabbing';if(ptrs.size===2){const v=[...ptrs.values()];pinch0=Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y);k0=ST.tk;}});
gcv.addEventListener('pointermove',e=>{
  const p=ptrs.get(e.pointerId);if(!p)return;
  const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
  if(ptrs.size===1){moved+=Math.abs(dx)+Math.abs(dy);ST.yaw+=dx*0.006;ST.pitch=clamp(ST.pitch+dy*0.006,-1.45,1.45);}
  else if(ptrs.size===2){const v=[...ptrs.values()],d=Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y);if(pinch0>0&&d>0){ST.tk=clamp(k0*pinch0/d,1.3,9);syncViewSeg();}moved=99;}
});
function endPtr(e){
  if(!ptrs.has(e.pointerId))return;
  const wasOne=ptrs.size===1;ptrs.delete(e.pointerId);gcv.style.cursor='grab';
  if(wasOne&&moved<5&&e.type==='pointerup'){
    const r=gcv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;let best=14,bi=-1;
    for(let i=0;i<SCR.length;i++){const q=SCR[i];if(!q)continue;const d=Math.hypot(q[0]-x,q[1]-y);if(d<best){best=d;bi=i;}}
    if(bi>=0)select(OBJ[bi],true);
  }
}
gcv.addEventListener('pointerup',endPtr);gcv.addEventListener('pointercancel',endPtr);
gcv.addEventListener('wheel',e=>{e.preventDefault();ST.tk=clamp(ST.tk*Math.exp(e.deltaY*0.0012),1.3,9);syncViewSeg();},{passive:false});

function drawGlobe(){
  const f=fit(gcv),ctx=f.ctx,W=f.W,H=f.H;if(W<10||H<10)return;
  ctx.clearRect(0,0,W,H);
  ST.k+=(ST.tk-ST.k)*0.2;
  const S=Math.min(W,H)/2/(RE*ST.k),cx=W/2,cy=H/2;
  const cyw=Math.cos(ST.yaw),syw=Math.sin(ST.yaw),cp=Math.cos(ST.pitch),sp=Math.sin(ST.pitch);
  const P=(x,y,z)=>{const x1=x*cyw-y*syw,y1=x*syw+y*cyw,up=y1*sp+z*cp,dp=-y1*cp+z*sp;return [cx+x1*S,cy-up*S,dp,x1,up];};
  const R2=RE*RE;
  ctx.fillStyle=TH.earth;ctx.strokeStyle=TH.line;ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(cx,cy,RE*S,0,TWO_PI);ctx.fill();ctx.stroke();
  const th=OMEGA_E*ST.t;
  const strokeRun=pts=>{ctx.beginPath();let pen=false;for(const q of pts){if(q[2]>0){if(!pen){ctx.moveTo(q[0],q[1]);pen=true;}else ctx.lineTo(q[0],q[1]);}else pen=false;}ctx.stroke();};
  ctx.lineWidth=1;ctx.strokeStyle=TH.grid;ctx.globalAlpha=0.5;
  for(let lon=0;lon<360;lon+=30){const pts=[];for(let lat=-90;lat<=90;lat+=6){const a=lat*D2R,b=lon*D2R+th;pts.push(P(RE*Math.cos(a)*Math.cos(b),RE*Math.cos(a)*Math.sin(b),RE*Math.sin(a)));}strokeRun(pts);}
  for(let lat=-60;lat<=60;lat+=30){
    const pts=[],a=lat*D2R;for(let lon=0;lon<=360;lon+=6){const b=lon*D2R+th;pts.push(P(RE*Math.cos(a)*Math.cos(b),RE*Math.cos(a)*Math.sin(b),RE*Math.sin(a)));}
    if(lat===0){ctx.globalAlpha=0.9;ctx.strokeStyle=TH.accent;}else{ctx.globalAlpha=0.5;ctx.strokeStyle=TH.grid;}
    strokeRun(pts);
  }
  ctx.globalAlpha=1;
  const groups={active:[],defunct:[],debris:[],rocket:[]};
  for(let i=0;i<OBJ.length;i++){
    const o=OBJ[i],s=SG.propagate(o.el,ST.t);POS[i]=s.r;VEL[i]=s.v;SCR[i]=null;
    if(!(ST.fc[o.cls]&&ST.fr[o.regime]))continue;
    const q=P(s.r[0],s.r[1],s.r[2]);
    if(q[2]<0&&(q[3]*q[3]+q[4]*q[4])<R2)continue;
    if(q[0]<-20||q[0]>W+20||q[1]<-20||q[1]>H+20)continue;
    SCR[i]=q;groups[o.cls].push(q);
  }
  const sel=ST.sel;
  if(sel&&sel._path){
    ctx.lineWidth=1.4;ctx.strokeStyle=TH.accent;ctx.globalAlpha=0.85;ctx.beginPath();let pen=false;
    for(const p of sel._path){const q=P(p[0],p[1],p[2]),hid=q[2]<0&&(q[3]*q[3]+q[4]*q[4])<R2;if(hid){pen=false;continue;}if(!pen){ctx.moveTo(q[0],q[1]);pen=true;}else ctx.lineTo(q[0],q[1]);}
    ctx.stroke();ctx.globalAlpha=1;
  }
  ctx.fillStyle=TH.debris;for(const q of groups.debris)ctx.fillRect(q[0]-1,q[1]-1,2,2);
  ctx.fillStyle=TH.rocket;for(const q of groups.rocket){ctx.beginPath();ctx.moveTo(q[0],q[1]-3);ctx.lineTo(q[0]+3,q[1]);ctx.lineTo(q[0],q[1]+3);ctx.lineTo(q[0]-3,q[1]);ctx.closePath();ctx.fill();}
  ctx.strokeStyle=TH.defunct;ctx.lineWidth=1.3;for(const q of groups.defunct){ctx.beginPath();ctx.arc(q[0],q[1],2.4,0,TWO_PI);ctx.stroke();}
  ctx.fillStyle=TH.active;for(const q of groups.active){ctx.beginPath();ctx.arc(q[0],q[1],2.6,0,TWO_PI);ctx.fill();}
  if(sel&&SCR[sel.idx]){
    const q=SCR[sel.idx];ctx.strokeStyle=TH.fg;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(q[0],q[1],8,0,TWO_PI);ctx.stroke();
    ctx.fillStyle=TH.fg;ctx.font='500 12px "IBM Plex Mono",monospace';ctx.fillText(sel.id,q[0]+12,q[1]-10);
  }
}

/* =========================================================
   MODULE 2  Collision Risk Predictor
   ========================================================= */
const CP={prim:CAT.scenarios[0].primary,sec:CAT.scenarios[0].secondary,win:12,sigma:200,hbr:10,redD:1,amberD:5,redPcExp:-4,amberPcExp:-5,dir:'prograde',dv:0,lead:2,sel:0,conj:[]};
const cfg=()=>({redD:CP.redD,amberD:CP.amberD,redPc:Math.pow(10,CP.redPcExp),amberPc:Math.pow(10,CP.amberPcExp)});
const ISP=220,G0=9.80665,SAT_MASS=500;
const propG=dv=>SAT_MASS*(1-Math.exp(-dv/(ISP*G0)))*1000;
let LAST=null;

(function buildSelects(){
  const groups={};OBJ.forEach(o=>{(groups[o.cls]=groups[o.cls]||[]).push(o);});
  const html=Object.keys(CLS).map(k=>'<optgroup label="'+CLS[k]+'">'+groups[k].map(o=>'<option value="'+o.id+'">'+o.id+'</option>').join('')+'</optgroup>').join('');
  $('cpPrim').innerHTML=html;$('cpSec').innerHTML=html;
  $('presets').innerHTML=CAT.scenarios.map((s,i)=>'<button type="button" class="preset" data-i="'+i+'"><b>'+s.title+'</b><span>'+s.desc+'</span></button>').join('');
})();
$('presets').addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(!b)return;const s=CAT.scenarios[+b.dataset.i];CP.prim=s.primary;CP.sec=s.secondary;CP.dv=0;syncCPControls();scan();});
function syncCPControls(){
  $('cpPrim').value=CP.prim;$('cpSec').value=CP.sec;$('cpWin').value=CP.win;$('cpDir').value=CP.dir;$('cpLead').value=CP.lead;$('cpDv').value=CP.dv;
  $('oRedD').textContent=CP.redD.toFixed(1)+' km';$('oAmberD').textContent=CP.amberD.toFixed(1)+' km';
  $('oRedPc').textContent='10'+String(CP.redPcExp).replace(/./g,c=>SUP[c]);$('oAmberPc').textContent='10'+String(CP.amberPcExp).replace(/./g,c=>SUP[c]);
  $('oSigma').textContent=CP.sigma+' m';$('oHbr').textContent=CP.hbr+' m';$('oDv').textContent=CP.dv.toFixed(2)+' m/s';
  document.querySelectorAll('#presets .preset').forEach((b,i)=>b.setAttribute('aria-pressed',String(CAT.scenarios[i].primary===CP.prim&&CAT.scenarios[i].secondary===CP.sec)));
}
function bindSel(id,key,rescan,num){$(id).addEventListener('change',e=>{CP[key]=num?+e.target.value:e.target.value;if(key==='prim'&&CP.sec===CP.prim)CP.sec=OBJ.find(o=>o.id!==CP.prim).id;if(key==='sec'&&CP.prim===CP.sec)CP.prim=OBJ.find(o=>o.id!==CP.sec).id;syncCPControls();if(rescan)scan();else renderCP();});}
function bindRng(id,key){$(id).addEventListener('input',e=>{CP[key]=+e.target.value;syncCPControls();renderCP();});}
bindSel('cpPrim','prim',true);bindSel('cpSec','sec',true);bindSel('cpWin','win',true,true);bindSel('cpDir','dir',false);bindSel('cpLead','lead',false,true);
bindRng('cpRedD','redD');bindRng('cpAmberD','amberD');bindRng('cpRedPc','redPcExp');bindRng('cpAmberPc','amberPcExp');bindRng('cpSigma','sigma');bindRng('cpHbr','hbr');bindRng('cpDv','dv');

function scan(){
  const A=byId.get(CP.prim),B=byId.get(CP.sec);
  CP.conj=SG.findConjunctions(A.el,B.el,0,CP.win*3600,20,5);CP.sel=0;renderCP();
}
function evalOutcome(m,sigma,hbr,c){
  const pc=SG.collisionProb(m.d,sigma,hbr);return {t:m.t,d:m.d,vrel:m.vrel,dr:m.dr,pc:pc,risk:SG.riskLevel(m.d,pc,c)};
}
function analyse(){
  const A=byId.get(CP.prim),B=byId.get(CP.sec),c=CP.conj[CP.sel];if(!c)return null;
  const cf=cfg(),sigma=CP.sigma/1000,hbr=CP.hbr/1000;
  const base=evalOutcome(c,sigma,hbr,cf);
  const tB=Math.max(30,c.t-CP.lead*A.el.T),limited=c.t-CP.lead*A.el.T<30;
  let post=null;
  if(CP.dv>0){
    const el2=SG.burn(A.el,tB,SG.DIRS[CP.dir],CP.dv);
    post=evalOutcome(SG.minNear(el2,B.el,c.t,300,2),sigma,hbr,cf);post.el=el2;post.tB=tB;post.limited=limited;
  }
  const OPTS=[['prograde',0.05],['prograde',0.1],['prograde',0.25],['retrograde',0.05],['retrograde',0.1],['retrograde',0.25],['normal',0.1],['normal',0.25],['radial',0.1],['radial',0.25]];
  const opts=OPTS.map(o=>{const el2=SG.burn(A.el,tB,SG.DIRS[o[0]],o[1]);const r=evalOutcome(SG.minNear(el2,B.el,c.t,300,2),sigma,hbr,cf);r.dir=o[0];r.dv=o[1];return r;});
  const greens=opts.filter(o=>o.risk.level==='green').sort((a,b)=>a.dv-b.dv||b.d-a.d);
  const rec=greens.length?greens[0]:opts.slice().sort((a,b)=>b.d-a.d)[0];
  return {A:A,B:B,c:c,base:base,post:post,opts:opts,rec:rec,tB:tB,limited:limited};
}
const RLAB={red:'Red',amber:'Amber',green:'Green'};
function triggerText(r,d,cf,pc){
  if(r.level==='green')return 'Miss distance and collision probability are both outside the amber thresholds.';
  const lim=r.level==='red'?cf.redD:cf.amberD,lp=r.level==='red'?cf.redPc:cf.amberPc;
  const parts=[];
  if(r.trigger==='distance'||r.trigger==='both')parts.push('miss distance '+fmtDist(d)+' is inside the '+fmtDist(lim)+' limit');
  if(r.trigger==='probability'||r.trigger==='both')parts.push('probability '+fmtPc(pc)+' is above the '+fmtPc(lp)+' limit');
  return 'Triggered because '+parts.join(' and ')+'.';
}
function renderCP(){
  if(curTab!=='collision')return;
  syncCPControls();
  const an=analyse();LAST=an;
  const list=$('cpList');
  if(!an){$('cpBanner').innerHTML='<p class="note">No approach found in this window.</p>';list.innerHTML='';$('cpCards').innerHTML='';$('optTbl').innerHTML='';return;}
  const cf=cfg(),b=an.base;
  list.innerHTML=CP.conj.map((c,i)=>'<button type="button" data-i="'+i+'" aria-pressed="'+(i===CP.sel)+'">'+fmtT(c.t)+' · '+fmtDist(c.d)+' · '+c.vrel.toFixed(1)+' km/s</button>').join('');
  $('cpBanner').innerHTML=
   '<div class="banner"><div><span class="lab">Closest approach · '+an.A.id+' and '+an.B.id+'</span><div class="big">'+fmtDist(b.d)+' at '+fmtT(b.t)+'</div><p>'+fmtUTC(b.t)+' · relative speed '+b.vrel.toFixed(2)+' km/s · collision probability '+fmtPc(b.pc)+'</p></div>'+
   '<div style="text-align:right"><span class="pill '+b.risk.level+'">'+RLAB[b.risk.level]+'</span><p style="max-width:42ch;margin-top:6px">'+triggerText(b.risk,b.d,cf,b.pc)+'</p></div></div>';
  const card=(title,r,el,extra)=>'<div class="panel"><div class="panel-h"><span>'+title+'</span><span class="pill '+r.risk.level+'">'+RLAB[r.risk.level]+'</span></div><dl class="kv">'+
    '<dt>Miss distance</dt><dd>'+fmtDist(r.d)+'</dd><dt>Closest approach</dt><dd>'+fmtT(r.t)+'</dd><dt>Relative speed</dt><dd>'+r.vrel.toFixed(2)+' km/s</dd><dt>Collision probability</dt><dd>'+fmtPc(r.pc)+'</dd>'+
    '<dt>Primary perigee × apogee</dt><dd>'+Math.round(el.rp-RE)+' × '+Math.round(el.ra-RE)+' km</dd>'+extra+'</dl></div>';
  let cards=card('Baseline',b,an.A.el,'');
  if(an.post){
    const p=an.post,gain=p.d/b.d;
    cards+=card('After '+CP.dir+' burn',p,p.el,'<dt>Delta-v</dt><dd>'+CP.dv.toFixed(2)+' m/s</dd><dt>Propellant, 500 kg craft</dt><dd>'+fmtProp(propG(CP.dv))+'</dd><dt>Burn at</dt><dd>'+fmtT(p.tB)+'</dd><dt>Miss distance change</dt><dd>'+(gain>=1?'×'+gain.toFixed(gain<10?1:0):'×'+gain.toFixed(2))+'</dd>');
  }else cards+='<div class="panel"><div class="panel-h"><span>After manoeuvre</span><span class="pill grey">Not set</span></div><p class="note" style="margin:0">Pick a direction and raise the delta-v slider, or click a row in the option comparison below.</p></div>';
  $('cpCards').innerHTML=cards;
  const tb=['<thead><tr><th>Option</th><th class="num">Delta-v</th><th class="num">Miss distance</th><th class="num">Probability</th><th>Risk</th><th class="num">Propellant</th></tr></thead><tbody>'];
  an.opts.forEach((o,i)=>{tb.push('<tr class="pick" tabindex="0" data-i="'+i+'" aria-selected="'+(CP.dir===o.dir&&Math.abs(CP.dv-o.dv)<1e-9)+'"><td>'+o.dir[0].toUpperCase()+o.dir.slice(1)+(o===an.rec?'<span class="tag">Suggested</span>':'')+'</td><td class="mono">'+o.dv.toFixed(2)+' m/s</td><td class="mono">'+fmtDist(o.d)+'</td><td class="mono">'+fmtPc(o.pc)+'</td><td><span class="pill '+o.risk.level+'">'+RLAB[o.risk.level]+'</span></td><td class="mono">'+fmtProp(propG(o.dv))+'</td></tr>');});
  tb.push('</tbody>');$('optTbl').innerHTML=tb.join('');
  $('optNote').textContent='Each option is a single impulsive burn '+CP.lead+' orbit'+(CP.lead>1?'s':'')+' before closest approach'+(an.limited?' (limited to T+00:00:30 because the encounter is sooner)':'')+'. The suggested option is the smallest burn that reaches green, or the largest miss distance if none does.';
  drawPlots();
}
$('cpList').addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(!b)return;CP.sel=+b.dataset.i;renderCP();});
function pickOpt(e){
  const r=e.target.closest('tr[data-i]');if(!r||!LAST)return;const o=LAST.opts[+r.dataset.i];CP.dir=o.dir;CP.dv=o.dv;renderCP();
}
$('optTbl').addEventListener('click',pickOpt);
$('optTbl').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pickOpt(e);}});

function drawPlots(){if(curTab!=='collision'||!LAST)return;drawSep(LAST);drawEnc(LAST);}
function drawSep(an){
  const cv=$('plotSep'),f=fit(cv),ctx=f.ctx,W=f.W,H=f.H;if(W<10)return;ctx.clearRect(0,0,W,H);
  const A=an.A.el,B=an.B.el,c=an.c,half=90,cf=cfg();
  const ser=el=>{const s=[];for(let dt=-half;dt<=half;dt+=1)s.push(Math.max(1e-3,SG.sepAt(el,B,c.t+dt).d));return s;};
  const s0=ser(A),s1=an.post?ser(an.post.el):null;
  let mn=Math.min(...s0,cf.redD,s1?Math.min(...s1):1e9),mx=Math.max(...s0,s1?Math.max(...s1):0,cf.amberD*3);
  const lo=Math.pow(10,Math.floor(Math.log10(mn*0.7))),hi=Math.pow(10,Math.ceil(Math.log10(mx)));
  const L=58,Rr=14,T=30,Bt=30,pw=W-L-Rr,ph=H-T-Bt;
  const X=dt=>L+(dt+half)/(2*half)*pw,Y=d=>T+(1-(Math.log10(d)-Math.log10(lo))/(Math.log10(hi)-Math.log10(lo)))*ph;
  ctx.font='11px "IBM Plex Mono",monospace';ctx.textBaseline='middle';
  for(let v=lo;v<=hi*1.001;v*=10){ctx.strokeStyle=TH.line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(L,Y(v));ctx.lineTo(W-Rr,Y(v));ctx.stroke();ctx.fillStyle=TH.muted;ctx.textAlign='right';ctx.fillText(fmtDist(v),L-6,Y(v));}
  ctx.textAlign='center';ctx.textBaseline='top';
  for(let dt=-half;dt<=half;dt+=30){ctx.fillStyle=TH.muted;ctx.fillText((dt>0?'+':'')+dt+' s',X(dt),H-Bt+8);ctx.strokeStyle=TH.line;ctx.beginPath();ctx.moveTo(X(dt),T);ctx.lineTo(X(dt),T+ph);ctx.stroke();}
  const hline=(d,col,label)=>{if(d<lo||d>hi)return;ctx.save();ctx.setLineDash([5,4]);ctx.strokeStyle=col;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(L,Y(d));ctx.lineTo(W-Rr,Y(d));ctx.stroke();ctx.restore();ctx.fillStyle=col;ctx.textAlign='left';ctx.textBaseline='bottom';ctx.fillText(label,L+4,Y(d)-2);};
  hline(cf.amberD,TH.warn,'amber limit');hline(cf.redD,TH.crit,'red limit');
  const curve=(s,col,w)=>{ctx.strokeStyle=col;ctx.lineWidth=w;ctx.beginPath();s.forEach((d,i)=>{const x=X(i-half),y=Y(d);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();};
  curve(s0,TH.muted,2);if(s1)curve(s1,TH.accent,2.4);
  const dot=(dt,d,col)=>{ctx.fillStyle=col;ctx.beginPath();ctx.arc(X(clamp(dt,-half,half)),Y(clamp(d,lo,hi)),4.5,0,TWO_PI);ctx.fill();};
  dot(0,an.base.d,TH.fg);if(an.post)dot(an.post.t-c.t,an.post.d,TH.accent);
  ctx.textBaseline='middle';ctx.textAlign='right';ctx.fillStyle=TH.muted;ctx.fillText('baseline',W-Rr-48,T-14);ctx.fillStyle=TH.muted;ctx.fillRect(W-Rr-42,T-16,26,3);
  if(s1){ctx.fillStyle=TH.accent;ctx.textAlign='right';ctx.fillText('after burn',W-Rr-48-90,T-14);ctx.fillRect(W-Rr-42-90,T-16,26,3);}
}
function drawEnc(an){
  const cv=$('plotEnc'),f=fit(cv),ctx=f.ctx,W=f.W,H=f.H;if(W<10)return;ctx.clearRect(0,0,W,H);
  const sigma=CP.sigma,hbr=CP.hbr,c=an.c;
  const relv=SG.sub(SG.propagate(an.B.el,c.t).v,SG.propagate(an.A.el,c.t).v);
  const e1=SG.unit(an.base.dr),e2=SG.unit(SG.cross(relv,e1));
  const proj=dr=>[SG.dot(dr,e1)*1000,SG.dot(dr,e2)*1000];
  const p0=proj(an.base.dr),p1=an.post?proj(an.post.dr):null;
  const ext=Math.max(3*sigma,Math.abs(p0[0]),p1?Math.hypot(p1[0],p1[1]):0,hbr*3)*1.2;
  const cx=W/2,cy=H/2,S=Math.min(W,H)/2/ext*0.92,X=v=>cx+v*S,Y=v=>cy-v*S;
  ctx.strokeStyle=TH.line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(8,cy);ctx.lineTo(W-8,cy);ctx.moveTo(cx,8);ctx.lineTo(cx,H-8);ctx.stroke();
  ctx.fillStyle=TH.crit;ctx.globalAlpha=0.9;ctx.beginPath();ctx.arc(cx,cy,Math.max(2.5,hbr*S),0,TWO_PI);ctx.fill();ctx.globalAlpha=1;
  const ring=(p,r,col,dash,w)=>{ctx.save();if(dash)ctx.setLineDash([5,4]);ctx.strokeStyle=col;ctx.lineWidth=w;ctx.beginPath();ctx.arc(X(p[0]),Y(p[1]),r*S,0,TWO_PI);ctx.stroke();ctx.restore();};
  ring(p0,sigma,TH.muted,false,1.5);ring(p0,3*sigma,TH.muted,true,1);
  ctx.fillStyle=TH.fg;ctx.beginPath();ctx.arc(X(p0[0]),Y(p0[1]),4.5,0,TWO_PI);ctx.fill();
  if(p1){ring(p1,sigma,TH.accent,false,1.8);ring(p1,3*sigma,TH.accent,true,1);ctx.fillStyle=TH.accent;ctx.beginPath();ctx.arc(X(p1[0]),Y(p1[1]),4.5,0,TWO_PI);ctx.fill();}
  ctx.font='11px "IBM Plex Mono",monospace';ctx.textBaseline='bottom';ctx.textAlign='left';
  ctx.fillStyle=TH.crit;ctx.fillText('object radius '+hbr+' m',10,H-26);
  ctx.fillStyle=TH.muted;ctx.fillText('rings: 1σ and 3σ = '+sigma+' m, '+(3*sigma)+' m',10,H-10);
  ctx.fillStyle=TH.fg;ctx.textAlign='center';ctx.fillText('baseline '+fmtDist(an.base.d),clamp(X(p0[0]),70,W-70),Y(p0[1])-10);
  if(p1){ctx.fillStyle=TH.accent;ctx.fillText('after burn '+fmtDist(an.post.d),clamp(X(p1[0]),70,W-70),Y(p1[1])-10);}
}

/* =========================================================
   MODULE 3  Space Defence Decision Centre
   ========================================================= */
const EVENTS=[
  {sat:'SG-COM-014',at:'02:14 UTC',t:{snr:18,loss:62,dv:0,att:0.1,pwr:2,near:120,close:0,frag:0,kp:2}},
  {sat:'SG-NAV-006',at:'03:40 UTC',t:{snr:6,loss:15,dv:0,att:2.1,pwr:22,near:150,close:0,frag:0,kp:7.5}},
  {sat:'SG-EO-003',at:'05:02 UTC',t:{snr:8,loss:35,dv:3.4,att:0.2,pwr:3,near:80,close:0,frag:0,kp:2}},
  {sat:'SG-COM-021',at:'06:27 UTC',t:{snr:1,loss:5,dv:0.8,att:0.1,pwr:1,near:9,close:0.15,frag:0,kp:2}},
  {sat:'SG-EO-007',at:'07:55 UTC',t:{snr:2,loss:10,dv:12,att:3,pwr:8,near:2,close:2.8,frag:14,kp:2}},
  {sat:'SG-NAV-011',at:'09:18 UTC',t:{snr:2,loss:8,dv:0,att:4.2,pwr:28,near:140,close:0,frag:0,kp:2}},
  {sat:'SG-COM-002',at:'10:31 UTC',t:{snr:1,loss:3,dv:0,att:0.1,pwr:2,near:160,close:0,frag:0,kp:1.5}},
  {sat:'SG-GEO-004',at:'11:46 UTC',t:{snr:9,loss:40,dv:0,att:0.3,pwr:12,near:60,close:0,frag:0,kp:4.5}}
];
EVENTS.forEach(e=>{e.role=byId.get(e.sat).role;});
const DC={ev:0,tel:Object.assign({},EVENTS[0].t),w:{eff:5,cost:2,risk:3,speed:3,rev:2}};
const SEVCLS=s=>s>=4?'red':(s===3?'amber':'green');
const WLAB={eff:'Effectiveness',cost:'Low cost',risk:'Low side-effect risk',speed:'Speed',rev:'Reversibility'};

function renderEvents(){
  $('evList').innerHTML=EVENTS.map((e,i)=>{
    const r=SG.classify(i===DC.ev?DC.tel:e.t,e.role);
    return '<button type="button" class="ev" data-i="'+i+'"'+(i===DC.ev?' aria-current="true"':'')+'><span class="l1"><span class="id">'+e.sat+'</span><span class="pill '+SEVCLS(r.severity)+'">Sev '+r.severity+'</span></span><span class="l2">'+r.cat.label+'</span><span class="l3">'+e.at+' · '+e.role+' · confidence '+r.confidence.toLowerCase()+'</span></button>';
  }).join('');
}
$('evList').addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(!b)return;DC.ev=+b.dataset.i;DC.tel=Object.assign({},EVENTS[DC.ev].t);buildDC();});

function buildDC(){
  const ev=EVENTS[DC.ev];
  $('dcMain').innerHTML=
   '<div class="panel"><div class="verdict" style="margin:0"><div><span class="lab">Selected event</span><div class="cat" style="font-size:22px">'+ev.sat+' <span class="dim" style="font-size:15px;font-weight:500">· '+ev.role+' · detected '+ev.at+'</span></div></div>'+
   '<div class="actions" style="margin:0"><button type="button" class="btn sm" id="dcLocate">Locate in explorer</button><button type="button" class="btn sm" id="dcReset">Reset telemetry</button></div></div></div>'+
   '<div class="panel"><h2>Telemetry and sensor readings</h2><div class="tel" id="dcTel">'+SG.TELEM.map(x=>'<div class="field"><span class="lab">'+x.label+'<output id="o_'+x.k+'"></output></span><input type="range" id="s_'+x.k+'" min="'+x.min+'" max="'+x.max+'" step="'+x.step+'" value="'+DC.tel[x.k]+'" aria-label="'+x.label+'"></div>').join('')+'</div></div>'+
   '<div class="panel" id="dcClass"></div><div class="panel" id="dcResp"></div>';
  $('dcLocate').onclick=()=>{const o=byId.get(ev.sat);ST.tk=o.regime==='LEO'?2.3:(o.regime==='MEO'?4.8:7.4);syncViewSeg();select(o,true);show('explorer');};
  $('dcReset').onclick=()=>{DC.tel=Object.assign({},ev.t);buildDC();};
  SG.TELEM.forEach(x=>{$('s_'+x.k).addEventListener('input',e=>{DC.tel[x.k]=+e.target.value;updateDC();});});
  updateDC();
}
function updateDC(){
  const ev=EVENTS[DC.ev];
  SG.TELEM.forEach(x=>{$('o_'+x.k).textContent=DC.tel[x.k]+(x.unit?' '+x.unit:'');});
  const r=SG.classify(DC.tel,ev.role);
  const conf=r.confidence==='High'?'green':(r.confidence==='Medium'?'amber':'red');
  const maxC=Math.max(1,...r.trace.map(x=>x.c));
  $('dcClass').innerHTML=
   '<h2>Classification</h2><div class="verdict"><div><span class="lab">Most likely cause</span><div class="cat">'+r.cat.label+'</div></div>'+
   '<div style="display:flex;gap:8px;flex-wrap:wrap"><span class="pill '+conf+'">Confidence '+r.confidence+'</span><span class="pill '+SEVCLS(r.severity)+'">Severity '+r.severity+' of 5</span></div></div>'+
   (r.confidence==='Low'&&r.cat.id!=='nominal'?'<p class="note" style="margin:0 0 10px">The evidence is ambiguous, so severity is capped at 3 and the event is flagged for human review.</p>':'')+
   (r.trace.length?'<span class="lab">Rules that fired</span><div class="trace" style="margin-top:8px">'+r.trace.slice(0,7).map(x=>'<span>'+x.text+' <span class="dim">· '+SG.CATS.find(c=>c.id===x.cat).label+'</span></span><span class="bar"><span style="width:'+(100*x.c/maxC).toFixed(0)+'%"></span></span><span class="c">+'+x.c.toFixed(2)+'</span>').join('')+'</div>':'<p class="note" style="margin:0">No rule fired above the noise floor.</p>')+
   '<p class="note">Each rule adds a weighted score to one cause. The highest total wins, and confidence reflects its margin over the runner-up.</p>';
  renderResp(r);renderEvents();
}
function renderResp(r){
  const ranked=SG.scoreStrategies(r.cat.id,r.severity,DC.w);
  const best=ranked[0],cm=best.comp,why=[];
  if(cm.eff>=0.7)why.push('high expected effectiveness');if(cm.cost>=0.7)why.push('low cost');if(cm.rev>=0.8)why.push('easy to reverse');if(cm.speed>=0.75)why.push('fast to execute');if(cm.risk>=0.8)why.push('low side-effect risk');
  const rat=why.length?best.s.name+' ranks first for its '+why.join(', ')+'.':best.s.name+' ranks first, but no option stands out for this event.';
  const wk=Object.keys(WLAB);
  const mx=ranked[0].score;
  $('dcResp').innerHTML=
   '<h2>Response strategies</h2><p class="lead" style="color:var(--fg)">'+rat+'</p>'+
   '<div class="weights">'+wk.map(k=>'<div class="field"><span class="lab">'+WLAB[k]+'<output>'+DC.w[k]+'</output></span><input type="range" id="w_'+k+'" min="0" max="5" step="1" value="'+DC.w[k]+'" aria-label="Weight: '+WLAB[k]+'"></div>').join('')+'</div>'+
   '<div class="tbl"><table class="data"><thead><tr><th>Rank</th><th>Strategy</th><th class="num">Effect</th><th class="num">Cost</th><th class="num">Risk</th><th class="num">Speed</th><th class="num">Revers.</th><th style="min-width:150px">Score</th></tr></thead><tbody>'+
   ranked.map((x,i)=>'<tr><td class="mono">'+(i+1)+'</td><td class="strat-name"><b>'+x.s.name+(i===0?'<span class="tag">Recommended</span>':'')+'</b><span>'+x.s.desc+'</span></td><td class="mono">'+x.comp.eff.toFixed(2)+'</td><td class="mono">'+x.comp.cost.toFixed(2)+'</td><td class="mono">'+x.comp.risk.toFixed(2)+'</td><td class="mono">'+x.comp.speed.toFixed(2)+'</td><td class="mono">'+x.comp.rev.toFixed(2)+'</td><td><div style="display:flex;gap:8px;align-items:center"><span class="bar" style="flex:1"><span style="width:'+(100*x.score/Math.max(mx,1)).toFixed(0)+'%"></span></span><span class="mono" style="width:30px;text-align:right">'+x.score.toFixed(0)+'</span></div></td></tr>').join('')+
   '</tbody></table></div><p class="note">Criterion columns run from 0 to 1 and higher is always better, so Cost and Risk show the inverse of expense and side effects. Scores are a weighted average. Effectiveness weight rises with severity.</p>';
  wk.forEach(k=>{$('w_'+k).addEventListener('input',e=>{DC.w[k]=+e.target.value;renderResp(r);const el=$('w_'+k);if(el)el.focus();});});
}

/* ---------- main loop ---------- */
let last=0,frame=0;
function loop(ts){
  const dt=Math.min(0.1,(ts-last)/1000||0);last=ts;frame++;
  if(ST.playing)ST.t+=dt*ST.speed;
  if(frame%6===0){$('clockT').textContent=fmtT(ST.t);$('clockU').textContent=fmtUTC(ST.t);}
  if(curTab==='explorer'){drawGlobe();if(frame%12===0)liveInspector();}
  requestAnimationFrame(loop);
}

/* ---------- init ---------- */
renderLegends();renderList();select(ST.sel,false);syncViewSeg();
syncCPControls();scan();buildDC();
const h0=location.hash.slice(1);show(TABS.includes(h0)?h0:'explorer');
if(window.ResizeObserver){const ro=new ResizeObserver(()=>drawPlots());['plotSep','plotEnc'].forEach(i=>ro.observe($(i)));}
requestAnimationFrame(loop);
})();
