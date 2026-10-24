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
