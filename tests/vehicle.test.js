const D=require('../devices.js');const a=require('assert');
// 4WD straight
let v=D.vehicle({wheels:[{x:.05,y:-.06,R:.033},{x:.05,y:.06,R:.033},{x:-.05,y:-.06,R:.033},{x:-.05,y:.06,R:.033}]});
for(let i=0;i<100;i++)v.drive([100,100,100,100],null,0.01);a(v.x>0.2&&Math.abs(v.y)<1e-6,'4wd straight');
// tank spin (tracks grip 0.3)
v=D.vehicle({wheels:[{x:0,y:-.07,R:.02,grip:.3},{x:0,y:.07,R:.02,grip:.3}]});
for(let i=0;i<200;i++)v.drive([-80,80],null,0.01);a(Math.abs(v.x)<0.01&&Math.abs(v.th)>1,'tank spin');
// Ackermann-ish: rear driven, front steered free
v=D.vehicle({wheels:[{x:-.08,y:-.06,R:.03},{x:-.08,y:.06,R:.03},{x:.08,y:-.06,R:.03,driven:false},{x:.08,y:.06,R:.03,driven:false}]});
for(let i=0;i<200;i++)v.drive([100,100,null,null],[0,0,.3,.3],0.01);a(Math.abs(v.th)>0.5,'steer');a(Math.sign(v.imu.gz)===Math.sign(v.th),'imu');
v.reset();a(v.x===0&&v.vx===0,'reset');
console.log('vehicle ok');
{const q=Math.PI/4;let m=D.vehicle({wheels:[{x:.06,y:.06,R:.03,roller:-q},{x:.06,y:-.06,R:.03,roller:q},{x:-.06,y:.06,R:.03,roller:q},{x:-.06,y:-.06,R:.03,roller:-q}]});
for(let i=0;i<100;i++)m.drive([-100,100,100,-100],null,0.01);
a(Math.abs(m.y)>0.1&&Math.abs(m.x)<0.01&&Math.abs(m.th)<0.01,'mecanum strafe '+m.x+' '+m.y);console.log('mecanum ok');}
{let w=D.vehicle({body:{l:.2,w:.15},obstacles:[{x:.3,y:-1,w:.1,h:2}]});
let hit=0;for(let i=0;i<300;i++){w.drive([150,150],null,0.01);hit|=w.bump;}
a(hit&&w.x<=0.2+1e-6&&w.x>0.15,'wall stop '+w.x);console.log('collide ok');}
{let w=D.vehicle({body:{r:.08},obstacles:[{x:.3,y:-1,w:.1,h:2}]});for(let i=0;i<300;i++)w.drive([150,150],null,0.01);a(w.x<=.22+1e-6&&w.x>.2,'circle '+w.x);
w=D.vehicle({body:{poly:[[.1,0],[-.05,.07],[-.05,-.07]]},obstacles:[{x:.3,y:-1,w:.1,h:2}]});for(let i=0;i<300;i++)w.drive([150,150],null,0.01);a(w.x<=.2+1e-6&&w.x>.17,'poly '+w.x);console.log('shapes ok');}
