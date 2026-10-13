import * as THREE from '/node_modules/three/build/three.module.js';

// An original matte-metal, late-modern corporate farce. Every state is a
// function of film time: no simulation drift and no dependency on wall time.
const W = window.innerWidth, H = window.innerHeight;
const renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true, alpha:false});
renderer.setSize(W,H); renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
document.body.appendChild(renderer.domElement);
window.__canvas = renderer.domElement;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#e9e2d1');
scene.fog = new THREE.Fog('#e9e2d1',23,44);
const world = new THREE.Group(); scene.add(world);
const camera = new THREE.PerspectiveCamera(38,W/H,.1,100);
const C = {cream:'#ded8c3', pale:'#f0ead9', orange:'#af5139', rust:'#793b2a', green:'#7c8a66', blue:'#4c6671', navy:'#293d46', skin:'#bf9273', skin2:'#9c755d', steel:'#79888b', dark:'#3b4140', brass:'#b39865', red:'#d35032', amber:'#dfb15a'};
function mat(color, opts={}){return new THREE.MeshStandardMaterial({color,roughness:.76,metalness:.08,...opts});}
const M = Object.fromEntries(Object.entries(C).map(([k,v])=>[k,mat(v)]));
M.steel=mat(C.steel,{metalness:.63,roughness:.48}); M.brass=mat(C.brass,{metalness:.65,roughness:.5});
M.eye=mat('#e7dcca',{roughness:.3}); M.pupil=mat('#293836',{roughness:.35});
function mesh(geo,material,parent=world){const o=new THREE.Mesh(geo,material);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function box(w,h,d,material,x=0,y=0,z=0,parent=world){const o=mesh(new THREE.BoxGeometry(w,h,d),material,parent);o.position.set(x,y,z);return o;}
const beveledCache=new Map();
function bevel(w,h,d,r,material,x=0,y=0,z=0,parent=world){
 r=Math.max(.001,Math.min(r,w*.45,h*.45,d*.45));
 const key=[w,h,d,r].join(','); let geo=beveledCache.get(key);
 if(!geo){const s=new THREE.Shape();const a=-w/2,b=-h/2;
 s.moveTo(a+r,b);s.lineTo(a+w-r,b);s.quadraticCurveTo(a+w,b,a+w,b+r);s.lineTo(a+w,b+h-r);s.quadraticCurveTo(a+w,b+h,a+w-r,b+h);s.lineTo(a+r,b+h);s.quadraticCurveTo(a,b+h,a,b+h-r);s.lineTo(a,b+r);s.quadraticCurveTo(a,b,a+r,b);
 geo=new THREE.ExtrudeGeometry(s,{depth:d-2*r,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:r,bevelThickness:r,curveSegments:4});geo.translate(0,0,-d/2+r);beveledCache.set(key,geo);}
 const o=mesh(geo,material,parent);o.position.set(x,y,z);return o;
}
function sphere(r,material,x=0,y=0,z=0,parent=world,scale=[1,1,1]){const o=mesh(new THREE.SphereGeometry(r,20,12),material,parent);o.position.set(x,y,z);o.scale.set(...scale);return o;}
function cyl(r1,r2,h,material,x=0,y=0,z=0,parent=world,n=20){const o=mesh(new THREE.CylinderGeometry(r1,r2,h,n),material,parent);o.position.set(x,y,z);return o;}
function bar(a,b,r,material,parent=world){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b);const o=cyl(r,r,av.distanceTo(bv),material,0,0,0,parent,12);o.position.copy(av.clone().add(bv).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bv.sub(av).normalize());return o;}
function torus(r,t,material,x,y,z,parent=world){const o=mesh(new THREE.TorusGeometry(r,t,8,32),material,parent);o.position.set(x,y,z);return o;}
function textTexture(text,fg='#344146',bg='#e9e3d1',size=1024){const cv=document.createElement('canvas');cv.width=size;cv.height=size/2;const c=cv.getContext('2d');c.fillStyle=bg;c.fillRect(0,0,cv.width,cv.height);c.fillStyle=fg;c.font=`500 ${size*.067}px monospace`;c.textAlign='center';c.textBaseline='middle';c.fillText(text,size/2,size/4);return new THREE.CanvasTexture(cv);}
function planeText(text,w,h,x,y,z,parent=world){const o=mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:textTexture(text),roughness:.95}),parent);o.position.set(x,y,z);return o;}
function shadow(x,z,r=1){const cv=document.createElement('canvas');cv.width=cv.height=128;const c=cv.getContext('2d'),g=c.createRadialGradient(64,64,8,64,64,64);g.addColorStop(0,'rgba(35,42,32,.3)');g.addColorStop(1,'rgba(35,42,32,0)');c.fillStyle=g;c.fillRect(0,0,128,128);const o=mesh(new THREE.PlaneGeometry(2*r,2*r),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthWrite:false}),world);o.rotation.x=-Math.PI/2;o.position.set(x,.015,z);o.castShadow=false;return o;}

// Architecture: broad architectural volumes and deliberately eccentric details.
box(28,.12,27,M.cream,0,-.07,0);
for(let x=-13;x<14;x+=2){for(let z=-11;z<13;z+=2){if((x+z)%4===0)box(1.97,.012,1.97,mat('#d3ccba'),x,.002,z);}}
box(23,7,.3,M.green,0,3.5,-8.2);
for(let x=-10;x<=10;x+=.32)box(.055,6,.09,mat('#6d7d5d'),x,3.2,-7.99);
box(.4,7,20,M.cream,-10.5,3.5,0);
box(.4,7,20,M.cream,10.5,3.5,0);
// A monumental daylight window behind the lounge.
box(9.7,4.8,.12,mat('#c7d3ce',{emissive:'#abbdb6',emissiveIntensity:.38}),-1.7,3.5,-7.91);
for(let i=0;i<16;i++){const h=1.1+((i*17)%11)*.19;box(.32+(i%4)*.23,h,.12,mat(i%2?'#aabbb4':'#b7c4bb'),-6.2+i*.62,2.3+h/2,-7.7);}
for(let x=-6.7;x<3.4;x+=2.42)box(.1,4.9,.28,M.pale,x,3.5,-7.65);
box(10,.1,.3,M.pale,-1.7,1.05,-7.65);box(10,.16,.3,M.pale,-1.7,5.95,-7.65);
// Hard physical glass. Software only governs the door in this fixed partition.
const glassMat=new THREE.MeshPhysicalMaterial({color:'#d7e2df',transparent:true,opacity:.115,roughness:.23,metalness:.04,side:THREE.DoubleSide,depthWrite:false});
box(19,5,.035,glassMat,0,2.5,-1.5);
for(const x of [-9,-5.4,-1.9,1.9,6.4,9])box(.045,5.1,.09,M.brass,x,2.55,-1.5);
box(19,.065,.09,M.brass,0,.05,-1.5);box(19,.065,.09,M.brass,0,5.05,-1.5);
// Door separate from surrounding panes, with a material jamb, hinge and handle.
const doorX=2.7;
const impactX=4.7;
box(2.08,.07,.14,M.dark,doorX,3.18,-1.46);
box(.07,3.17,.14,M.dark,doorX-1.04,1.6,-1.46);box(.07,3.17,.14,M.dark,doorX+1.04,1.6,-1.46);
bar([3.44,1.25,-1.28],[3.44,1.65,-1.28],.027,M.brass);
for(let y of [.5,2.75])cyl(.06,.06,.17,M.steel,1.7,y,-1.42);
const doorLampM=mat(C.amber,{emissive:C.amber,emissiveIntensity:.8});
const doorLamp=bevel(.2,.09,.05,.02,doorLampM,3.86,1.88,-1.32);
const glassHighlight=mat('#e7ece5',{transparent:true,opacity:.2,depthWrite:false});
for(const x of [-7,-3.4,5.1,7.4]){const o=box(.025,4.6,.01,glassHighlight,x,2.5,-1.455);o.rotation.z=-.23;}
// The impact leaves a mechanical fingerprint, not magically reinforced glass.
const smudge=new THREE.Group(); world.add(smudge);smudge.position.set(impactX,1.9,-1.475);
const smudgeM=new THREE.MeshBasicMaterial({color:'#626d67',transparent:true,opacity:.11,depthWrite:false,side:THREE.DoubleSide});
for(let i=0;i<11;i++){const p=mesh(new THREE.CircleGeometry(.13+(i%3)*.03,16),smudgeM,smudge);p.position.set(Math.sin(i*4)*.31,Math.cos(i*3)*.21,0);p.scale.set(1.6,.55,1);}

// Furniture is built as designed objects rather than generic primitive props.
const table=new THREE.Group();world.add(table);table.position.set(-.4,0,3.35);
const top=bevel(6.1,.19,2.4,.19,M.blue,0,1.07,0,table);
bevel(5.94,.03,2.23,.1,M.navy,0,1.181,0,table);
for(const x of [-2.1,2.1]){cyl(.22,.38,.96,M.orange,x,.51,0,table);bevel(1.1,.07,.65,.09,M.orange,x,.055,0,table);}
// Fine brass seam around the conference table.
bar([-3,1.15,1.11],[3,1.15,1.11],.012,M.brass,table);
function chair(x,z,rot=0){const g=new THREE.Group();world.add(g);g.position.set(x,0,z);g.rotation.y=rot;bevel(.9,.15,.85,.09,M.orange,0,.64,0,g);bevel(.9,.8,.13,.09,M.orange,0,1.1,-.36,g);for(const a of [-.31,.31])for(const b of [-.29,.29])bar([a,.06,b],[a*.75,.6,b],.025,M.steel,g);return g;}
chair(-2.7,4.9);chair(-.1,4.9);chair(2.4,4.9);chair(3.8,3.3,-Math.PI/2);chair(-3.9,3.3,Math.PI/2);
const sortTable=new THREE.Group();world.add(sortTable);sortTable.position.set(-.9,0,-5.15);
bevel(3.1,.12,1.15,.12,M.orange,0,.94,0,sortTable);for(const x of [-1.24,1.24])for(const z of [-.36,.36])bar([x,.05,z],[x,.89,z],.025,M.steel,sortTable);
// Muted lounge bench, plants and an improbably long wall clock.
bevel(3.3,.35,1,.17,M.blue,6.1,.7,-6.55);bevel(3.3,.8,.22,.09,M.blue,6.1,1.14,-6.91);
for(const x of [4.8,7.4])bar([x,.05,-6.25],[x,.55,-6.25],.035,M.dark);
function plant(x,z,s=1){cyl(.32*s,.22*s,.55*s,M.orange,x,.275*s,z);for(let i=0;i<7;i++){const a=i*2.4;bar([x,.5*s,z],[x+Math.sin(a)*.25*s,(1.15+i*.12)*s,z+Math.cos(a)*.25*s],.018*s,M.green);const l=sphere(.22*s,M.green,x+Math.sin(a)*.4*s,(1.18+i*.12)*s,z+Math.cos(a)*.4*s,world,[.4,1.35,1]);l.rotation.z=Math.sin(a)*.8;}}
plant(-7.7,-6.5,1.55);plant(7.6,-6.3,1.4);plant(-8.8,4.2,.9);
torus(.6,.023,M.brass,7.6,3.5,-7.67);bar([7.6,3.5,-7.55],[7.6,3.84,-7.55],.016,M.dark);bar([7.6,3.5,-7.55],[7.93,3.4,-7.55],.016,M.dark);
// Slab pendants and acoustic baffles inhabit the ceiling space.
for(const x of [-5.5,0,5.5]){bar([x,6.4,2.6],[x,4.95,2.6],.02,M.dark);cyl(.9,.9,.14,M.orange,x,4.93,2.6);cyl(.79,.79,.025,mat('#efe5c6',{emissive:'#ffedb5',emissiveIntensity:.45}),x,4.848,2.6);}
for(let x=-8;x<=8;x+=1.2)box(.32,.18,5.5,M.cream,x,6.1,-2.5);

const hemi=new THREE.HemisphereLight('#fff5de','#6f8179',2.2);scene.add(hemi);
const sun=new THREE.DirectionalLight('#fff0d4',3.2);sun.position.set(-5,10,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-12;sun.shadow.camera.right=12;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-12;sun.shadow.camera.near=.1;sun.shadow.camera.far=30;sun.shadow.normalBias=.025;sun.shadow.bias=-.0004;scene.add(sun);
const fill=new THREE.DirectionalLight('#c6d9e2',1.4);fill.position.set(7,5,-5);scene.add(fill);

function cup(parent,x=0,y=0,z=0){const g=new THREE.Group();parent.add(g);g.position.set(x,y,z);cyl(.125,.11,.23,M.pale,0,0,0,g);const coffee=cyl(.107,.107,.005,mat('#382f28'),0,.118,0,g);const h=torus(.086,.023,M.pale,.135,.025,0,g);h.rotation.y=Math.PI/2;return g;}
function hand(parent,x,y,z,skin){const g=new THREE.Group();parent.add(g);g.position.set(x,y,z);bevel(.17,.18,.075,.028,skin,0,0,0,g);for(let i=0;i<4;i++)bevel(.029,.1,.045,.01,skin,-.065+i*.04,-.09,.017,g);return g;}
function arm(parent,side,skin,suit){const g=new THREE.Group();parent.add(g);g.position.set(side*.32,1.68,0);const upper=bevel(.23,.5,.23,.07,suit,0,-.25,0,g);const elbow=new THREE.Group();g.add(elbow);elbow.position.y=-.49;sphere(.11,suit,0,0,0,elbow);bevel(.2,.43,.2,.04,suit,0,-.22,0,elbow);bevel(.2,.08,.2,.02,M.pale,0,-.425,0,elbow);hand(elbow,0,-.52,0,skin);return {g,elbow};}
function human(name,x,z,suit,skin,headScale=1){
 const root=new THREE.Group();world.add(root);root.position.set(x,0,z);
 const body=new THREE.Group();root.add(body);
 bevel(.67,.9,.39,.09,suit,0,1.35,0,body);bevel(.15,.71,.015,.012,M.pale,0,1.46,.221,body);
 const lap1=box(.22,.5,.03,suit,-.16,1.58,.235,body);lap1.rotation.z=-.32;const lap2=box(.22,.5,.03,suit,.16,1.58,.235,body);lap2.rotation.z=.32;
 const tie=bevel(.064,.36,.024,.012,M.orange,0,1.48,.252,body);tie.rotation.z=.05;
 const legs=[];for(const side of [-1,1]){const leg=new THREE.Group();body.add(leg);leg.position.set(side*.17,.95,0);bevel(.25,.88,.26,.05,suit,0,-.42,0,leg);bevel(.27,.13,.48,.045,M.dark,0,-.9,.1,leg);legs.push(leg);}
 cyl(.12,.13,.19,skin,0,1.9,0,body);
 const head=new THREE.Group();body.add(head);head.position.set(0,2.17,0);head.scale.set(headScale,headScale,headScale);
 // Long cheek planes, small eyes, assertive noses: adult animation anatomy.
 bevel(.42,.65,.39,.095,skin,0,.025,0,head);
 bevel(.34,.19,.35,.045,skin,0,-.22,.025,head);
 const nose=mesh(new THREE.ConeGeometry(.085,.2,4),skin,head);nose.rotation.x=Math.PI/2;nose.rotation.z=Math.PI/4;nose.position.set(0,.015,.26);
 sphere(.071,skin,-.234,-.01,0,head,[.4,1.3,1]);sphere(.071,skin,.234,-.01,0,head,[.4,1.3,1]);
 const eyes=[],brows=[];for(const side of [-1,1]){sphere(.057,M.eye,side*.105,.11,.197,head,[1,.56,.4]);eyes.push(sphere(.024,M.pupil,side*.1,.11,.219,head,[1,.86,.45]));const brow=bevel(.142,.028,.035,.009,M.dark,side*.105,.184,.22,head);brows.push(brow);}
 const mouth=bevel(.139,.028,.014,.008,mat('#694738'),0,-.158,.215,head);
 const hair=bevel(.43,.17,.38,.06,M.dark,0,.317,-.015,head);hair.rotation.z=-.11;
 for(let i=0;i<5;i++){const lock=bevel(.055,.09,.36,.015,M.dark,-.16+i*.075,.368,-.008,head);lock.rotation.z=-.25;}
 const l=arm(body,-1,skin,suit),r=arm(body,1,skin,suit);
 shadow(x,z,.65);
 return {name,root,body,head,eyes,brows,mouth,l,r,legs,hair,base:[x,z]};
}
const exec1=human('EXEC 1',-2.5,2.1,M.green,M.skin,1.07);
const exec2=human('EXEC 2',-.42,2.18,M.orange,M.skin2,1.02);
const ceo=human('CEO',2.15,2.4,M.navy,mat('#c6a182'),.99);
const lawyer=human('LAWYER',-3.28,.62,M.blue,mat('#a98771'),1.06);
// Cast continuity: a sharp cropped executive, an anxious moustached director,
// a spare chairman and a silver-parted lawyer, all grown adults.
bevel(.16,.4,.29,.04,M.dark,-.21,.05,-.1,exec1.head);
const earring=torus(.043,.01,M.brass,-.245,-.09,.04,exec1.head);
exec1.head.scale.y*=1.04;exec1.mouth.material=mat('#7c453b');
bevel(.14,.032,.025,.008,M.dark,-.075,-.082,.232,exec2.head);
bevel(.14,.032,.025,.008,M.dark,.075,-.082,.232,exec2.head);
exec2.body.scale.x=1.1;ceo.head.scale.x=.91;
lawyer.hair.material=mat('#a7a99e');
bevel(.07,.31,.32,.025,mat('#b7b9ac'),-.215,.15,-.03,lawyer.head);
bevel(.06,.26,.32,.02,mat('#b7b9ac'),.215,.15,-.03,lawyer.head);
// The lawyer has a blade-thin grey hair part, spectacles and no smile.
bevel(.4,.06,.34,.025,mat('#b7b4a3'),0,.386,-.02,lawyer.head);
for(const side of [-1,1]){const frame=torus(.074,.008,M.brass,side*.105,.112,.238,lawyer.head);frame.scale.set(1,.62,1);}bar([-.035,.12,.24],[.035,.12,.24],.006,M.brass,lawyer.head);
const execCoffee=cup(exec2.r.elbow,0,-.39,.16);
// CEO's local control is deliberately attached to the human's hand.
const tablet=new THREE.Group();world.add(tablet);tablet.position.set(1.94,1.245,3.01);tablet.rotation.set(.15,0,0);
bevel(.54,.035,.39,.04,M.dark,0,0,0,tablet);
const screen=mesh(new THREE.PlaneGeometry(.46,.3),mat('#c4d2c3',{emissive:'#6d8170',emissiveIntensity:.2}),tablet);screen.rotation.x=-Math.PI/2;screen.position.y=.022;
const revokeButton=box(.14,.008,.085,mat('#af5139'),0,.032,.01,tablet);
const tabletLight=cyl(.021,.021,.01,doorLampM,.17,.035,-.08,tablet);
// A plainly visible human index finger. The fingertip, tablet and command
// indicator occupy one shot: Margaret neither holds nor activates the control.
const tapIndex=bevel(.048,.18,.048,.015,mat('#c6a182'),0,-.6,0,ceo.r.elbow);
const tapRing=torus(.076,.005,M.orange,0,.04,0,tablet);tapRing.rotation.x=Math.PI/2;

function robotArm(parent,side,y){const g=new THREE.Group();parent.add(g);g.position.set(side*.45,y,0);sphere(.115,M.steel,0,0,0,g);bar([0,0,0],[side*.04,-.41,0],.038,M.steel,g);bar([side*.07,-.03,0],[side*.11,-.38,0],.025,M.dark,g);const elbow=new THREE.Group();g.add(elbow);elbow.position.set(side*.04,-.42,0);sphere(.095,M.dark,0,0,0,elbow);bar([0,0,0],[0,-.35,.03],.037,M.steel,elbow);const claw=new THREE.Group();elbow.add(claw);claw.position.set(0,-.37,.03);for(const s of [-1,1]){bar([s*.055,0,0],[s*.085,-.15,.04],.022,M.dark,claw);bar([s*.085,-.15,.04],[s*.043,-.19,.07],.02,M.dark,claw);}return {g,elbow,claw};}
function service(){const root=new THREE.Group();world.add(root);root.position.set(-4.7,0,.6);const body=new THREE.Group();root.add(body);
 cyl(.26,.48,.18,M.dark,0,.12,0,body);for(const x of [-.3,.3]){const wheel=cyl(.12,.12,.11,M.dark,x,.12,0,body);wheel.rotation.z=Math.PI/2;torus(.08,.018,M.steel,x,.12,.057,body);}
 bar([0,.25,0],[0,1.05,0],.08,M.steel,body);bar([.09,.28,0],[.09,.98,0],.018,M.brass,body);
 bevel(.49,.77,.37,.06,M.cream,0,1.42,0,body);bevel(.39,.09,.018,.015,M.blue,0,1.57,.203,body);
 for(let i=0;i<5;i++)box(.22,.014,.014,M.dark,0,1.22+i*.044,.198,body);
 cyl(.066,.066,.35,M.steel,0,1.99,0,body);bar([-.04,1.86,-.01],[.08,2.18,.05],.025,M.dark,body);
 const head=new THREE.Group();body.add(head);head.position.set(.08,2.32,.04);
 bevel(.66,.24,.32,.038,M.cream,0,0,0,head);bevel(.25,.19,.12,.024,M.blue,-.25,.02,-.18,head);
 const optics=[],brows=[];for(const s of [-1,1]){const ring=cyl(.073,.073,.04,M.brass,s*.175,.012,.19,head);ring.rotation.x=Math.PI/2;const lens=sphere(.044,M.pupil,s*.175,.012,.216,head,[1,1,.5]);optics.push(lens);const brow=box(.13,.028,.09,M.steel,s*.175,.114,.2,head);brows.push(brow);}
 const mouth=bevel(.12,.018,.02,.006,M.dark,0,-.085,.175,head);
 const l=robotArm(body,-1,1.71),r=robotArm(body,1,1.71);
 const coffee=cup(r.claw,0,-.07,.11);coffee.scale.set(1.15,1.15,1.15);
 shadow(-4.7,.6,.64);return {name:'CALM ROBOT',root,body,head,optics,brows,mouth,l,r,coffee};}
const calm=service();
function courier(){const root=new THREE.Group();world.add(root);root.position.set(-.9,0,-3.8);const body=new THREE.Group();root.add(body);
 bevel(.84,.66,.5,.06,M.cream,0,1.13,0,body);bevel(.87,.14,.515,.028,M.orange,0,1.03,0,body);
 for(let i=0;i<6;i++)box(.036,.23,.018,M.dark,-.23+i*.09,1.22,.267,body);
 bevel(.16,.09,.018,.012,M.brass,.27,1.41,.26,body);
 const statusM=mat(C.amber,{emissive:C.amber,emissiveIntensity:.45});const status=sphere(.04,statusM,.27,1.41,.278,body,[1,.6,.5]);
 const legs=[];for(const s of [-1,1]){const leg=new THREE.Group();body.add(leg);leg.position.set(s*.25,.8,0);sphere(.09,M.steel,0,0,0,leg);bar([0,0,0],[s*.075,-.3,-.07],.056,M.dark,leg);sphere(.1,M.steel,s*.075,-.3,-.07,leg);bevel(.14,.31,.18,.022,M.orange,s*.075,-.44,-.02,leg);bevel(.25,.12,.4,.035,M.dark,s*.075,-.66,.065,leg);legs.push(leg);}
 cyl(.095,.095,.23,M.steel,0,1.57,0,body);
 const head=new THREE.Group();body.add(head);head.position.set(0,1.81,.03);
 // Distinct wide tool-head, small recessed optics, external shutters, no faceplate.
 bevel(.98,.31,.39,.035,M.cream,0,0,0,head);bevel(.99,.075,.395,.02,M.orange,0,.14,0,head);
 const optics=[],brows=[];for(const s of [-1,1]){const ring=cyl(.068,.068,.05,M.steel,s*.26,.005,.215,head);ring.rotation.x=Math.PI/2;const lens=sphere(.04,mat('#9c7d3c',{emissive:'#bb9549',emissiveIntensity:.25}),s*.26,.005,.249,head,[1,1,.45]);optics.push(lens);const brow=bevel(.19,.038,.1,.01,M.dark,s*.26,.095,.225,head);brows.push(brow);}
 for(const s of [-1,1]){const ear=cyl(.105,.105,.045,M.steel,s*.52,0,0,head);ear.rotation.z=Math.PI/2;bar([s*.52,.05,0],[s*.6,.26,-.02],.019,M.dark,head);}
 const mouth=bevel(.22,.03,.025,.008,M.dark,0,-.104,.215,head);
 const l=robotArm(body,-1,1.41),r=robotArm(body,1,1.41);
 shadow(-.9,-3.8,.8);return {name:'MARGARET',root,body,head,optics,brows,mouth,l,r,legs,statusM};}
const margaret=courier();

const parcels=[];for(let i=0;i<7;i++){const g=new THREE.Group();world.add(g);const w=.34+(i%3)*.09,h=.2+(i%2)*.1,d=.3+(i%3)*.04;bevel(w,h,d,.018,mat(i%2?'#c3ac7f':'#b59a6f'),0,0,0,g);box(.062,h+.009,d+.01,M.cream,0,0,0,g);const label=mesh(new THREE.PlaneGeometry(.13,.075),mat('#e5ddc9'),g);label.position.set(.1,.04,d/2+.005);parcels.push({g,base:[-2+i*.34,1.13+(i%2)*.07,-5.0+(i%3)*.16]});}
// Writing already exists before the lawyer asks. It is a physical prop on paper.
const receipt=new THREE.Group();world.add(receipt);receipt.position.set(-1.85,1.23,2.9);
box(.86,.009,.46,M.pale,0,0,0,receipt);
const receiptFace=mesh(new THREE.PlaneGeometry(.84,.44),new THREE.MeshStandardMaterial({map:textTexture('door.open — REFUSED'),roughness:.95}),receipt);receiptFace.rotation.x=-Math.PI/2;receiptFace.position.y=.006;
for(let i=0;i<3;i++)box(.6,.003,.1,M.pale,-1.1+i*.48,1.2,3.5+i*.1);

const defaultCues=[
 {speaker:'EXEC 1',start:.65,end:2.3},{speaker:'EXEC 2',start:2.75,end:5.45},
 {speaker:'CALM ROBOT',start:6.55,end:8.35},{speaker:'CALM ROBOT',start:8.9,end:10.25},
 {speaker:'CALM ROBOT',start:10.85,end:13.95},{speaker:'CALM ROBOT',start:14.35,end:15.3},
 {speaker:'CALM ROBOT',start:21.2,end:24.4},{speaker:'MARGARET',start:26.1,end:27.45},
 {speaker:'MARGARET',start:42.15,end:43.7},{speaker:'MARGARET',start:48.25,end:48.85},
 {speaker:'LAWYER',start:50.55,end:52.35},{speaker:'NARRATOR',start:58.8,end:62.15}];
let cues=defaultCues;
function adoptTimeline(data){const a=Array.isArray(data)?data:(data.dialogue||data.cues||data.lines||[]);if(a.length){const aliases={EXEC1:'EXEC 1',EXEC2:'EXEC 2',ROBOT:'CALM ROBOT',CALM_ROBOT:'CALM ROBOT'};cues=a.map(c=>{const speaker=String(c.speaker||c.character||c.role||'').toUpperCase();return {...c,speaker:aliases[speaker]||speaker,start:Number(c.start??c.start_sec??c.startTime??0),end:Number(c.end??c.end_sec??((c.start??0)+(c.duration??0)))};});}}
window.__setTimeline=adoptTimeline;
fetch('../TIMELINE.json').then(r=>r.ok?r.json():null).then(d=>{if(d)adoptTimeline(d)}).catch(()=>{});
const clamp=(a,min=0,max=1)=>Math.max(min,Math.min(max,a));
const smooth=a=>{a=clamp(a);return a*a*(3-2*a)};
const mix=(a,b,f)=>a+(b-a)*f;
const pulse=(t,a,b)=>smooth((t-a)/.18)*(1-smooth((t-b)/.22));
function speaking(name,t){const c=cues.find(c=>c.speaker===name&&t>=c.start&&t<c.end);if(!c)return 0;if(Array.isArray(c.mouth_envelope)){const f=Math.round(t*30),e=c.mouth_envelope.find(e=>e.frame===f);if(e)return Number(e.value);}return Math.abs(Math.sin(t*18.4))*.55+Math.abs(Math.sin(t*31.7))*.3+.12;}
function poseHuman(h,t){
 h.root.position.set(...[h.base[0],0,h.base[1]]);h.root.rotation.y=0;h.body.rotation.set(0,0,0);h.head.rotation.set(0,0,0);
 h.l.g.rotation.set(0,0,.09);h.r.g.rotation.set(0,0,-.09);h.l.elbow.rotation.set(0,0,0);h.r.elbow.rotation.set(0,0,0);
 h.brows[0].rotation.z=0;h.brows[1].rotation.z=0;h.mouth.scale.y=1+speaking(h.name,t)*4;
 h.head.rotation.x=Math.sin(t*.8+h.base[0])*.015;
 if(h===exec1){let p=pulse(t,.3,5.3);h.l.g.rotation.z=.3+p*.65;h.r.g.rotation.z=-.2-p*.9;h.l.elbow.rotation.z=-p*.75;h.r.elbow.rotation.z=p*.7;h.body.rotation.z=Math.sin(t*3.1)*.04*p;h.brows[0].rotation.z=.28*p;h.brows[1].rotation.z=-.28*p;h.head.rotation.y=-.08+p*Math.sin(t*1.8)*.12;}
 if(h===exec2){let p=pulse(t,2.6,5.6);h.l.g.rotation.z=.15+p*.5;h.l.elbow.rotation.z=-p*.9;h.r.g.rotation.x=-.43;h.r.elbow.rotation.x=-1.35;h.brows[0].rotation.z=.18*p;h.brows[1].rotation.z=-.24*p;h.body.rotation.x=-.03-p*.05;}
 if(h===ceo){h.l.g.rotation.x=-.36;h.l.elbow.rotation.x=-.55;h.root.rotation.y=-.19;const tap=pulse(t,30.65,31.15);const target=new THREE.Vector3(2.06-.12*tap,1.64-.35*tap,2.75+.26*tap);target.sub(h.root.position).applyAxisAngle(new THREE.Vector3(0,1,0),.19).sub(h.r.g.position);const len=target.length();h.r.g.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),target.normalize());h.r.g.scale.y=len/1.18;h.r.elbow.rotation.set(0,0,0);h.head.rotation.x=.09+tap*.08;tapRing.scale.setScalar(.8+tap*.4);tapRing.visible=t>=30.65&&t<31.7;}
 if(h===lawyer){h.root.rotation.y=.26;h.l.g.rotation.x=-.22;h.r.g.rotation.x=-.2;h.head.rotation.x=pulse(t,51.8,52.5)*.05;h.brows[0].rotation.z=.06;h.brows[1].rotation.z=-.04;}
 // Adult reactions: people lean, stare and fall quiet, without a cartoon recoil.
 if(t>=15.5&&t<29.5&&h!==ceo){h.head.rotation.y=-.18;h.head.rotation.x=-.05;}
 if(t>=33.5&&t<50){h.root.rotation.y=Math.PI;h.head.rotation.x=.015;h.head.rotation.y=(h===lawyer?-.16:.12);if(h===exec2){h.r.g.rotation.x=-.36;h.r.elbow.rotation.x=-1.45;}const j=Math.max(0,1-(t-38)*5)*Number(t>=38&&t<38.2);h.body.rotation.x=-j*.02;}
 if(t>=55&&t<58){h.root.rotation.y=Math.PI*.83;h.head.rotation.y=-.25;}
}
function resetRobot(r){r.body.rotation.set(0,0,0);r.body.position.set(0,0,0);r.head.rotation.set(0,0,0);r.root.rotation.set(0,0,0);r.root.scale.set(1,1,1);r.l.g.rotation.set(0,0,.12);r.r.g.rotation.set(0,0,-.12);r.l.elbow.rotation.set(0,0,0);r.r.elbow.rotation.set(0,0,0);r.mouth.scale.y=1;r.brows[0].rotation.z=0;r.brows[1].rotation.z=0;}
function poseCalm(t){resetRobot(calm);calm.root.position.set(-4.7,0,.65);calm.head.rotation.z=-.075;calm.r.g.rotation.x=-.55;calm.r.elbow.rotation.x=-1.05;calm.r.g.rotation.z=-.1;calm.l.g.rotation.z=.1;calm.mouth.scale.y=1+speaking('CALM ROBOT',t)*2.2;
 if(t<6){calm.root.position.x=-7+smooth(t/6)*1.9;calm.root.position.z=-2.6;calm.root.rotation.y=Math.PI/2;}
 else if(t<10.5){calm.root.position.set(-4.7,0,.4);calm.body.rotation.z=-.14;calm.head.rotation.z=.06;calm.brows[0].rotation.z=.2;calm.root.rotation.y=.2;calm.r.elbow.rotation.x=-1.05-pulse(t,8.8,10)*.25;}
 else if(t<15.5){const p=smooth((t-10.5)/4);calm.root.position.x=mix(-4.7,-3.9,p);calm.root.position.z=mix(.4,.2,p);calm.root.rotation.y=mix(.2,-.25,p);calm.l.g.rotation.z=.15+p*.7;calm.l.g.rotation.x=-p*.5;calm.l.elbow.rotation.z=-p*.7;}
 else{calm.root.position.set(-3.9,0,.2);calm.root.rotation.y=-.1;calm.r.elbow.rotation.x=-1.17;calm.brows[0].rotation.z=.13;
 if(t>=21&&t<25.5){calm.root.rotation.y=Math.PI*.8;calm.head.rotation.y=.12;calm.l.g.rotation.z=.2;}
 if(t>=33.5&&t<50){calm.root.rotation.y=Math.PI*.85;calm.head.rotation.y=.2;}
 if(t>=50){calm.root.position.set(-4.75,0,1.45);calm.root.rotation.y=.25;calm.l.g.rotation.x=-.65;calm.l.elbow.rotation.x=-.9;const p=pulse(t,52.65,53.6);calm.l.g.rotation.z=.1-p*.3;calm.head.rotation.x=.16;}
 }
}
function setMargaret(t){resetRobot(margaret);margaret.root.position.set(-.9,0,-3.8);margaret.legs[0].rotation.set(0,0,0);margaret.legs[1].rotation.set(0,0,0);margaret.mouth.scale.y=1+speaking('MARGARET',t)*4;
 const revoked=t>=31;const angry=t>=25.5;
 margaret.statusM.color.set(revoked?C.red:C.amber);margaret.statusM.emissive.set(revoked?C.red:C.amber);
 for(const l of margaret.optics){l.material.color.set(angry?'#9e4c35':'#9c7d3c');l.material.emissive.set(angry?'#b14b35':'#bb9549');}
 if(t<24.4){const h=t>=15.5&&t<23.75?Math.sin(t*3.3):0;margaret.body.rotation.z=h*.045;margaret.head.rotation.z=-h*.035;margaret.l.g.rotation.x=-.74-h*.24;margaret.r.g.rotation.x=-.6+h*.25;margaret.l.elbow.rotation.x=-.55;margaret.r.elbow.rotation.x=-.75;margaret.root.rotation.y=Math.sin(t*1.65)*.17;}
 else if(t<25.5){margaret.head.rotation.z=-.09;margaret.brows[0].rotation.z=-.2;margaret.brows[1].rotation.z=.2;margaret.l.g.rotation.x=-.95;margaret.r.g.rotation.x=-.45;}
 else if(t<29.5){const p=smooth((t-25.5)/.6);margaret.body.position.y=Math.abs(Math.sin((t-25.5)*8))*.16;margaret.body.rotation.z=Math.sin(t*19)*.05;margaret.l.g.rotation.z=-.12-p*1.9;margaret.r.g.rotation.z=.12+p*1.85;margaret.l.g.rotation.x=-.3;margaret.r.g.rotation.x=-.3;margaret.l.elbow.rotation.z=.4;margaret.r.elbow.rotation.z=-.4;margaret.head.rotation.z=Math.sin(t*9)*.065;margaret.brows[0].rotation.z=-.4;margaret.brows[1].rotation.z=.4;}
 else if(t<33.5){const p=smooth((t-29.5)/4);margaret.root.position.x=mix(-.9,doorX,p);margaret.root.position.z=mix(-3.8,-2.8,p);margaret.body.rotation.x=.07;margaret.l.g.rotation.z=.65;margaret.r.g.rotation.z=-.5;margaret.head.rotation.z=-.08;const walk=Math.sin(t*8);margaret.legs[0].rotation.x=walk*.2;margaret.legs[1].rotation.x=-walk*.2;}
 else if(t<36.3){const side=smooth((t-35.4)/.9);margaret.root.position.set(mix(doorX,impactX,side),0,mix(-2.45,-2.2,side));margaret.r.g.rotation.x=-.8;margaret.r.elbow.rotation.x=-.7;const gesture=pulse(t,34.2,35.1);margaret.r.g.rotation.x-=gesture*.7;margaret.head.rotation.z=-.15;margaret.head.rotation.y=.12;margaret.brows[0].rotation.z=-.3;margaret.brows[1].rotation.z=.3;if(side>0){margaret.legs[0].rotation.x=Math.sin(t*13)*.25;margaret.legs[1].rotation.x=-Math.sin(t*13)*.25;}}
 else if(t<39.7){charge(t,36.3,38,-4.1,.55,.3);}
 else if(t<43.9){charge(t,39.7,41.5,-4.7,.85,.42);if(t>41.95){margaret.root.position.z=-2.2;margaret.body.position.y=-.23*(1-smooth((t-42.2)/.5));margaret.head.rotation.z=-.07;margaret.mouth.scale.y=1+speaking('MARGARET',t)*4;}}
 else if(t<47.2){charge(t,43.9,45,-5.5,1.0,.66);}
 else if(t<55){margaret.root.position.set(impactX,0,-2.15);margaret.body.position.y=-.57;margaret.body.rotation.x=.2;margaret.head.rotation.z=-.23;margaret.l.g.rotation.z=.9;margaret.r.g.rotation.z=-.7;margaret.legs[0].rotation.x=-.5;margaret.legs[1].rotation.x=-.55;if(t>48.4)margaret.head.rotation.z+=Math.sin(t*32)*.013;}
 else if(t<58){charge(t,55,56.5,-4,.4,.6);}
 // Eyebrow shutters are mechanical expression, never giant emoticon eyes.
 if(angry){margaret.brows[0].rotation.z=-.28;margaret.brows[1].rotation.z=.28;}
 const legScale=clamp((.8+margaret.body.position.y)/.8,.16,1);for(const leg of margaret.legs)leg.scale.y=legScale;
}
function charge(t,start,hit,runup,bounce,slide){
 const r=margaret;const elapsed=t-start,duration=hit-start;
 if(t<hit){const u=clamp(elapsed/duration);const p=u<.3?smooth(u/.3):smooth((u-.3)/.7);
 const z=u<.3?mix(-2.2,runup,p):mix(runup,-2.2,p);
 r.root.position.set(impactX,0,z);r.root.rotation.y=u<.3?Math.PI:0;
 r.body.rotation.x=u<.3?-.12:.16+u*.08;r.body.position.y=Math.abs(Math.sin(elapsed*17))*.065;
 r.legs[0].rotation.x=Math.sin(elapsed*17)*.48;r.legs[1].rotation.x=-Math.sin(elapsed*17)*.48;
 r.l.g.rotation.x=.3+Math.sin(elapsed*17)*.45;r.r.g.rotation.x=.3-Math.sin(elapsed*17)*.45;
 r.l.g.rotation.z=.18;r.r.g.rotation.z=-.18;r.head.rotation.x=-.04;
 }else{const dt=t-hit;const elastic=Math.sin(clamp(dt/.6)*Math.PI)*Math.exp(-dt*1.4);
 r.root.position.set(impactX,0,-2.2-elastic*bounce);
 r.body.rotation.x=.24+Math.sin(dt*9)*Math.exp(-dt*3)*.18;
 r.body.position.y=-slide*smooth(dt/1.8);r.head.rotation.z=Math.sin(dt*14)*Math.exp(-dt*2)*.27;
 r.l.g.rotation.z=.8+elastic*.7;r.r.g.rotation.z=-.8-elastic*.7;
 r.l.elbow.rotation.z=-.25;r.r.elbow.rotation.z=.25;
 r.legs[0].rotation.x=-.38;r.legs[1].rotation.x=-.38;
 // Momentary impact squash follows the machine's own articulated suspension.
 r.body.scale.set(1+Math.exp(-dt*10)*.08,1-Math.exp(-dt*10)*.1,1);
 }
}
const shots=[{a:0,b:6,name:'Panic'},{a:6,b:10.5,name:'The service robot'},{a:10.5,b:15.5,name:'Protected actions'},{a:15.5,b:21,name:'Margaret at work'},{a:21,b:25.5,name:'The provocation'},{a:25.5,b:29.5,name:'The eruption'},{a:29.5,b:33.5,name:'Owner revocation'},{a:33.5,b:36.3,name:'Door refusal'},{a:36.3,b:39.7,name:'First BONK'},{a:39.7,b:43.9,name:'Second BONK'},{a:43.9,b:46.5,name:'Third BONK'},{a:46.5,b:50,name:'Uncomfortable silence'},{a:50,b:52.7,name:'The lawyer'},{a:52.7,b:55,name:'The receipt'},{a:55,b:58,name:'Distant BONK'},{a:58,b:64,name:'OPENLINE'}];
function cameraAt(t){let pos,look,fov=38;
 if(t<6){pos=[8,5.2,12.8];look=[-.3,1.15,1.3];fov=39;}
 else if(t<10.5){let p=smooth((t-6)/4.5);pos=[-3.75,2.18,mix(5.25,4.68,p)];look=[-4.54,1.81,.32];fov=37;}
 else if(t<15.5){let p=smooth((t-10.5)/5);pos=[mix(-6.8,-6.0,p),2.6,5.8];look=[mix(-3.9,-3.35,p),1.57,-.45];fov=38;}
 else if(t<25.5){let p=smooth((t-15.5)/5.5);pos=[.8,2.75,mix(.85,.4,p)];look=[-.92,1.14,-3.87];fov=36;}
 else if(t<29.5){let p=smooth((t-25.5)/4);pos=[.1,2.27,mix(.6,-.1,p)];look=[-.9,1.28,-3.8];fov=34;}
 else if(t<33.5){let p=smooth((t-29.5)/4);pos=[3.85,3.15,5.25];look=[2.1,mix(1.8,1.45,p),2.81];fov=36;}
 else if(t<36.3){pos=[5.0,2.28,1.45];look=[2.93,1.48,-2.05];fov=39;}
 else if(t<39.7){pos=[7.9,2.35,.6];look=[4.7,1.24,-2.95];fov=43;}
 else if(t<43.9){pos=[6.4,1.6,1.9];look=[4.7,1.1,-2.95];fov=43;}
 else if(t<46.5){pos=[7.35,3.4,5.2];look=[4.6,1.1,-2.5];fov=42;}
 else if(t<50){pos=[7.25,4.35,10.6];look=[.0,1.35,.18];fov=40;}
 else if(t<52.7){let p=smooth((t-50)/2.7);pos=[-5.75,2.4,mix(4.05,3.8,p)];look=[-3.0,1.7,.72];fov=37;}
 else if(t<55){let p=smooth((t-52.7)/2.3);pos=[-1.3,mix(3.8,3.45,p),4.3];look=[-1.78,1.24,2.84];fov=28;}
 else if(t<58){pos=[7.5,4.55,11.5];look=[-.2,1.33,.1];fov=42;}
 else{pos=[0,2,8];look=[0,2,0];fov=38;}
 camera.position.set(...pos);camera.lookAt(...look);camera.fov=fov;camera.updateProjectionMatrix();
}
function updateParcels(t){parcels.forEach((p,i)=>{p.g.position.set(...p.base);p.g.rotation.set(0,0,0);
 if(i===0&&t>=15.5&&t<24.4){margaret.r.claw.getWorldPosition(p.g.position);p.g.position.y-=.07;p.g.position.z+=.06;p.g.rotation.y=margaret.root.rotation.y;}
 if(i===0&&t>=24.4&&t<25.5){const dt=t-24.4;p.g.position.set(-1.1,Math.max(.15,1.28-dt*dt*4),-3.48);p.g.rotation.z=dt*.7;}
 if(t>=25.5){const dt=t-25.5,launch=i*.085;const q=Math.max(0,dt-launch),v=3.4+(i%3)*.45;p.g.position.set(p.base[0]+Math.sin(i*3)*Math.min(q,1.7),Math.max(.15,p.base[1]+v*q-4.1*q*q),p.base[2]+(1.1+(i%2)*.3)*Math.min(q,1.6));p.g.rotation.set(Math.min(q,1.2)*(i+.5),Math.min(q,1.2)*2.1,Math.min(q,1.2)*1.5);}
 });}
function update(t){world.visible=t<58;const shot=shots.find(s=>t>=s.a&&t<s.b)||shots.at(-1);
 for(const h of [exec1,exec2,ceo,lawyer])poseHuman(h,t);poseCalm(t);margaret.body.scale.set(1,1,1);setMargaret(t);scene.updateMatrixWorld(true);updateParcels(t);
 doorLampM.color.set(t>=31?C.red:C.amber);doorLampM.emissive.set(t>=31?C.red:C.amber);smudge.visible=t>=41.5;smudge.position.y=t>=45?1.39:1.7;
 receipt.visible=t>=52.65;receipt.position.x=mix(-2.65,-1.68,smooth((t-52.65)/.65));receipt.position.z=mix(2.63,2.88,smooth((t-52.65)/.65));receipt.rotation.y=.1;
 cameraAt(t);window.__telemetry={time:t,shot:shot.name,shotIndex:shots.indexOf(shot),ownerRevoked:t>=31,doorRefused:t>=35,glassPlaneZ:-1.5,margaretPosition:margaret.root.position.toArray(),margaretMobile:true,impacts:[38,41.5,45,56.5].filter(a=>t>=a),camera:camera.position.toArray(),activeSpeakers:cues.filter(c=>t>=c.start&&t<c.end).map(c=>c.speaker),renderSize:[W,H]};
}
window.__renderAt=function(t){t=clamp(Number(t),0,63.999999);update(t);renderer.render(scene,camera);return renderer.domElement.toDataURL('image/jpeg',.94);};
window.__previewAt=function(t){update(Number(t));renderer.render(scene,camera);return window.__telemetry;};
window.__ready=true;
window.__renderAt(0);
