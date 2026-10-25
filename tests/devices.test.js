const test=require('node:test'),assert=require('node:assert');const S=require('../solver.js'),D=require('../devices.js');
function run(build,steps,dt){let devs,sol;const st={};for(let i=0;i<steps;i++){const c=D.context();devs=build(c,st);sol=S.solve({nodeCount:c.nodeCount(),elements:c.els});assert.ok(sol.ok);devs.forEach(d=>d.step&&d.step(sol,dt));}return {devs,sol};}
test('TT-мотор от 6 В: пусковой ток большой, потом падает',()=>{let st={w:0},first;
 const {devs}=run((c)=>{const p=c.node();c.add({type:'V',p,n:0,V:6});const m=D.motor(c,p,0,'tt',st);return [m];},1,1e-3);first=st.I;
 run((c)=>{const p=c.node();c.add({type:'V',p,n:0,V:6});return [D.motor(c,p,0,'tt',st)];},3000,1e-3);
 assert.ok(first>0.7,String(first));assert.ok(st.I<first/3,String(st.I));assert.ok(st.rpm>100);});
test('аккумулятор 103450 разряжается',()=>{const st={soc:1};run(c=>{const p=c.node();const b=D.liion(c,p,0,st);c.add({type:'R',a:p,b:0,R:4});return [b];},10,36);
 assert.ok(st.soc<0.97&&st.soc>0.9,String(st.soc));assert.ok(st.V<4.2);});
test('boost 3,7→12 В: входной ток = Pвых/(КПД·Uвх)',()=>{const st={};run(c=>{const i=c.node(),o=c.node();c.add({type:'V',p:i,n:0,V:3.7});const b=D.boost(c,i,0,o,0,12,st);c.add({type:'R',a:o,b:0,R:120});return [b];},20,0.01);
 assert.ok(Math.abs(st.Pout-1.2)<0.05);assert.ok(Math.abs(st.Iin-1.2/0.9/3.7)<0.02,String(st.Iin));});
test('L298N теряет ~2 В, DRV8833 почти нет',()=>{for(const [k,lo,hi] of [['l298n',2.5,3.3],['drv8833',4.6,5]]){const c=D.context();const vs=c.node(),a=c.node(),b=c.node();
 c.add({type:'V',p:vs,n:0,V:5});D.hbridge(c,vs,a,b,1,0,k);c.add({type:'R',a,b,R:10});const s=S.solve({nodeCount:c.nodeCount(),elements:c.els});
 const u=s.v[a]-s.v[b];assert.ok(u>lo&&u<hi,k+' '+u);}});
test('DRV8833 STBY low: выходы high-Z, нагрузка не питается',()=>{const c=D.context();const vs=c.node(),a=c.node(),b=c.node();
 c.add({type:'V',p:vs,n:0,V:5});const hb=D.hbridge(c,vs,a,b,1,0,'drv8833',false);c.add({type:'R',a,b,R:10});
 const s=S.solve({nodeCount:c.nodeCount(),elements:c.els});assert.ok(s.ok);assert.equal(hb.z,true);assert.ok(Math.abs(s.v[a]-s.v[b])<0.05);});
test('преобразователь уровней: низ проходит в обе стороны, высокий становится уровнем своей шины',()=>{
 const run=(drive)=>{const c=D.context();const hv=c.node(),lv=c.node(),hv1=c.node(),lv1=c.node(),hv2=c.node(),lv2=c.node();
  c.add({type:'V',p:hv,n:0,V:5});c.add({type:'V',p:lv,n:0,V:3.3});
  if(drive==='lv')c.add({type:'R',a:lv1,b:0,R:100});if(drive==='hv')c.add({type:'R',a:hv1,b:0,R:100});
  D.levelShift(c,hv,lv,[[lv1,hv1],[lv2,hv2]],drive!=='off');
  if(drive==='off'){c.add({type:'R',a:hv,b:hv1,R:10000});c.add({type:'R',a:lv1,b:0,R:100});}
  const s=S.solve({nodeCount:c.nodeCount(),elements:c.els});assert.ok(s.ok,s.error);
  return {hv1:s.v[hv1],lv1:s.v[lv1],hv2:s.v[hv2],lv2:s.v[lv2]};};
 const idle=run('idle');assert.ok(idle.hv1>4.5&&Math.abs(idle.lv1-3.3)<0.05,JSON.stringify(idle));
 const lo=run('lv');assert.ok(lo.hv1<0.3&&lo.lv1<0.3&&lo.hv2>4.5&&Math.abs(lo.lv2-3.3)<0.15,'lv '+JSON.stringify(lo));
 const hi=run('hv');assert.ok(hi.hv1<0.3&&hi.lv1<0.3&&hi.hv2>4.5,'hv '+JSON.stringify(hi));
 const off=run('off');assert.ok(off.hv1>4.5&&off.lv1<0.05,'off '+JSON.stringify(off));});
