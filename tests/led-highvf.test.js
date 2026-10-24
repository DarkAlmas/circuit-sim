const test=require('node:test'),assert=require('node:assert');const S=require('../solver.js');
test('LED Vf=3 V через 10 Ом от 5 В проводит ток',()=>{
 const r=S.solve({nodeCount:3,elements:[{type:'V',p:1,n:0,V:5},{type:'R',a:1,b:2,R:10},{type:'D',a:2,b:0,Is:S.ledIs(3),n:2}]});
 assert.ok(r.ok);assert.ok(r.currents[1]>0.15&&r.currents[1]<0.2);});
