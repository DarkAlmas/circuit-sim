const D=require('../devices.js');const a=require('assert');
let c=D.car();for(let i=0;i<100;i++)c.step(100,100,0.01);
a(Math.abs(c.y)<1e-9&&c.x>0.2,'straight');
c=D.car();for(let i=0;i<300;i++)c.step(-60,60,0.01);
a(Math.abs(c.x)<0.01&&Math.abs(c.th)>1,'spin');
c=D.car();c.step(0,0,0.01,(x,y)=>x>0.05?0.05:0.9);a(c.vals[0].refl<0.1,'sensor');
console.log('car ok');
