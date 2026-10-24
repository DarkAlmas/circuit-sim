const test=require('node:test'),assert=require('node:assert');const S=require('../solver.js');
test('RC: заряд до 63% за тау',()=>{let st;const R=1000,C=1e-6,dt=1e-5;let r;
 for(let t=0;t<100;t++){r=S.solve({nodeCount:3,elements:[{type:'V',p:1,n:0,V:5},{type:'R',a:1,b:2,R},{type:'C',a:2,b:0,C}]},{dt,state:st});st=r.state;}
 assert.ok(Math.abs(r.v[2]-5*(1-Math.exp(-1)))<0.05,String(r.v[2]));});
test('RL: ток растёт к V/R',()=>{let st,r;for(let t=0;t<500;t++){r=S.solve({nodeCount:3,elements:[{type:'V',p:1,n:0,V:5},{type:'R',a:1,b:2,R:10},{type:'L',a:2,b:0,L:0.01}]},{dt:1e-4,state:st});st=r.state;}
 assert.ok(Math.abs(r.currents[2]-0.5)<0.01);});
test('NMOS ключ: открыт при Vgs=5',()=>{const r=S.solve({nodeCount:4,elements:[{type:'V',p:1,n:0,V:5},{type:'R',a:1,b:2,R:100},{type:'V',p:3,n:0,V:5},{type:'M',d:2,g:3,s:0,K:0.5,Vth:2}]});
 assert.ok(r.ok);assert.ok(r.v[2]<0.5,String(r.v[2]));});
test('NMOS закрыт при Vgs=0',()=>{const r=S.solve({nodeCount:4,elements:[{type:'V',p:1,n:0,V:5},{type:'R',a:1,b:2,R:100},{type:'V',p:3,n:0,V:0},{type:'M',d:2,g:3,s:0,K:0.5,Vth:2}]});
 assert.ok(r.ok);assert.ok(r.v[2]>4.9);});
test('PMOS открыт при Vg=0, исток на 5 В',()=>{const r=S.solve({nodeCount:4,elements:[{type:'V',p:1,n:0,V:5},{type:'M',d:2,g:3,s:1,K:0.5,Vth:2,p:true},{type:'R',a:2,b:0,R:100},{type:'V',p:3,n:0,V:0}]});
 assert.ok(r.ok);assert.ok(r.v[2]>4.5,String(r.v[2]));});
test('КЗ: rInt ограничивает ток и попадает в shorts',()=>{const r=S.solve({nodeCount:2,elements:[{type:'V',p:1,n:0,V:5,rInt:0.1},{type:'R',a:1,b:0,R:0}]});
 assert.ok(Math.abs(r.currents[0]-50)<0.1,String(r.currents[0]));assert.equal(r.shortCircuits.length,1);assert.deepEqual(r.shortCircuits[0].path,[1]);});
test('нормальная схема без shorts',()=>{const r=S.solve({nodeCount:2,elements:[{type:'V',p:1,n:0,V:5,rInt:0.1},{type:'R',a:1,b:0,R:1000}]});assert.equal(r.shortCircuits.length,0);});
