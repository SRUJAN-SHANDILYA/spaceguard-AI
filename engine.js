const SG=(function(){
'use strict';
const MU=398600.4418, RE=6378.137, TWO_PI=Math.PI*2, D2R=Math.PI/180, OMEGA_E=7.2921159e-5;
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(a[0],a[1],a[2]);
const unit=a=>{const n=norm(a);return [a[0]/n,a[1]/n,a[2]/n];};
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const wrapPi=x=>{x%=TWO_PI;if(x>Math.PI)x-=TWO_PI;if(x<-Math.PI)x+=TWO_PI;return x;};
const wrap2pi=x=>{x%=TWO_PI;return x<0?x+TWO_PI:x;};
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

function prep(el){
  el.n=Math.sqrt(MU/(el.a*el.a*el.a)); el.T=TWO_PI/el.n;
  const cO=Math.cos(el.raan),sO=Math.sin(el.raan),ci=Math.cos(el.i),si=Math.sin(el.i),cw=Math.cos(el.argp),sw=Math.sin(el.argp);
  el.P=[cO*cw-sO*sw*ci,sO*cw+cO*sw*ci,sw*si];
  el.Q=[-cO*sw-sO*cw*ci,-sO*sw+cO*cw*ci,cw*si];
  el.rp=el.a*(1-el.e); el.ra=el.a*(1+el.e);
  return el;
}
function makeEl(a,e,iD,raanD,argpD,mD){return prep({a:a,e:e,i:iD*D2R,raan:raanD*D2R,argp:argpD*D2R,M0:mD*D2R});}
function kepler(M,e){
  const m=wrapPi(M); let E=e<0.8?m:(m>=0?Math.PI:-Math.PI);
  for(let k=0;k<50;k++){const f=E-e*Math.sin(E)-m,fp=1-e*Math.cos(E),d=f/fp;E-=d;if(Math.abs(d)<1e-13)break;}
  return E;
}
function propagate(el,t){
  const E=kepler(el.M0+el.n*t,el.e),cE=Math.cos(E),sE=Math.sin(E);
  const sq=Math.sqrt(1-el.e*el.e),r=el.a*(1-el.e*cE);
  const x=el.a*(cE-el.e),y=el.a*sq*sE;
  const k=Math.sqrt(MU*el.a)/r,vx=-k*sE,vy=k*sq*cE,P=el.P,Q=el.Q;
  return {r:[P[0]*x+Q[0]*y,P[1]*x+Q[1]*y,P[2]*x+Q[2]*y],v:[P[0]*vx+Q[0]*vy,P[1]*vx+Q[1]*vy,P[2]*vx+Q[2]*vy]};
}
function stateToElements(r,v){
  const rn=norm(r),v2=dot(v,v),rv=dot(r,v),h=cross(r,v),hn=norm(h);
  const nvec=[-h[1],h[0],0],nn=Math.hypot(nvec[0],nvec[1]);
  const evec=mul(sub(mul(r,v2-MU/rn),mul(v,rv)),1/MU),e=norm(evec);
  const a=-MU/(2*(v2/2-MU/rn));
  const inc=Math.acos(clamp(h[2]/hn,-1,1));
  const eq=nn<1e-8*hn;
  let raan=0,argp=0,nu=0;
  if(!eq) raan=Math.atan2(nvec[1],nvec[0]);
  if(e>1e-9){
    if(!eq){argp=Math.acos(clamp(dot(nvec,evec)/(nn*e),-1,1));if(evec[2]<0)argp=TWO_PI-argp;}
    else{argp=Math.atan2(evec[1],evec[0]);if(h[2]<0)argp=TWO_PI-argp;}
    nu=Math.acos(clamp(dot(evec,r)/(e*rn),-1,1));if(rv<0)nu=TWO_PI-nu;
  }else{
    if(!eq){nu=Math.acos(clamp(dot(nvec,r)/(nn*rn),-1,1));if(r[2]<0)nu=TWO_PI-nu;}
    else{nu=Math.atan2(r[1],r[0]);if(h[2]<0)nu=TWO_PI-nu;}
  }
  const Ec=2*Math.atan2(Math.sqrt(1-e)*Math.sin(nu/2),Math.sqrt(1+e)*Math.cos(nu/2));
  return prep({a:a,e:e,i:inc,raan:wrap2pi(raan),argp:wrap2pi(argp),M0:Ec-e*Math.sin(Ec)});
}
const DIRS={prograde:[0,1,0],retrograde:[0,-1,0],radial:[1,0,0],normal:[0,0,1],antinormal:[0,0,-1]};
function burn(el,tB,dir,dvMs){
  const s=propagate(el,tB),R=unit(s.r),N=unit(cross(s.r,s.v)),T=cross(N,R),dv=dvMs/1000;
  const d=add(add(mul(R,dir[0]*dv),mul(T,dir[1]*dv)),mul(N,dir[2]*dv));
  const e2=stateToElements(s.r,add(s.v,d)); e2.M0=wrapPi(e2.M0-e2.n*tB); return e2;
}
function sepAt(a,b,t){const A=propagate(a,t),B=propagate(b,t);const dr=sub(B.r,A.r);return {d:norm(dr),dr:dr,dv:sub(B.v,A.v)};}
function minimize(f,lo,hi){
  const g=0.6180339887498949;let x1=hi-g*(hi-lo),x2=lo+g*(hi-lo),f1=f(x1),f2=f(x2);
  for(let k=0;k<60;k++){
    if(f1<f2){hi=x2;x2=x1;f2=f1;x1=hi-g*(hi-lo);f1=f(x1);}else{lo=x1;x1=x2;f1=f2;x2=lo+g*(hi-lo);f2=f(x2);}
    if(hi-lo<1e-4)break;
  }
  return (lo+hi)/2;
}
function findConjunctions(a,b,t0,t1,step,keep){
  const n=Math.ceil((t1-t0)/step),ts=[],ds=[];
  for(let i=0;i<=n;i++){const t=t0+i*step;ts.push(t);ds.push(sepAt(a,b,t).d);}
  const out=[];
  for(let i=1;i<n;i++){
    if(ds[i]<=ds[i-1]&&ds[i]<ds[i+1]){
      const tm=minimize(t=>sepAt(a,b,t).d,ts[i-1],ts[i+1]),s=sepAt(a,b,tm);
      out.push({t:tm,d:s.d,dr:s.dr,vrel:norm(s.dv)});
    }
  }
  out.sort((x,y)=>x.d-y.d);
  return keep?out.slice(0,keep):out;
}
function minNear(a,b,tc,half,step){
  let best=Infinity,bt=tc;
  for(let t=tc-half;t<=tc+half;t+=step){const d=sepAt(a,b,t).d;if(d<best){best=d;bt=t;}}
  const tm=minimize(t=>sepAt(a,b,t).d,bt-step,bt+step),s=sepAt(a,b,tm);
  return {t:tm,d:s.d,dr:s.dr,vrel:norm(s.dv)};
}
function collisionProb(dKm,sigmaKm,hbrKm){const s2=sigmaKm*sigmaKm;return Math.min(1,(hbrKm*hbrKm/(2*s2))*Math.exp(-dKm*dKm/(2*s2)));}
function riskLevel(d,pc,cfg){
  const byD=d<=cfg.redD,byP=pc>=cfg.redPc;
  if(byD||byP)return {level:'red',trigger:byD&&byP?'both':(byD?'distance':'probability')};
  const aD=d<=cfg.amberD,aP=pc>=cfg.amberPc;
  if(aD||aP)return {level:'amber',trigger:aD&&aP?'both':(aD?'distance':'probability')};
  return {level:'green',trigger:null};
}
function regimeOf(el){
  const pAlt=el.rp-RE,aAlt=el.ra-RE;
  if(aAlt<2000)return 'LEO';
  if(Math.abs(el.a-42164)<400&&el.e<0.05)return 'GEO';
  if(pAlt>2000&&aAlt<35000)return 'MEO';
  return 'HEO';
}
function orbitPath(el,n){
  const pts=[],sq=Math.sqrt(1-el.e*el.e);
  for(let k=0;k<=n;k++){
    const E=k/n*TWO_PI,x=el.a*(Math.cos(E)-el.e),y=el.a*sq*Math.sin(E);
    pts.push([el.P[0]*x+el.Q[0]*y,el.P[1]*x+el.Q[1]*y,el.P[2]*x+el.Q[2]*y]);
  }
  return pts;
}
function constructSecondary(primary,tca,off,alphaDeg,speedScale){
  const s=propagate(primary.el,tca),R=unit(s.r),N=unit(cross(s.r,s.v)),T=cross(N,R);
  const pos=add(s.r,add(add(mul(R,off[0]),mul(T,off[1])),mul(N,off[2])));
  const vc=Math.sqrt(MU/norm(pos)),al=alphaDeg*D2R;
  const dir=add(mul(T,Math.cos(al)),mul(N,Math.sin(al)));
  const el=stateToElements(pos,mul(dir,vc*speedScale));
  el.M0=wrapPi(el.M0-el.n*tca); return el;
}
function buildCatalogue(seed){
  const rnd=mulberry32(seed),U=(a,b)=>a+(b-a)*rnd(),G=()=>Math.sqrt(-2*Math.log(1-rnd()))*Math.cos(TWO_PI*rnd());
  const pick=arr=>arr[Math.floor(rnd()*arr.length)],pad=(n,w)=>String(n).padStart(w,'0');
  const list=[];
  const push=(id,cls,role,el,extra)=>{list.push(Object.assign({id:id,cls:cls,role:role,el:el,regime:regimeOf(el),idx:list.length},extra||{}));};
  for(let k=0;k<12;k++)push('SG-EO-'+pad(k+1,3),'active','Earth observation',makeEl(RE+U(690,715),0.0012,98.2,(k*30+U(-3,3)+360)%360,U(60,120),U(0,360)));
  for(let p=0;p<5;p++)for(let s=0;s<6;s++)push('SG-COM-'+pad(p*6+s+1,3),'active','Communications',makeEl(RE+550+U(-2,2),0.0002,53,p*72,0,s*60+p*12+U(-1,1)));
  for(let p=0;p<3;p++)for(let s=0;s<8;s++)push('SG-NAV-'+pad(p*8+s+1,3),'active','Navigation',makeEl(26560+U(-4,4),0.0004,55,p*120,0,s*45+p*15));
  for(let k=0;k<12;k++)push('SG-GEO-'+pad(k+1,3),'active','GEO communications',makeEl(42164.1+U(-1,1),0.0003,0.05,0,0,k*30+U(-2,2)));
  const incs=[74,82,98.5,65,51.6,28.5];
  for(let k=0;k<14;k++){
    const el=k<10?makeEl(RE+U(750,1250),U(0,0.01),pick(incs),U(0,360),U(0,360),U(0,360)):makeEl(42164+U(250,400),U(0,0.003),U(0,8),U(0,360),U(0,360),U(0,360));
    push('DEF-'+pad(k+1,3),'defunct','Defunct satellite',el);
  }
  for(let k=0;k<10;k++)push('RB-'+pad(k+1,3),'rocket','Rocket body',makeEl(RE+U(450,1300),U(0,0.03),pick(incs),U(0,360),U(0,360),U(0,360)));
  push('RB-011','rocket','Rocket body',makeEl(24400,0.7,27,U(0,360),U(170,190),U(0,360)));
  push('RB-012','rocket','Rocket body',makeEl(24400,0.7,7,U(0,360),U(170,190),U(0,360)));
  let dn=10000;const nid=()=>{dn+=Math.floor(U(3,40));return 'DEB-'+dn;};
  for(let k=0;k<60;k++)push(nid(),'debris','Fragmentation debris',makeEl(RE+U(770,870),U(0,0.004),82+G()*0.8,118+G()*6,U(0,360),U(0,360)));
  for(let k=0;k<50;k++)push(nid(),'debris','Debris',makeEl(RE+U(400,1500),U(0,0.02),pick(incs)+G()*0.5,U(0,360),U(0,360),U(0,360)));
  for(let k=0;k<15;k++)push(nid(),'debris','GEO belt debris',makeEl(42164+G()*60,U(0,0.02),U(0,12),U(0,360),U(0,360),U(0,360)));
  for(let k=0;k<15;k++)push(nid(),'debris','MEO debris',makeEl(U(18000,32000),U(0,0.05),pick([55,64,40,10]),U(0,360),U(0,360),U(0,360)));
  const byId=new Map(list.map(o=>[o.id,o]));
  const defs=[
    {key:'A',title:'Debris crossing a sun-synchronous satellite',desc:'Fragment on a crossing orbit. Red on both distance and probability.',primary:'SG-EO-002',sid:'DEB-77310',cls:'debris',role:'Debris (scenario object)',tca:3.1*3600,off:[0.10,0.04,0.30],alpha:72},
    {key:'B',title:'Rocket body near a constellation satellite',desc:'Spent stage with two passes inside 2 km. Amber on distance alone.',primary:'SG-COM-009',sid:'RB-914',cls:'rocket',role:'Rocket body (scenario object)',tca:5.4*3600,off:[0.8,0.5,2.2],alpha:48},
    {key:'C',title:'Defunct satellite fly-by',desc:'Fast pass a few kilometres wide. Probability is negligible, so a small burn clears it.',primary:'SG-COM-017',sid:'DEF-310',cls:'defunct',role:'Defunct satellite (scenario object)',tca:8.2*3600,off:[3,2,7.5],alpha:95}
  ];
  const scenarios=[];
  for(const d of defs){
    const p=byId.get(d.primary),el=constructSecondary(p,d.tca,d.off,d.alpha,1.0);
    push(d.sid,d.cls,d.role,el,{scenario:true});
    byId.set(d.sid,list[list.length-1]);
    scenarios.push({key:d.key,title:d.title,desc:d.desc,primary:d.primary,secondary:d.sid});
  }
  return {list:list,scenarios:scenarios};
}

/* ---------- Module 3: anomaly rules and response scoring ---------- */
const ramp=(x,lo,hi)=>clamp((x-lo)/(hi-lo),0,1);
const TELEM=[
  {k:'snr',label:'Uplink SNR drop',unit:'dB',min:0,max:30,step:0.5},
  {k:'loss',label:'Packet loss',unit:'%',min:0,max:100,step:1},
  {k:'dv',label:'Unscheduled delta-v',unit:'m/s',min:0,max:20,step:0.1},
  {k:'att',label:'Attitude rate',unit:'°/s',min:0,max:10,step:0.1},
  {k:'pwr',label:'Bus power deviation',unit:'%',min:0,max:50,step:1},
  {k:'near',label:'Nearest foreign object',unit:'km',min:0.5,max:200,step:0.5},
  {k:'close',label:'Closing speed',unit:'km/s',min:0,max:5,step:0.05},
  {k:'frag',label:'New debris tracks',unit:'',min:0,max:50,step:1},
  {k:'kp',label:'Geomagnetic Kp index',unit:'',min:0,max:9,step:0.5}
];
const CATS=[
  {id:'nominal',label:'No anomaly',base:1},
  {id:'env',label:'Space-weather effect',base:2},
  {id:'fault',label:'Onboard technical fault',base:3},
  {id:'rf',label:'RF interference or jamming',base:3},
  {id:'manv',label:'Unplanned manoeuvre or command intrusion',base:4},
  {id:'rpo',label:'Proximity operation by a foreign object',base:4},
  {id:'coll',label:'Collision or fragmentation event',base:5}
];
const RULES=[
  {cat:'env',w:1.6,text:'Geomagnetic storm in progress (Kp above 4)',f:t=>ramp(t.kp,4,7)},
  {cat:'env',w:1.0,text:'Power or attitude disturbance during the storm',f:t=>ramp(t.kp,4,6)*Math.max(ramp(t.pwr,5,25),ramp(t.att,0.5,3))},
  {cat:'env',w:0.8,text:'Link degradation during the storm',f:t=>ramp(t.kp,4,7)*Math.max(ramp(t.snr,3,12),ramp(t.loss,10,40))},
  {cat:'fault',w:1.6,text:'Bus power deviation with no storm',f:t=>ramp(t.pwr,10,30)*(1-ramp(t.kp,4,6))},
  {cat:'fault',w:1.6,text:'Attitude rate above limit with no storm or burn',f:t=>ramp(t.att,1,5)*(1-ramp(t.kp,4,6))*(1-ramp(t.dv,1,4))},
  {cat:'fault',w:1.0,text:'Packet loss while signal strength is healthy',f:t=>ramp(t.loss,20,60)*(1-ramp(t.snr,3,10))},
  {cat:'rf',w:1.4,text:'Uplink signal-to-noise collapse with quiet space weather',f:t=>ramp(t.snr,6,18)*(1-ramp(t.kp,5,8))},
  {cat:'rf',w:1.2,text:'Packet loss together with the signal collapse',f:t=>ramp(t.snr,6,15)*ramp(t.loss,20,60)},
  {cat:'rf',w:0.8,text:'Power and attitude healthy, so the failure is link-only',f:t=>ramp(t.snr,6,15)*(1-ramp(t.pwr,5,20))*(1-ramp(t.att,0.5,2))},
  {cat:'manv',w:1.8,text:'Delta-v nobody commanded, with no object nearby',f:t=>ramp(t.dv,1,4)*ramp(t.near,30,80)},
  {cat:'manv',w:1.0,text:'Command-link irregularity alongside the burn',f:t=>ramp(t.dv,1,4)*Math.max(ramp(t.snr,4,12),ramp(t.loss,15,40))},
  {cat:'rpo',w:1.6,text:'Foreign object inside 25 km',f:t=>1-ramp(t.near,5,30)},
  {cat:'rpo',w:1.6,text:'Slow, controlled closing speed',f:t=>ramp(t.close,0.02,0.08)*(1-ramp(t.close,0.3,1))*(1-ramp(t.near,10,40))},
  {cat:'rpo',w:1.0,text:'Close approach coupled with small burns',f:t=>(1-ramp(t.near,5,30))*ramp(t.dv,0.2,1.5)*(1-ramp(t.dv,3,6))},
  {cat:'coll',w:2.0,text:'New debris tracks appeared',f:t=>ramp(t.frag,2,10)},
  {cat:'coll',w:1.4,text:'Fast closing speed at very short range',f:t=>ramp(t.close,1,3)*(1-ramp(t.near,2,15))},
  {cat:'coll',w:1.0,text:'Impulsive delta-v together with fragments',f:t=>ramp(t.dv,3,10)*ramp(t.frag,1,5)}
];
const ROLE_CRIT={'Navigation':1,'GEO communications':1,'Communications':0,'Earth observation':0};
function classify(t,role){
  const scores={};CATS.forEach(c=>scores[c.id]=0);
  const trace=RULES.map(r=>({cat:r.cat,text:r.text,w:r.w,c:r.w*r.f(t)}));
  trace.forEach(x=>scores[x.cat]+=x.c);
  const ranked=CATS.filter(c=>c.id!=='nominal').map(c=>({id:c.id,s:scores[c.id]})).sort((a,b)=>b.s-a.s);
  const top=ranked[0],second=ranked[1];
  let catId=top.s<0.6?'nominal':top.id;
  const margin=top.s>0?(top.s-second.s)/top.s:0;
  let conf=catId==='nominal'?'High':(top.s>=1.5&&margin>=0.5?'High':(top.s>=0.8&&margin>=0.25?'Medium':'Low'));
  const cat=CATS.find(c=>c.id===catId);
  let sev=catId==='nominal'?1:clamp(cat.base+(ROLE_CRIT[role]||0),1,5);
  if(conf==='Low')sev=Math.min(sev,3);
  return {cat:cat,scores:scores,top:top.s,second:second.s,margin:margin,confidence:conf,severity:sev,trace:trace.filter(x=>x.c>0.05).sort((a,b)=>b.c-a.c)};
}
const STRATS=[
  {id:'monitor',name:'Monitor and log',desc:'Keep routine tracking and record the event.',eff:[1.0,0.7,0.2,0.1,0.15,0.1,0.1],cost:0.05,risk:0.02,speed:0.9,rev:1.0},
  {id:'track',name:'Increase tracking cadence',desc:'Task extra sensors and ask partner networks for cross-cueing.',eff:[0.3,0.4,0.3,0.4,0.6,0.7,0.6],cost:0.2,risk:0.05,speed:0.8,rev:1.0},
  {id:'diag',name:'Ground diagnostics and safe mode',desc:'Run health checks and command safe mode if needed.',eff:[0.1,0.5,0.9,0.3,0.5,0.15,0.2],cost:0.35,risk:0.4,speed:0.7,rev:0.8},
  {id:'antijam',name:'Switch band and anti-jam mode',desc:'Change frequency, narrow the beam and enable interference rejection.',eff:[0.0,0.3,0.1,0.9,0.5,0.1,0.0],cost:0.3,risk:0.3,speed:0.75,rev:0.9},
  {id:'avoid',name:'Avoidance manoeuvre',desc:'Burn to raise the miss distance. Spends propellant and mission life.',eff:[0.0,0.0,0.0,0.0,0.2,0.8,0.85],cost:0.7,risk:0.45,speed:0.5,rev:0.2},
  {id:'backup',name:'Hand over to backup asset',desc:'Move critical services to a spare satellite.',eff:[0.0,0.4,0.6,0.55,0.6,0.5,0.55],cost:0.85,risk:0.3,speed:0.3,rev:0.5},
  {id:'escalate',name:'Escalate to command authority',desc:'Notify decision makers and coordinate with other operators.',eff:[0.0,0.1,0.15,0.5,0.7,0.8,0.6],cost:0.25,risk:0.35,speed:0.6,rev:0.3}
];
function scoreStrategies(catId,sev,w){
  const ci=CATS.findIndex(c=>c.id===catId),we=w.eff*Math.max(0.3,1+0.5*(sev-3)),sum=we+w.cost+w.risk+w.speed+w.rev||1;
  return STRATS.map(s=>{
    const comp={eff:s.eff[ci],cost:1-s.cost,risk:1-s.risk,speed:s.speed,rev:s.rev};
    const score=100*(we*comp.eff+w.cost*comp.cost+w.risk*comp.risk+w.speed*comp.speed+w.rev*comp.rev)/sum;
    return {s:s,comp:comp,score:score};
  }).sort((a,b)=>b.score-a.score);
}
return {MU:MU,RE:RE,TWO_PI:TWO_PI,D2R:D2R,OMEGA_E:OMEGA_E,propagate:propagate,stateToElements:stateToElements,burn:burn,sepAt:sepAt,findConjunctions:findConjunctions,minNear:minNear,collisionProb:collisionProb,riskLevel:riskLevel,orbitPath:orbitPath,buildCatalogue:buildCatalogue,DIRS:DIRS,TELEM:TELEM,CATS:CATS,RULES:RULES,classify:classify,STRATS:STRATS,scoreStrategies:scoreStrategies,makeEl:makeEl,unit:unit,cross:cross,dot:dot,norm:norm,sub:sub,add:add,mul:mul,clamp:clamp};
})();
if(typeof window!=='undefined')window.SG=SG;
