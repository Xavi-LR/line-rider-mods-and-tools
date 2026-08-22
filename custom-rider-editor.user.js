// ==UserScript==
// @name         Custom Rider Editor
// @namespace    https://www.linerider.com/
// @author       xavi
// @description  edit points, bones, and rider sprite
// @version      3.3.0
// @icon         https://www.linerider.com/favicon.ico

// @match        https://www.linerider.com/*
// @match        https://*.official-linerider.com/*
// @match        https://*.surge.sh/*

// @downloadURL  http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/custom-rider-editor.user.js
// @updateURL    http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/lrmp.user.js
// @homepageURL  https://github.com/Xavi-LR/line-rider-mods-and-tools
// @grant        none
// @run-at       document-start
// ==/UserScript==

// ─── Rider template defaults ──────────────────────────────────────────────────

const DEFAULT_RIDER_TEMPLATE = {
  type: 'Rider', riderMounted: true, sledIntact: true,
  framesSinceUnmount: -1, framesSinceSledBreak: -1, entities: [],
  points: [
    { name: 'PEG',      type: 'CollisionPoint', pos: { x: 0,    y: 0    }, friction: 0.8 },
    { name: 'TAIL',     type: 'CollisionPoint', pos: { x: 0,    y: 5    } },
    { name: 'NOSE',     type: 'CollisionPoint', pos: { x: 15,   y: 5    } },
    { name: 'STRING',   type: 'CollisionPoint', pos: { x: 17.5, y: 0    } },
    { name: 'BUTT',     type: 'CollisionPoint', pos: { x: 5,    y: 0    }, friction: 0.8 },
    { name: 'SHOULDER', type: 'CollisionPoint', pos: { x: 5,    y: -5.5 }, friction: 0.8 },
    { name: 'RHAND',    type: 'CollisionPoint', pos: { x: 11.5, y: -5   }, friction: 0.1 },
    { name: 'LHAND',    type: 'CollisionPoint', pos: { x: 11.5, y: -5   }, friction: 0.1 },
    { name: 'LFOOT',    type: 'CollisionPoint', pos: { x: 10,   y: 5    } },
    { name: 'RFOOT',    type: 'CollisionPoint', pos: { x: 10,   y: 5    } },
    { name: 'SCARF_0',  type: 'FlutterPoint',   pos: { x: 3,    y: -5.5 }, airFriction: 0.2 },
    { name: 'SCARF_1',  type: 'FlutterPoint',   pos: { x: 1,    y: -5.5 }, airFriction: 0.2 },
    { name: 'SCARF_2',  type: 'FlutterPoint',   pos: { x: -1,   y: -5.5 }, airFriction: 0.2 },
    { name: 'SCARF_3',  type: 'FlutterPoint',   pos: { x: -3,   y: -5.5 }, airFriction: 0.2 },
    { name: 'SCARF_4',  type: 'FlutterPoint',   pos: { x: -5,   y: -5.5 }, airFriction: 0.2 },
    { name: 'SCARF_5',  type: 'FlutterPoint',   pos: { x: -7,   y: -5.5 }, airFriction: 0.2 },
    { name: 'SCARF_6',  type: 'FlutterPoint',   pos: { x: -9,   y: -5.5 }, airFriction: 0.2 },
  ],
  constraints: [
    { name: 'PEG_TAIL',        type: 'Stick',      p1: 'PEG',      p2: 'TAIL'     },
    { name: 'TAIL_NOSE',       type: 'Stick',      p1: 'TAIL',     p2: 'NOSE'     },
    { name: 'NOSE_STRING',     type: 'Stick',      p1: 'NOSE',     p2: 'STRING'   },
    { name: 'STRING_PEG',      type: 'Stick',      p1: 'STRING',   p2: 'PEG'      },
    { name: 'PEG_NOSE',        type: 'Stick',      p1: 'PEG',      p2: 'NOSE'     },
    { name: 'STRING_TAIL',     type: 'Stick',      p1: 'STRING',   p2: 'TAIL'     },
    { name: 'PEG_BUTT',        type: 'BindStick',  p1: 'PEG',      p2: 'BUTT',     endurance: 0.057 },
    { name: 'TAIL_BUTT',       type: 'BindStick',  p1: 'TAIL',     p2: 'BUTT',     endurance: 0.057 },
    { name: 'NOSE_BUTT',       type: 'BindStick',  p1: 'NOSE',     p2: 'BUTT',     endurance: 0.057 },
    { name: 'SHOULDER_BUTT',   type: 'Stick',      p1: 'SHOULDER', p2: 'BUTT'     },
    { name: 'SHOULDER_LHAND',  type: 'Stick',      p1: 'SHOULDER', p2: 'LHAND'    },
    { name: 'SHOULDER_RHAND',  type: 'Stick',      p1: 'SHOULDER', p2: 'RHAND'    },
    { name: 'BUTT_LFOOT',      type: 'Stick',      p1: 'BUTT',     p2: 'LFOOT'    },
    { name: 'BUTT_RFOOT',      type: 'Stick',      p1: 'BUTT',     p2: 'RFOOT'    },
    { name: 'SHOULDER_RHAND_2',type: 'Stick',      p1: 'SHOULDER', p2: 'RHAND'    },
    { name: 'SHOULDER_PEG',    type: 'BindStick',  p1: 'SHOULDER', p2: 'PEG',      endurance: 0.057 },
    { name: 'STRING_LHAND',    type: 'BindStick',  p1: 'STRING',   p2: 'LHAND',    endurance: 0.057 },
    { name: 'STRING_RHAND',    type: 'BindStick',  p1: 'STRING',   p2: 'RHAND',    endurance: 0.057 },
    { name: 'LFOOT_NOSE',      type: 'BindStick',  p1: 'LFOOT',    p2: 'NOSE',     endurance: 0.057 },
    { name: 'RFOOT_NOSE',      type: 'BindStick',  p1: 'RFOOT',    p2: 'NOSE',     endurance: 0.057 },
    { name: 'SHOULDER_LFOOT',  type: 'RepelStick', p1: 'SHOULDER', p2: 'LFOOT',    lengthFactor: 0.5 },
    { name: 'SHOULDER_RFOOT',  type: 'RepelStick', p1: 'SHOULDER', p2: 'RFOOT',    lengthFactor: 0.5 },
    { name: 'BODY_SLED_JOINT', type: 'BindJoint',  p1: 'SHOULDER', p2: 'BUTT',  q1: 'STRING', q2: 'PEG', key: 'riderMounted' },
    { name: 'SLED_PEG_JOINT',  type: 'BindJoint',  p1: 'PEG',      p2: 'TAIL',  q1: 'STRING', q2: 'PEG', key: 'sledIntact'   },
    { name: 'RIDER_PEG_JOINT', type: 'BindJoint',  p1: 'PEG',      p2: 'TAIL',  q1: 'STRING', q2: 'PEG', key: 'riderMounted' },
    { name: 'SCARF', type: 'DirectedChain', ps: ['SHOULDER','SCARF_0','SCARF_1','SCARF_2','SCARF_3','SCARF_4','SCARF_5','SCARF_6'] },
  ],
};

const CONSTRAINT_TYPES = {
  Stick:        { fields: [] },
  BindStick:    { fields: [{ key: 'endurance',        label: 'Endurance',         default: 0.057 }] },
  RepelStick:   { fields: [{ key: 'lengthFactor',     label: 'Length Factor',     default: 0.5   }] },
  RemountStick: { fields: [
    { key: 'endurance',        label: 'Endurance',         default: 0.057 },
    { key: 'remountEndurance', label: 'Remount Endurance', default: 0.114 },
    { key: 'remountStrength',  label: 'Remount Strength',  default: 0.1   },
  ]},
  BindJoint: { fields: [
    { key: 'q1',  label: 'Q1 Point',  default: ''            },
    { key: 'q2',  label: 'Q2 Point',  default: ''            },
    { key: 'key', label: 'State Key', default: 'riderMounted'},
  ]},
  DirectedChain: { fields: [{ key: 'ps', label: 'Points', default: '' }] },
};

const BADGE = {
  Stick:'stick', BindStick:'bind', RepelStick:'repel',
  RemountStick:'remount', BindJoint:'joint', DirectedChain:'chain',
};

// ─── Preview helpers ──────────────────────────────────────────────────────────

function computeViewState(tpl) {
  const pts = tpl.points || []; if (!pts.length) return { center:{x:0,y:0}, width:1, height:1 };
  const xs = pts.map(p=>p.pos.x), ys = pts.map(p=>p.pos.y);
  const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
  return { center:{x:(minX+maxX)/2,y:(minY+maxY)/2}, width:Math.max(1,maxX-minX), height:Math.max(1,maxY-minY) };
}

function getPointMap(tpl) { const m={}; for (const p of tpl.points||[]) m[p.name]=p; return m; }

function getConstraintSegments(c, pm) {
  if (!c) return [];
  if (c.type==='DirectedChain' && Array.isArray(c.ps)) {
    const segs=[]; for (let i=0;i<c.ps.length-1;i++) { const a=pm[c.ps[i]],b=pm[c.ps[i+1]]; if(a&&b) segs.push([a,b]); } return segs;
  }
  if (c.p1&&c.p2) { const a=pm[c.p1],b=pm[c.p2]; return a&&b?[[a,b]]:[];}
  return [];
}

function getConstraintText(c) {
  if (c.p1&&c.p2) return `${c.p1} ↔ ${c.p2}`;
  if (c.type==='DirectedChain'&&Array.isArray(c.ps)) return `${c.ps[0]} → ${c.ps[c.ps.length-1]}`;
  return c.name||'(unnamed)';
}

function pointRefsConstraint(c, name) {
  if (!c) return false;
  if (c.p1===name||c.p2===name||c.q1===name||c.q2===name) return true;
  return Array.isArray(c.ps)&&c.ps.includes(name);
}

function renamePointRefsInConstraint(c, oldN, newN) {
  if(c.p1===oldN)c.p1=newN; if(c.p2===oldN)c.p2=newN;
  if(c.q1===oldN)c.q1=newN; if(c.q2===oldN)c.q2=newN;
  if(Array.isArray(c.ps))c.ps=c.ps.map(n=>n===oldN?newN:n);
}

function distToSeg(px,py,ax,ay,bx,by) {
  const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy; if(!len2) return Math.hypot(px-ax,py-ay);
  const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/len2));
  return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
}

function getMetrics(canvas, tpl, zoom=1) {
  const v=computeViewState(tpl), W=canvas.width, H=canvas.height;
  const s=Math.max(4,Math.min(10,Math.min((W-36)/v.width,(H-36)/v.height)))*zoom;
  return { W,H,scale:s,center:v.center,
    toScreen(p){ return {x:(p.x-v.center.x)*s+W/2, y:(p.y-v.center.y)*s+H/2}; },
    toModel(x,y){ return {x:(x-W/2)/s+v.center.x,  y:(y-H/2)/s+v.center.y}; },
  };
}

function drawPreview(canvas, tpl, zoom, interaction) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const metrics = getMetrics(canvas, tpl, zoom), {W,H} = metrics;
  const pm = getPointMap(tpl), constraints = tpl.constraints || [];

  ctx.clearRect(0,0,W,H); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H);
  ctx.lineCap='round'; ctx.lineJoin='round';

  // Bones
  for (const c of constraints) {
    const segs = getConstraintSegments(c, pm);
    const sel = interaction&&interaction.selectedBone===c.name;
    const hov = interaction&&interaction.hoveredBone===c.name;
    for (const [a,b] of segs) {
      const pa=metrics.toScreen(a.pos), pb=metrics.toScreen(b.pos);
      ctx.beginPath(); ctx.moveTo(pa.x,pa.y); ctx.lineTo(pb.x,pb.y);
      ctx.strokeStyle = sel?'#000':c.type==='BindStick'?'#e66':c.type==='RepelStick'?'#c6c':c.type==='RemountStick'?'#ea6':c.type==='BindJoint'?'#377':c.type==='DirectedChain'?'#777':'#88c';
      ctx.lineWidth = sel?3:hov?2.5:c.type==='DirectedChain'?1.2:1.6; ctx.stroke();
    }
  }

  // Ghost bone
  if (interaction && interaction.ghostLine) {
    const a=metrics.toScreen(interaction.ghostLine.from.pos), b=metrics.toScreen(interaction.ghostLine.to);
    ctx.save(); ctx.setLineDash([5,4]); ctx.strokeStyle='#000'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); ctx.restore();
  }

  // Points
  for (const p of tpl.points||[]) {
    const cp=metrics.toScreen(p.pos);
    const sel=interaction&&interaction.selectedPoint===p.name, hov=interaction&&interaction.hoveredPoint===p.name;
    ctx.beginPath(); ctx.arc(cp.x,cp.y, p.type==='CollisionPoint'?5:3.5, 0,Math.PI*2);
    ctx.fillStyle=p.type==='CollisionPoint'?'#fff':'#bdf'; ctx.fill();
    ctx.strokeStyle=sel||hov?'#000':'#666'; ctx.lineWidth=sel||hov?2.5:1.4; ctx.stroke();
  }

  return metrics;
}

// ─── Game integration ─────────────────────────────────────────────────────────

function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

function makeUnique(base, existing, fallback='Item') {
  let name = String(base??'').trim() || fallback;
  if (!existing.has(name)) return name;
  let i=2; while (existing.has(`${name}_${i}`)) i++; return `${name}_${i}`;
}

function renamePointInTpl(tpl, oldN, desiredN) {
  const pt = tpl.points.find(p=>p.name===oldN); if (!pt) return oldN;
  const existing = new Set(tpl.points.map(p=>p.name).filter(n=>n!==oldN));
  const next = makeUnique(desiredN, existing, oldN); if (next===oldN) return oldN;
  pt.name=next; for (const c of tpl.constraints||[]) renamePointRefsInConstraint(c,oldN,next); return next;
}

function renameBoneInTpl(tpl, oldN, desiredN) {
  const bone = tpl.constraints.find(c=>c.name===oldN); if (!bone) return oldN;
  const existing = new Set(tpl.constraints.map(c=>c.name).filter(n=>n!==oldN));
  const next = makeUnique(desiredN, existing, oldN); if (next===oldN) return oldN;
  bone.name=next; return next;
}

function buildBoneFromDraft(draft, p1, p2, tpl) {
  const existing = new Set((tpl.constraints||[]).map(c=>c.name));
  const name = makeUnique(`${p1}_${p2}`, existing, `${p1}_${p2}`);
  const bone = { name, type:draft.type, p1, p2 };
  for (const f of CONSTRAINT_TYPES[draft.type]?.fields||[]) {
    const raw = draft[f.key];
    if (f.key==='q1'||f.key==='q2'||f.key==='key') bone[f.key]=raw||f.default;
    else { const n=parseFloat(raw); bone[f.key]=Number.isFinite(n)?n:f.default; }
  }
  return bone;
}

function sanitizeTpl(json) {
  const p = JSON.parse(json);
  p.points=Array.isArray(p.points)?p.points:[];
  p.constraints=Array.isArray(p.constraints)?p.constraints:[];
  return p;
}

window.__customRiderTemplates = window.__customRiderTemplates || {};
function getTemplate(idx) {
  if (!window.__customRiderTemplates[idx]) window.__customRiderTemplates[idx]=deepClone(DEFAULT_RIDER_TEMPLATE);
  return window.__customRiderTemplates[idx];
}

function getLLEngine() {
  try { const t=window.Selectors.getSimulatorTrack(); if(!t||!t.engine) return null; let ll=null; t.engine.useComputed(e=>{ll=e;}); return ll; }
  catch(_) { return null; }
}

function patchProto() {
  const ll=getLLEngine(); if (!ll||typeof ll._getInitialRider!=='function') return false;
  const proto=ll.constructor.prototype; if (proto.__cre_patched) return true;
  const orig=proto._getInitialRider;
  proto._getInitialRider=function(riderState,riderIdx) {
    const c=window.__customRiderTemplates[riderIdx];
    if (c) { const t=deepClone(c); t.sledId=riderIdx; return t; }
    return orig.call(this,riderState,riderIdx);
  };
  proto.__cre_patched=true; return true;
}

function applyToGame() {
  if (!patchProto()) { alert('[CRE] Could not patch engine. Try Play/Pause first then Apply.'); return; }
  try {
    const st=window.store.getState(), riders=window.Selectors.getRiders(st);
    if (!riders||!riders.length) { alert('[CRE] No riders found.'); return; }
    window.store.dispatch({type:'SET_RIDERS',payload:riders.map(r=>({...r,startAngle:(r.startAngle||0)+0.0001}))});
    window.store.dispatch({type:'SET_RIDERS',payload:riders.map(r=>({...r}))});
    requestAnimationFrame(()=>requestAnimationFrame(()=>creApplyAllSprites().catch(()=>{})));
  } catch(err) { console.error('[CRE]',err); alert('[CRE] Apply failed: '+err.message); }
}



// ─── Sprite editor / renderer-compatible sprite-sheet layer ────────────────────
// The default sheet is embedded so the userscript is self-contained. The actual
// Line Rider renderer consumes the generated spriteSheets from renderer state,
// which means editor/playback/video-export all use the same sprite data.
const CRE_DEFAULT_SPRITE_SVG = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" xmlns:lr=\"https://www.linerider.com\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" version=\"1.1\">\n  <style type=\"text/css\"><![CDATA[\n    .lr-bbox {\n      display: none;\n      stroke-width: 0.2px;\n      stroke: blue;\n      fill: none;\n    }\n    .no-fill {\n      fill: none;\n    }\n    .flag {\n      fill: rgba(0,0,0,0.4);\n    }\n    .outline {\n      stroke: black;\n      stroke-width: 0.3;\n    }\n    .skin {\n      fill: white;\n    }\n    .hair {\n      fill: black;\n    }\n    .eye {\n      fill: black;\n    }\n    .torso {\n      fill: white;\n    }\n    .scarfEven {\n      fill: white;\n    }\n    .scarf1 {\n      fill: #FD4F38;\n    }\n    .scarf3 {\n      fill: #06A725;\n    }\n    .scarf5 {\n      fill: #3995FD;\n    }\n    .hat .ball {\n      fill: black;\n    }\n    .hat .top {\n      fill: white;\n    }\n    .hat .bottom {\n      stroke: black;\n      stroke-width: 1;\n      stroke-linecap: round;\n    }\n    .sled {\n      fill: white;\n    }\n    .arm .sleeve {\n      fill: black;\n    }\n    .arm .hand {\n      fill: white;\n    }\n    .leg .pants {\n      fill: black;\n    }\n    .leg .foot {\n      fill: white;\n    }\n  ]]></style>\n\n\n\n  <g class=\"lr-entity\" lr:entity=\"flag\">\n    <defs>\n      <path id=\"flag\" class=\"flag\" transform=\"translate(-6 -21)\" d=\"M6,3A1,1 0 0,1 7,4V4.88C8.06,4.44 9.5,4 11,4C14,4 14,6 16,6C19,6 20,4 20,4V12C20,12 19,14 16,14C13,14 13,12 11,12C8,12 7,14 7,14V21H5V4A1,1 0 0,1 6,3Z\"/>\n      <path id=\"start-flag\" class=\"flag\" transform=\"translate(-6 -21)\" d=\"M6,3A1,1 0 0,1 7,4V4.88C8.06,4.44 9.5,4 11,4C14,4 14,6 16,6C19,6 20,4 20,4V12C20,12 19,14 16,14C13,14 13,12 11,12C8,12 7,14 7,14V21H5V4A1,1 0 0,1 6,3M7,7.25V11.5C7,11.5 9,10 11,10C13,10 14,12 16,12C18,12 18,11 18,11V7.5C18,7.5 17,8 16,8C14,8 13,6 11,6C9,6 7,7.25 7,7.25Z\"/>\n    </defs>\n    <g class=\"lr-sprite\" lr:anchor=\"START_FLAG\">\n      <use class=\"lr-anchor\" x=\"3\" y=\"20\" xlink:href=\"#start-flag\"/>\n    <rect class=\"lr-bbox\" x=\"1\" y=\"1\" width=\"17\" height=\"20\"/></g>\n    <g class=\"lr-sprite\" lr:anchor=\"FLAG\">\n      <use class=\"lr-anchor\" x=\"21\" y=\"20\" xlink:href=\"#flag\"/>\n    <rect class=\"lr-bbox\" x=\"19\" y=\"1\" width=\"17\" height=\"20\"/></g>\n  </g>\n\n  <g class=\"lr-entity\" lr:entity=\"rider\">\n    <defs>\n      <!-- head parts -->\n      <g id=\"head\">\n        <rect class=\"skin\" x=\"7\" y=\"-2.25\" width=\"3.1\" height=\"4.5\"/>\n        <rect class=\"hair\" x=\"9.95\" y=\"-2.25\" width=\"0.3\" height=\"4.5\"/>\n      </g>\n      <rect id=\"face-outline\" class=\"hair\" x=\"7\" y=\"-0.15\" width=\"3.1\" height=\"0.3\"/>\n      <rect id=\"hair\" y=\"-2.4\" class=\"fill\" width=\"3.1\" height=\"4.8\"/>\n      <polygon id=\"eye\" points=\"0.4,-0.4 0,-0.5 -0.4,-0.4 -0.5,0 -0.4,0.4 0,0.5 0.4,0.4 0.5,0\"/>\n      <path id=\"nose\" class=\"outline skin\" d=\"M 0 -0.25 v 0.4 c 0.1 1.3 1.2 1.2 3.1 0 v -0.4\"/>\n\n      <g> <!-- sled parts -->\n        <path id=\"sled-top\" class=\"sled outline\" d=\"M13.6-2.2c-1.35,0-2.55,0.75-3.15,1.85H0C-0.2-0.35-0.35-0.2-0.35,0S-0.2,0.35,0,0.35h1.75V1.2l0.7-0.45v-0.4h6.6V0.7l0.7,0.5V0.35h0.35C10.05,0.5,10,0.7,10,0.9c0,0.2,0.15,0.35,0.35,0.35c0.15,0,0.3-0.1,0.35-0.25c0.05-0.2,0.1-0.45,0.2-0.65h0.9c0.2,0,0.35-0.15,0.35-0.35S12-0.35,11.8-0.35h-0.5c0.5-0.7,1.35-1.15,2.3-1.15c0.99,0,1.85,0.47,2.38,1.2l0.99,0.38C16.43-1.25,15.12-2.2,13.6-2.2z\"/>\n        <path id=\"sled-middle\" class=\"sled outline\" d=\"M9.75,1.2L9.05,0.7L9.05,4.05L9.75,4.35z\"/>\n        <path id=\"sled-tail\" class=\"sled outline\" d=\"M2.45,4.4V0.75L1.75,1.2v3.2H-0.2c-0.2,0-0.35,0.15-0.35,0.35S-0.4,5.1-0.2,5.1h6.85l-0.9-0.7H2.45z\"/>\n        <path id=\"sled-nose\" class=\"sled outline\" d=\"M15.98-0.3c0.36,0.49,0.57,1.09,0.57,1.75c0,1.65-1.3,2.95-2.95,2.95H9.75V4.35l-0.7-0.3V4.4h-3.3l0.9,0.7h6.95c2,0,3.65-1.65,3.65-3.65c0-0.48-0.1-0.95-0.27-1.37L15.98-0.3z\"/>\n        <path id=\"sled\" class=\"sled outline\" d=\"M13.6-2.2c-1.35,0-2.55,0.75-3.15,1.85H0C-0.2-0.35-0.35-0.2-0.35,0S-0.2,0.35,0,0.35h1.75V4.4H-0.2c-0.2,0-0.35,0.15-0.35,0.35S-0.4,5.1-0.2,5.1h13.8c2,0,3.65-1.65,3.65-3.65S15.6-2.2,13.6-2.2zM9.05,4.4h-6.6V0.35h6.6V4.4z M13.6,4.4H9.75V0.35h0.35C10.05,0.5,10,0.7,10,0.9c0,0.2,0.15,0.35,0.35,0.35c0.15,0,0.3-0.1,0.35-0.25c0.05-0.2,0.1-0.45,0.2-0.65h0.9c0.2,0,0.35-0.15,0.35-0.35S12-0.35,11.8-0.35h-0.5c0.5-0.7,1.35-1.15,2.3-1.15c1.65,0,2.95,1.3,2.95,2.95C16.55,3.1,15.25,4.4,13.6,4.4z\"/>\n      </g>\n\n      <g id=\"arm\" class=\"arm outline\">\n        <path class=\"sleeve\" d=\"M5,0.7H0c-0.4,0-0.7-0.3-0.7-0.7S-0.4-0.7,0-0.7h5\"/>\n        <path class=\"hand\" d=\"M5-0.7h0.5c0,0,0.3-0.7,0.5-0.6c0.2,0.1,0,0.6,0,0.6s0.4,0,0.6,0c0.2,0,0.5,0.3,0.5,0.7c0,0.4-0.2,0.7-0.5,0.7c-0.5,0-1.6,0-1.6,0\"/>\n      </g>\n\n      <g id=\"leg\" class=\"leg outline\">\n        <path class=\"pants\" d=\"M4.8-0.7H0c-0.4,0-0.7,0.3-0.7,0.7S-0.4,0.7,0,0.7h4.8\"/>\n        <path class=\"foot\" d=\"M4.8,0.7h2.4l0-2.7L6.7-2L6-0.7H4.8\"/>\n      </g>\n\n      <g id=\"body\">\n        <rect class=\"torso outline\" x=\"0\" y=\"-2.2\" width=\"7\" height=\"4.4\"/>\n        <g class=\"neck\">\n          <rect class=\"scarf1 scarfOdd\" stroke-width=\"0\" x=\"5.2\" y=\"1.5\" width=\"2\" height=\"1\"/>\n          <rect class=\"scarf2 scarfEven\" stroke-width=\"0\" x=\"5.2\" y=\"0.5\" width=\"2\" height=\"1\"/>\n          <rect class=\"scarf3 scarfOdd\" stroke-width=\"0\" x=\"5.2\" y=\"-0.5\" width=\"2\" height=\"1\"/>\n          <rect class=\"scarf4 scarfEven\" stroke-width=\"0\" x=\"5.2\" y=\"-1.5\" width=\"2\" height=\"1\"/>\n          <rect class=\"scarf5 scarfOdd\" stroke-width=\"0\" x=\"5.2\" y=\"-2.5\" width=\"2\" height=\"1\"/>\n        </g>\n        <g class=\"hat\">\n          <path class=\"top outline\" d=\"M11-2.6h-0.4v5.2H11c1.2,0,2.2-1.2,2.2-2.6S12.2-2.6,11-2.6z\"/>\n          <path class=\"bottom\" d=\"M10.6-2.6 v5.2\"/>\n          <circle class=\"ball\" cx=\"13.9\" cy=\"0\" r=\"0.7\"/>\n        </g>\n      </g>\n      <rect id=\"scarf0\" class=\"scarf0 scarfEven\" x=\"0\" y=\"-1\" width=\"2\" height=\"2\"/>\n      <rect id=\"scarf1\" class=\"scarf1 scarfOdd\" x=\"0\" y=\"-1\" width=\"2\" height=\"2\"/>\n      <rect id=\"scarf2\" class=\"scarf2 scarfEven\" x=\"0\" y=\"-1\" width=\"2\" height=\"2\"/>\n      <rect id=\"scarf3\" class=\"scarf3 scarfOdd\" x=\"0\" y=\"-1\" width=\"2\" height=\"2\"/>\n      <rect id=\"scarf4\" class=\"scarf4 scarfEven\" x=\"0\" y=\"-1\" width=\"2\" height=\"2\"/>\n      <rect id=\"scarf5\" class=\"scarf5 scarfOdd\" x=\"0\" y=\"-1\" width=\"2\" height=\"2\"/>\n    </defs>\n\n    <g class=\"lr-sprite\" lr:anchor=\"SHOULDER\" lr:lookAt=\"SCARF_0\" id=\"base-scarf\">\n      <use class=\"lr-anchor\" x=\"38\" y=\"20\" xlink:href=\"#scarf0\"/>\n    <rect class=\"lr-bbox\" x=\"37\" y=\"18\" width=\"4\" height=\"4\"/></g>\n    <g class=\"lr-sprite\" lr:copy=\"base-scarf\" lr:anchor=\"SCARF_0\" lr:lookAt=\"SCARF_1\"/>\n\n    <g class=\"lr-sprite\" lr:anchor=\"SCARF_1\" lr:lookAt=\"SCARF_2\">\n      <use class=\"lr-anchor\" x=\"38\" y=\"25\" xlink:href=\"#scarf1\"/>\n    <rect class=\"lr-bbox\" x=\"37\" y=\"23\" width=\"4\" height=\"4\"/></g>\n\n    <g class=\"lr-sprite\" lr:anchor=\"SCARF_2\" lr:lookAt=\"SCARF_3\">\n      <use class=\"lr-anchor\" x=\"43\" y=\"30\" xlink:href=\"#scarf2\"/>\n    <rect class=\"lr-bbox\" x=\"42\" y=\"28\" width=\"4\" height=\"4\"/></g>\n\n    <g class=\"lr-sprite\" lr:anchor=\"SCARF_3\" lr:lookAt=\"SCARF_4\">\n      <use class=\"lr-anchor\" x=\"38\" y=\"30\" xlink:href=\"#scarf3\"/>\n    <rect class=\"lr-bbox\" x=\"37\" y=\"28\" width=\"4\" height=\"4\"/></g>\n\n    <g class=\"lr-sprite\" lr:anchor=\"SCARF_4\" lr:lookAt=\"SCARF_5\">\n      <use class=\"lr-anchor\" x=\"43\" y=\"35\" xlink:href=\"#scarf4\"/>\n    <rect class=\"lr-bbox\" x=\"42\" y=\"33\" width=\"4\" height=\"4\"/></g>\n\n    <g class=\"lr-sprite\" lr:anchor=\"SCARF_5\" lr:lookAt=\"SCARF_6\">\n      <use class=\"lr-anchor\" x=\"38\" y=\"35\" xlink:href=\"#scarf5\"/>\n    <rect class=\"lr-bbox\" x=\"37\" y=\"33\" width=\"4\" height=\"4\"/></g>\n\n    <g class=\"lr-sprite\" lr:anchor=\"PEG\" lr:lookAt=\"STRING\">\n      <use class=\"lr-anchor\" x=\"2.5\" y=\"36.5\" xlink:href=\"#sled-top-base\"/>\n      <defs>\n        <use id=\"sled-top-base\" xlink:href=\"#sled-top\">\n          <animate repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"2s\" lr:param=\"broken\" attributeName=\"opacity\" values=\"0; 1; 1\" keyTimes=\"0; 0.01; 1\"/>\n        </use>\n      </defs>\n    <rect class=\"lr-bbox\" x=\"1\" y=\"33\" width=\"20\" height=\"6\"/></g>\n    <g class=\"lr-sprite\" lr:anchor=\"PEG\" lr:lookAt=\"STRING\">\n      <use class=\"lr-anchor\" x=\"25.1\" y=\"32\" xlink:href=\"#sled-middle-base\"/>\n      <defs>\n        <use id=\"sled-middle-base\" xlink:href=\"#sled-middle\">\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"2s\" lr:param=\"broken\" type=\"rotate\" values=\"0 9.5 0.7; 0 9.5 0.7; 75 9.5 0.7\" keyTimes=\"0; 0.02; 1\"/>\n          <animate repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"2s\" lr:param=\"broken\" attributeName=\"opacity\" values=\"0; 1; 1\" keyTimes=\"0; 0.01; 1\"/>\n        </use>\n      </defs>\n    <rect class=\"lr-bbox\" x=\"33\" y=\"31\" width=\"3\" height=\"7\"/></g>\n    <g class=\"lr-sprite\" lr:anchor=\"PEG\" lr:lookAt=\"STRING\">\n      <use class=\"lr-anchor\" x=\"23.75\" y=\"31.75\" xlink:href=\"#sled-tail-base\"/>\n      <defs>\n        <use id=\"sled-tail-base\" xlink:href=\"#sled-tail\">\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"2s\" lr:param=\"broken\" type=\"rotate\" values=\"0 -1 3; 0 -1 3; -20 -1 3\" keyTimes=\"0; 0.02; 1\"/>\n          <animate repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"2s\" lr:param=\"broken\" attributeName=\"opacity\" values=\"0; 1; 1\" keyTimes=\"0; 0.01; 1\"/>\n        </use>\n      </defs>\n    <rect class=\"lr-bbox\" x=\"22\" y=\"31\" width=\"10\" height=\"7\"/></g>\n    <g class=\"lr-sprite\" lr:anchor=\"PEG\" lr:lookAt=\"STRING\">\n      <use class=\"lr-anchor\" x=\"17.55\" y=\"23.7\" xlink:href=\"#sled-nose-base\"/>\n      <defs>\n        <use id=\"sled-nose-base\" xlink:href=\"#sled-nose\">\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"2s\" lr:param=\"broken\" type=\"rotate\" values=\"0 16 0; 0 16 0; 17 16 0\" keyTimes=\"0; 0.02; 1\"/>\n          <animate repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"2s\" lr:param=\"broken\" attributeName=\"opacity\" values=\"0; 1; 1\" keyTimes=\"0; 0.01; 1\"/>\n        </use>\n      </defs>\n    <rect class=\"lr-bbox\" x=\"22\" y=\"22\" width=\"14\" height=\"8\"/></g>\n    <g class=\"lr-sprite\" lr:anchor=\"PEG\" lr:lookAt=\"STRING\" lr:cam=\"sled\">\n      <use class=\"lr-anchor\" x=\"2.6\" y=\"25.5\" xlink:href=\"#sled-base\"/>\n      <defs>\n        <use id=\"sled-base\" xlink:href=\"#sled\">\n          <animate repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"2s\" lr:param=\"broken\" attributeName=\"opacity\" values=\"1; 1; 0; 0\" keyTimes=\"0; 0.01; 0.02; 1\"/>\n        </use>\n      </defs>\n    <rect class=\"lr-bbox\" x=\"1\" y=\"22\" width=\"20\" height=\"10\"/></g>\n\n    <g class=\"lr-sprite lr-stretch\" lr:anchor=\"LHAND\" lr:lookAt=\"STRING\" id=\"base-string\">\n      <use class=\"lr-anchor\" x=\"43\" y=\"19.5\" xlink:href=\"#string\"/>\n      <defs>\n        <line id=\"string\" x1=\"0\" y1=\"0\" x2=\"8\" y2=\"0\" stroke-width=\"0.3\" stroke=\"black\">\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"2s\" lr:param=\"crashed\" type=\"translate\" values=\"0 0; 8 0\" keyTimes=\"0; 1\"/>\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"2s\" lr:param=\"crashed\" type=\"scale\" values=\"1 1; 0 1\" keyTimes=\"0; 1\"/>\n        </line>\n      </defs>\n    <rect class=\"lr-bbox\" x=\"42\" y=\"18\" width=\"10\" height=\"3\"/></g>\n\n    <g class=\"lr-sprite\" lr:anchor=\"SHOULDER\" lr:lookAt=\"LHAND\" id=\"base-arm\" lr:cam=\"rider\">\n      <use class=\"lr-anchor\" x=\"54.75\" y=\"18.75\" xlink:href=\"#arm\"/>\n    <rect class=\"lr-bbox\" x=\"53\" y=\"16\" width=\"10\" height=\"5\"/></g>\n\n    <g class=\"lr-sprite\" lr:anchor=\"BUTT\" lr:lookAt=\"LFOOT\" id=\"base-leg\" lr:cam=\"rider\">\n      <use class=\"lr-anchor\" x=\"53.3\" y=\"13.15\" xlink:href=\"#leg\"/>\n    <rect class=\"lr-bbox\" x=\"51\" y=\"10\" width=\"11\" height=\"5\"/></g>\n\n    <g class=\"lr-sprite\" lr:copy=\"base-leg\" lr:anchor=\"BUTT\" lr:lookAt=\"RFOOT\" lr:cam=\"rider\"/>\n\n    <g class=\"lr-sprite\" lr:anchor=\"BUTT\" lr:lookAt=\"SHOULDER\">\n      <use class=\"lr-anchor\" x=\"31.45\" y=\"13.5\" xlink:href=\"#head\"/>\n    <rect class=\"lr-bbox\" x=\"37\" y=\"10\" width=\"6\" height=\"7\"/></g>\n    <g class=\"lr-sprite\" lr:anchor=\"BUTT\" lr:lookAt=\"SHOULDER\">\n      <use class=\"lr-anchor\" x=\"36.45\" y=\"23.5\" xlink:href=\"#left-face-outline\"/>\n      <defs>\n        <use id=\"left-face-outline\" xlink:href=\"#face-outline\">\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"8s\" lr:param=\"rotation\" type=\"translate\" values=\"0 -2.4; 0 -2.4; 0 -2.25; 0 -2.25; 0 -2.4\" keyTimes=\"0; 0.5; 0.55; 0.95; 1\"/>\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"8s\" lr:param=\"rotation\" type=\"scale\" values=\"1 1; 1 1; 1 0; 1 0; 1 1\" keyTimes=\"0; 0.5; 0.55; 0.95; 1\"/>\n        </use>\n      </defs>\n    <rect class=\"lr-bbox\" x=\"42\" y=\"22\" width=\"6\" height=\"3\"/></g>\n    <g class=\"lr-sprite\" lr:anchor=\"BUTT\" lr:lookAt=\"SHOULDER\">\n      <use class=\"lr-anchor\" x=\"36.45\" y=\"23.5\" xlink:href=\"#right-face-outline\"/>\n      <defs>\n        <use id=\"right-face-outline\" xlink:href=\"#face-outline\">\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"8s\" lr:param=\"rotation\" type=\"translate\" values=\"0 2.4; 0 2.25; 0 2.25; 0 2.4; 0 2.4\" keyTimes=\"0; 0.05; 0.45; 0.5; 1\"/>\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"8s\" lr:param=\"rotation\" type=\"scale\" values=\"1 1; 1 0; 1 0; 1 1; 1 1\" keyTimes=\"0; 0.05; 0.45; 0.5; 1\"/>\n        </use>\n      </defs>\n    <rect class=\"lr-bbox\" x=\"42\" y=\"22\" width=\"6\" height=\"3\"/></g>\n    <g class=\"lr-sprite\" lr:anchor=\"BUTT\" lr:lookAt=\"SHOULDER\">\n      <use class=\"lr-anchor\" x=\"49.5\" y=\"2.5\" xlink:href=\"#nose-base\"/>\n      <defs>\n        <use id=\"nose-base\" xlink:href=\"#nose\" transform=\"translate(7 0)\">\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"8s\" lr:param=\"rotation\" type=\"translate\" values=\"0 2.25; 0 2.25; 0 -2.25; 0 -2.25\" keyTimes=\"0; 0.5; 0.5; 1\"/>\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"8s\" lr:param=\"rotation\" type=\"scale\" values=\"1 0; 1 1; 1 0; 1 0; 1 -1; 1 0\" keyTimes=\"0; 0.25; 0.5; 0.5; 0.75; 1\"/>\n        </use>\n      </defs>\n    <rect class=\"lr-bbox\" x=\"55\" y=\"1\" width=\"6\" height=\"4\"/></g>\n    <g class=\"lr-sprite\" lr:anchor=\"BUTT\" lr:lookAt=\"SHOULDER\">\n      <use class=\"lr-anchor\" x=\"56.5\" y=\"7.5\" xlink:href=\"#left-eye\"/>\n      <defs>\n        <use id=\"left-eye\" xlink:href=\"#eye\">\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"8s\" lr:param=\"rotation\" type=\"translate\" values=\"8.5 4; 8.5 -6.4\" keyTimes=\"0; 1\"/>\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"8s\" lr:param=\"rotation\" type=\"translate\" values=\"0 -0.5; 0 -0.5; 0 0.5; 0 0.5\" keyTimes=\"0; 0.5; 0.5; 1\"/>\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"8s\" lr:param=\"rotation\" type=\"scale\" values=\"1 0; 1 0; 1 1; 1 1; 1 0; 1 0\" keyTimes=\"0; 0.09; 0.16; 0.56; 0.73; 1\"/>\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"8s\" lr:param=\"rotation\" type=\"translate\" values=\"0 0.5; 0 0.5; 0 -0.5; 0 -0.5\" keyTimes=\"0; 0.5; 0.5; 1\"/>\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"1s\" lr:param=\"blinking\" type=\"scale\" values=\"1 1; 0.5 1.3\" keyTimes=\"0; 1\"/>\n        </use>\n      </defs>\n    <rect class=\"lr-bbox\" x=\"55\" y=\"6\" width=\"3\" height=\"3\"/></g>\n    <g class=\"lr-sprite\" lr:anchor=\"BUTT\" lr:lookAt=\"SHOULDER\">\n      <use class=\"lr-anchor\" x=\"60.5\" y=\"7.5\" xlink:href=\"#right-eye\"/>\n      <defs>\n        <use id=\"right-eye\" xlink:href=\"#eye\">\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"8s\" lr:param=\"rotation\" type=\"translate\" values=\"8.5 6.4; 8.5 -4\" keyTimes=\"0; 1\"/>\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"8s\" lr:param=\"rotation\" type=\"translate\" values=\"0 -0.5; 0 -0.5; 0 0.5; 0 0.5\" keyTimes=\"0; 0.5; 0.5; 1\"/>\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"8s\" lr:param=\"rotation\" type=\"scale\" values=\"1 0; 1 0; 1 1; 1 1; 1 0; 1 0\" keyTimes=\"0; 0.27; 0.44; 0.84; 0.91; 1\"/>\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"8s\" lr:param=\"rotation\" type=\"translate\" values=\"0 0.5; 0 0.5; 0 -0.5; 0 -0.5\" keyTimes=\"0; 0.5; 0.5; 1\"/>\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"1s\" lr:param=\"blinking\" type=\"scale\" values=\"1 1; 0.5 1.3\" keyTimes=\"0; 1\"/>\n        </use>\n      </defs>\n    <rect class=\"lr-bbox\" x=\"59\" y=\"6\" width=\"3\" height=\"3\"/></g>\n    <g class=\"lr-sprite\" lr:anchor=\"BUTT\" lr:lookAt=\"SHOULDER\">\n      <use class=\"lr-anchor\" x=\"38.45\" y=\"13.5\" xlink:href=\"#hair-base\"/>\n      <defs>\n        <use id=\"hair-base\" xlink:href=\"#hair\" transform=\"translate(7 0)\">\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"8s\" lr:param=\"rotation\" type=\"translate\" values=\"0 0; 0 -2.4; 0 2.4; 0 0\" keyTimes=\"0; 0.45; 0.55; 1\"/>\n          <animateTransform attributeName=\"transform\" additive=\"sum\" repeatCount=\"indefinite\" begin=\"ba.end\" dur=\"8s\" lr:param=\"rotation\" type=\"scale\" values=\"1 1; 1 0; 1 0; 1 1\" keyTimes=\"0; 0.45; 0.55; 1\"/>\n        </use>\n      </defs>\n    <rect class=\"lr-bbox\" x=\"44\" y=\"10\" width=\"6\" height=\"7\"/></g>\n    <g class=\"lr-sprite\" lr:anchor=\"BUTT\" lr:lookAt=\"SHOULDER\" lr:cam=\"rider\">\n      <use class=\"lr-anchor\" x=\"38.25\" y=\"5\" xlink:href=\"#body\"/>\n    <rect class=\"lr-bbox\" x=\"37\" y=\"1\" width=\"17\" height=\"8\"/></g>\n\n    <g class=\"lr-sprite\" lr:copy=\"base-string\" lr:anchor=\"RHAND\" lr:lookAt=\"STRING\"/>\n\n    <g class=\"lr-sprite\" lr:copy=\"base-arm\" lr:anchor=\"SHOULDER\" lr:lookAt=\"RHAND\"/>\n  </g>\n\n\n\n\n</svg>";

window.__customRiderSpriteConfigs = window.__customRiderSpriteConfigs || {};
window.__customRiderSpriteSheets = window.__customRiderSpriteSheets || [];
window.__customRiderSpritePreviewImages = window.__customRiderSpritePreviewImages || [];

function creNum(v, fallback=0) { const n=parseFloat(v); return Number.isFinite(n)?n:fallback; }

function creSvgPointAttr(el, name) {
  const ns='https://www.linerider.com';
  const v=el.getAttributeNS(ns,name);
  if (v!==null && v!=='') return v;
  return el.getAttribute('lr:'+name) || el.getAttribute(name) || null;
}

function creClassHas(el, name) { return !!(el.classList && el.classList.contains(name)); }

function creParseAnim(el) {
  const params=['rotation','blinking','broken','crashed'];
  const types=['opacity','translate','scale','rotate'];
  const parseOne=(a)=>{
    const p=creSvgPointAttr(a,'param');
    if(!params.includes(p)) return null;
    const values=(a.getAttribute('values')||'').split(';');
    const keyTimes=(a.getAttribute('keyTimes')||'').split(';');
    const attribute=a.getAttribute('attributeName');
    let type=attribute==='opacity'?'opacity':(attribute==='transform'?a.getAttribute('type'):null);
    if(!types.includes(type)) return null;
    return {param:p,type,keyframes:values.map((v,i)=>({time:creNum(keyTimes[i],0),args:v.trim().split(/\s+/).filter(Boolean).map(creNum)}))};
  };
  const out=[];
  const opa=el.querySelector('animate'); if(opa) { const x=parseOne(opa); if(x) out.push({__opacity:x}); }
  for(const a of el.querySelectorAll('animateTransform')) { const x=parseOne(a); if(x) out.push(x); }
  return out;
}

function creResolveSprite(el, root, stack=[]) {
  const anchor=creSvgPointAttr(el,'anchor'), lookAt=creSvgPointAttr(el,'lookAt'), cam=creSvgPointAttr(el,'cam'), copy=creSvgPointAttr(el,'copy');
  let base={anchor,lookAt,cam,stretch:creClassHas(el,'lr-stretch'),coords:null,transforms:[],opacity:null,copy:null};
  if(copy) {
    if(stack.includes(copy)) throw new Error('Circular lr:copy in sprite SVG: '+copy);
    const src=root.getElementById(copy);
    if(src) base={...creResolveSprite(src,root,[...stack,copy]),anchor:anchor||creResolveSprite(src,root,[...stack,copy]).anchor,lookAt:lookAt||creResolveSprite(src,root,[...stack,copy]).lookAt,cam:cam||creResolveSprite(src,root,[...stack,copy]).cam};
  }
  const a=el.querySelector('.lr-anchor');
  const b=el.querySelector('.lr-bbox');
  if(a&&b) {
    base.coords={anchor:{x:creNum(a.getAttribute('x')),y:creNum(a.getAttribute('y'))},bbox:{x:creNum(b.getAttribute('x')),y:creNum(b.getAttribute('y')),width:creNum(b.getAttribute('width')),height:creNum(b.getAttribute('height'))}};
    base._baseCoords=creDeepSprite(base.coords);
    const anims=creParseAnim(el);
    base.transforms=anims.filter(x=>!x.__opacity);
    const op=anims.find(x=>x.__opacity); if(op) base.opacity=op.__opacity;
  }
  return base;
}

function creParseDefaultSpriteSvg(svgText) {
  const doc=new DOMParser().parseFromString(svgText,'image/svg+xml');
  const root=doc.documentElement;
  const width=creNum(root.getAttribute('width'),64), height=creNum(root.getAttribute('height'),64);
  const map={};
  for(const entity of root.querySelectorAll('.lr-entity')) {
    const entityName=creSvgPointAttr(entity,'entity');
    if(!entityName) continue;
    map[entityName]=[];
    let idx=0;
    for(const el of entity.querySelectorAll(':scope > .lr-sprite')) {
      const m=creResolveSprite(el,root);
      m.id=idx++;
      m.defaultLabel=(CRE_DEFAULT_SPRITE_LABELS[idx - 1] || ((m.anchor||'?')+(m.lookAt?' → '+m.lookAt:'')+(m.cam?' ['+m.cam+']':'')));
      m.label=m.defaultLabel;
      m.offsetX=0; m.offsetY=0; m.enabled=true;
      m.customSvg=null; m.customViewBox=null; m.customSize=null; m.customSlot=null; m.customAnchorX=0; m.customAnchorY=0; m.customScale=1;
      if(m.copy) m.copy=null;
      map[entityName].push(m);
    }
  }
  // Patch the label typo-free after template literals have been created.
  for(const arr of Object.values(map)) for(const m of arr) m.label=m.defaultLabel;
  return {svgText,width,height,mappings:map};
}


// ─── Easy-to-edit default sprite labels ───────────────────────────────────────
// Edit these strings to change the labels shown in the Sprite Parts list.
// Any omitted index falls back to the mapping's normal "ANCHOR → LOOK_AT" label.
const CRE_DEFAULT_SPRITE_LABELS = [
  'Scarf 0',
  'Scarf 1',
  'Scarf 2',
  'Scarf 3',
  'Scarf 4',
  'Scarf 5',
  'Scarf 6',
  'Sled Top',
  'Sled Middle',
  'Sled Tail',
  'Sled Nose',
  'Sled Main',
  'String',
  'Left Arm',
  'Left Leg',
  'Right Leg',
  'Head',
  'Face Outline A',
  'Face Outline B',
  'Nose',
  'Left Eye',
  'Right Eye',
  'Hair',
  'Body',
  'String',
  'Right Arm',
];

const CRE_DEFAULT_SPRITE_DATA = (()=>{
  try { return creParseDefaultSpriteSvg(CRE_DEFAULT_SPRITE_SVG); } catch(e) { console.error('[CRE] Failed to parse embedded sprite SVG',e); return {svgText:CRE_DEFAULT_SPRITE_SVG,width:64,height:64,mappings:{rider:[]}}; }
})();

function creDeepSprite(v) { return JSON.parse(JSON.stringify(v)); }

function creGetSpriteConfig(idx) {
  if(!window.__customRiderSpriteConfigs[idx]) {
    const defaults=creDeepSprite(CRE_DEFAULT_SPRITE_DATA.mappings.rider||[]);
    window.__customRiderSpriteConfigs[idx]={mappings:defaults,version:1};
  }
  return window.__customRiderSpriteConfigs[idx];
}

function creGetAvailablePointNamesFromTemplate(tpl) { return new Set((tpl?.points||[]).map(p=>p.name)); }

// The sprite renderer does NOT read the editable rider template directly. It
// reads the raw rider generated by the simulator. Custom points therefore have
// to exist in that raw rider before a sprite may reference them.
function creGetRendererPointNames(riderIdx) {
  try {
    let frame=0;
    try { frame=Number(window.Selectors?.getPlayerIndex?.()||0); } catch(_) {}
    if(!Number.isFinite(frame)) frame=0;

    // Use the SimulatorTrack API directly. Its getRawRiders() is the exact
    // source consumed by the renderer's EntityGenerator (which builds
    // entity.points from every raw rider point). Going through getLLEngine()
    // can return the underlying computed engine at a different lifecycle
    // stage, which made newly-added custom points appear to be missing even
    // though the rider had already been rebuilt.
    const track=window.Selectors?.getSimulatorTrack?.();
    if(track && typeof track.getRawRiders==='function') {
      const riders=track.getRawRiders(frame);
      const rider=riders&&riders[riderIdx];
      if(rider && Array.isArray(rider.points))
        return new Set(rider.points.map(p=>p.name).filter(Boolean));
    }

    // Fallback for unusual/custom builds of Line Rider.
    const ll=getLLEngine();
    if(ll && typeof ll.getRawRiders==='function') {
      const riders=ll.getRawRiders(frame);
      const rider=riders&&riders[riderIdx];
      if(rider && Array.isArray(rider.points))
        return new Set(rider.points.map(p=>p.name).filter(Boolean));
    }
  } catch(_) {}
  return null;
}

const CRE_STOCK_SPRITE_POINT_NAMES=new Set([
  'FLAG','START_FLAG','PEG','TAIL','NOSE','STRING','BUTT','SHOULDER','RHAND','LHAND',
  'LFOOT','RFOOT','SCARF_0','SCARF_1','SCARF_2','SCARF_3','SCARF_4','SCARF_5','SCARF_6'
]);

function creGetSafeRendererPointNames(riderIdx) {
  const actual=creGetRendererPointNames(riderIdx);
  if(actual) return actual;
  // Before the simulator has rebuilt, never expose arbitrary custom names to
  // the renderer. Stock names are safe and preserve the normal rider render.
  return CRE_STOCK_SPRITE_POINT_NAMES;
}

function creFilterSafeMappings(mappings, pointNames) {
  return (mappings||[]).filter(m=>m && m.enabled!==false && pointNames.has(m.anchor) && (!m.lookAt || pointNames.has(m.lookAt)));
}

function creNamespaceImportedSvg(svgText, prefix) {
  const doc=new DOMParser().parseFromString(svgText,'image/svg+xml');
  const root=doc.documentElement;
  if(!root || root.nodeName.toLowerCase()!=='svg') throw new Error('The imported file is not an SVG.');
  const ids=new Map();
  root.querySelectorAll('[id]').forEach(el=>{ const old=el.id; const next=prefix+old; ids.set(old,next); el.setAttribute('id',next); });
  root.querySelectorAll('*').forEach(el=>{
    for(const attr of [...el.attributes]) {
      let v=attr.value;
      for(const [old,next] of ids) {
        v=v.replaceAll(`url(#${old})`,`url(#${next})`).replaceAll(`#${old}`, `#${next}`);
      }
      el.setAttribute(attr.name,v);
    }
  });
  const parts=[...root.childNodes].map(n=>new XMLSerializer().serializeToString(n)).join('');
  const vb=(root.getAttribute('viewBox')||'0 0 '+creNum(root.getAttribute('width'),64)+' '+creNum(root.getAttribute('height'),64)).trim();
  const vs=vb.split(/\s+/).map(Number);
  const w=Number.isFinite(vs[2])?vs[2]:64, h=Number.isFinite(vs[3])?vs[3]:64;
  return {content:parts,viewBox:vb,width:w,height:h};
}

function creRectOverlaps(a,b,pad=0) {
  return !(a.x+a.width+pad<=b.x || b.x+b.width+pad<=a.x || a.y+a.height+pad<=b.y || b.y+b.height+pad<=a.y);
}

function creCollectOccupiedSheetRects(mappings) {
  const rects=[];
  for(const entity of Object.values(CRE_DEFAULT_SPRITE_DATA.mappings||{})) {
    for(const m of (entity||[])) if(m.coords?.bbox) rects.push({...m.coords.bbox});
  }
  for(const m of (mappings||[])) {
    if(m.customSlot) rects.push({...m.customSlot});
    else if(m.coords?.bbox && m.id>=0 && m.id<(CRE_DEFAULT_SPRITE_DATA.mappings.rider||[]).length) rects.push({...m.coords.bbox});
  }
  return rects;
}

function creFindFreeSheetSlot(w,h,occupied,preferred=null) {
  const W=64,H=64,pad=1;
  const tryAt=(x,y)=>{
    const r={x,y,width:w,height:h};
    if(x<0||y<0||x+w>W||y+h>H) return null;
    for(const o of occupied) if(creRectOverlaps(r,o,pad)) return null;
    return r;
  };
  if(preferred) { const r=tryAt(preferred.x,preferred.y); if(r) return r; }
  for(let y=0;y<=H-h;y++) for(let x=0;x<=W-w;x++) {
    const r=tryAt(x,y); if(r) return r;
  }
  return null;
}

function creGetSpriteMappingForOutput(m, slotOverride=null) {
  const out=creDeepSprite(m);
  const base=out._baseCoords||out.coords;
  if(!base) return out;
  const baseBox=base.bbox;
  if(out.customSvg) {
    let slot=slotOverride || out.customSlot;
    if(!slot) slot={x:baseBox.x,y:baseBox.y,width:Math.max(1,baseBox.width),height:Math.max(1,baseBox.height)};
    const svgW=Math.max(0.01,creNum(out.customSvg.width,64));
    const svgH=Math.max(0.01,creNum(out.customSvg.height,64));
    const userScale=Math.max(0.01,creNum(out.customScale,1));
    const fit=Math.min(slot.width/svgW,slot.height/svgH);
    const scale=Math.max(0.01,fit*userScale);
    const w=Math.max(0.01,svgW*scale), h=Math.max(0.01,svgH*scale);
    const ax=slot.x+creNum(out.customAnchorX,0)*scale-creNum(out.offsetX,0);
    const ay=slot.y+creNum(out.customAnchorY,0)*scale-creNum(out.offsetY,0);
    out.__customComposite={x:slot.x,y:slot.y,width:slot.width,height:slot.height,drawWidth:w,drawHeight:h,viewBox:out.customSvg.viewBox,content:out.customSvg.content};
    out.coords={anchor:{x:ax,y:ay},bbox:{...slot}};
    out.customSlot=slot;
  } else {
    out.coords={anchor:{x:base.anchor.x-creNum(out.offsetX,0),y:base.anchor.y-creNum(out.offsetY,0)},bbox:{...base.bbox}};
  }
  return out;
}

function creBuildSpriteSvgForRider(riderIdx, mappings, availablePointNames=null) {
  const pointNames=availablePointNames || creGetSafeRendererPointNames(riderIdx);
  const safe=creFilterSafeMappings(mappings, pointNames);
  const base=CRE_DEFAULT_SPRITE_SVG;
  const doc=new DOMParser().parseFromString(base,'image/svg+xml');
  const root=doc.documentElement;
  const riderEntity=[...root.querySelectorAll('.lr-entity')].find(el=>creSvgPointAttr(el,'entity')==='rider') || root.querySelector('.lr-entity');
  const originalSprites=riderEntity?[...riderEntity.querySelectorAll(':scope > .lr-sprite')]:[];
  const occupied=creCollectOccupiedSheetRects(safe);
  const riderMaps=[];
  for(const original of safe) {
    const m=creDeepSprite(original);
    if(m.customSvg) {
      const originalBox=original._baseCoords?.bbox || original.coords?.bbox || {x:48,y:40,width:8,height:8};
      const pref=(original.customSlot && {...original.customSlot}) ||
        (original.id>=0 && original.id<originalSprites.length ? {...originalBox} : null);
      // Replacements reuse their own stock slot whenever possible. Brand-new
      // parts are allocated from genuinely unused sheet space, avoiding flags.
      let slot=creFindFreeSheetSlot(Math.max(1,originalBox.width),Math.max(1,originalBox.height),[],pref);
      if(original.id>=0 && original.id<originalSprites.length) {
        slot=creFindFreeSheetSlot(Math.max(1,originalBox.width),Math.max(1,originalBox.height),occupied.filter(r=>!(r.x===originalBox.x&&r.y===originalBox.y&&r.width===originalBox.width&&r.height===originalBox.height)),pref) || pref;
      } else {
        // Give new parts a little more room when possible, then shrink to fit.
        const sw=Math.max(4,Math.min(16,creNum(original.customSize?.width,8)*creNum(original.customScale,1)));
        const sh=Math.max(4,Math.min(16,creNum(original.customSize?.height,8)*creNum(original.customScale,1)));
        slot=creFindFreeSheetSlot(Math.max(1,Math.round(sw)),Math.max(1,Math.round(sh)),occupied,null);
      }
      if(!slot) {
        console.warn('[CRE] No free native 64×64 sprite-sheet space for custom part',original.label||original.id);
        continue;
      }
      m.customSlot=slot;
      const out=creGetSpriteMappingForOutput(m,slot);
      riderMaps.push(out);
      occupied.push({...slot});
      if(m.id>=0 && m.id<originalSprites.length) originalSprites[m.id].remove();
    } else riderMaps.push(creGetSpriteMappingForOutput(m));
  }
  // Append custom SVG art inside the existing 64×64 atlas. The nested SVG is
  // restricted to the allocated slot; the mapping bbox points at that slot.
  for(const m of riderMaps) {
    if(!m.__customComposite) continue;
    const c=m.__customComposite;
    const ns=doc.createElementNS('http://www.w3.org/2000/svg','svg');
    ns.setAttribute('x',String(c.x)); ns.setAttribute('y',String(c.y));
    ns.setAttribute('width',String(c.width)); ns.setAttribute('height',String(c.height));
    ns.setAttribute('viewBox',c.viewBox); ns.setAttribute('preserveAspectRatio','none');
    const wrap=doc.createElementNS('http://www.w3.org/2000/svg','g');
    try {
      const frag=new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">'+c.content+'</svg>','image/svg+xml').documentElement;
      const inner=doc.createElementNS('http://www.w3.org/2000/svg','svg');
      inner.setAttribute('x','0'); inner.setAttribute('y','0'); inner.setAttribute('width',String(c.drawWidth)); inner.setAttribute('height',String(c.drawHeight));
      inner.setAttribute('viewBox',c.viewBox); inner.setAttribute('preserveAspectRatio','none');
      for(const child of [...frag.childNodes]) inner.appendChild(doc.importNode(child,true));
      wrap.appendChild(inner);
    } catch(_) {}
    ns.appendChild(wrap); root.appendChild(ns);
    delete m.__customComposite;
  }
  const svgText=new XMLSerializer().serializeToString(root);
  return {svgText,mappings:riderMaps,width:64,height:64,safeCount:safe.length};
}

function creBlobImage(svgText,width,height) {
  return new Promise((resolve,reject)=>{
    const img=new Image(); img.width=width; img.height=height;
    const blob=new Blob([svgText],{type:'image/svg+xml'}), url=URL.createObjectURL(blob);
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
    img.onerror=e=>{URL.revokeObjectURL(url);reject(new Error('Failed to rasterize generated sprite SVG.'));};
    img.src=url;
  });
}

function creMakeSpriteSheet(riderIdx, built, idSuffix='live') {
  // IMPORTANT: a Line Rider sprite sheet contains mappings for every entity type
  // (rider, flag, etc.), not just the rider. Dropping the other mappings causes
  // the renderer's costOf() lookup to throw "unknown entity type: flag".
  // Keep the complete default mapping table and replace only the rider mappings.
  const mappingObj=creDeepSprite(CRE_DEFAULT_SPRITE_DATA.mappings||{});
  mappingObj.rider=built.mappings;
  const sheet={
    id:`cre-${riderIdx}-${idSuffix}`,
    image:null,
    mappings:mappingObj,
    cameraMappings:{},
    width:built.width,
    height:built.height
  };
  // Rebuild camera mappings from every entity type, preserving the stock flag/
  // camera mappings as well as custom rider mappings.
  for(const [entityType,arr] of Object.entries(mappingObj)) {
    for(const m of (Array.isArray(arr)?arr:[])) {
      if(m.cam) (sheet.cameraMappings[m.cam] ||= []).push(m);
    }
  }
  return sheet;
}

async function creBuildAllSpriteSheets() {
  const liveRiders=((()=>{try{return window.Selectors?.getRiders?.(window.store.getState())||null;}catch(_){return null;}})());
  const n=Math.max(1, Number(liveRiders?.length||window.Selectors?.getNumRiders?.()||Object.keys(window.__customRiderTemplates||{}).length||1));
  const cfgSheets=[];
  for(let i=0;i<n;i++) {
    const cfg=creGetSpriteConfig(i);
    const pointNames=creGetSafeRendererPointNames(i);
    const built=creBuildSpriteSvgForRider(i,cfg.mappings,pointNames);
    const sheet=creMakeSpriteSheet(i,built,'v'+(cfg.version||1));
    sheet.image=await creBlobImage(built.svgText,built.width,built.height);
    cfgSheets.push(sheet);
  }
  window.__customRiderSpriteSheets=cfgSheets;
  window.__customRiderSpritePreviewImages=cfgSheets.map(s=>s.image);
  return cfgSheets;
}

function creReorderSheetsForLineRider(sheets) {
  const n=sheets.length; if(n<=1) return sheets;
  // Line Rider's getSpriteSheet selector rotates state sheets so renderer index r
  // receives state sheet (r+1)%n. Invert that here so UI rider r stays rider r.
  const state=new Array(n); for(let r=0;r<n;r++) state[(r+1)%n]=sheets[r]; return state;
}

function creDispatchSpriteSheets(sheets) {
  if(!window.store) return;
  const stateSheets=creReorderSheetsForLineRider(sheets);
  window.store.dispatch({type:'SET_SPRITE_SHEETS',payload:stateSheets});
}

async function creApplyAllSprites() {
  try { const sheets=await creBuildAllSpriteSheets(); creDispatchSpriteSheets(sheets); return true; } catch(e) { console.error('[CRE] Sprite build/apply failed',e); return false; }
}

function creSyncSpriteSheetsBeforeRiderDispatch(riders) {
  try {
    if(!Array.isArray(riders)||!window.store||!window.__customRiderSpriteSheets?.length) return;
    const out=[];
    for(let i=0;i<riders.length;i++) {
      const base=window.__customRiderSpriteSheets[i] || window.__customRiderSpriteSheets[0];
      if(!base) continue;
      const names=new Set((riders[i]?.points||[]).map(p=>p.name));
      const safe={...base,mappings:creDeepSprite(base.mappings||{}),cameraMappings:{}};
      safe.mappings.rider=creFilterSafeMappings(base.mappings?.rider,names);
      for(const [entityType,arr] of Object.entries(safe.mappings)) {
        for(const m of (Array.isArray(arr)?arr:[])) {
          if(m.cam) (safe.cameraMappings[m.cam] ||= []).push(m);
        }
      }
      out.push(safe);
    }
    if(out.length) window.store.dispatch({type:'SET_SPRITE_SHEETS',payload:creReorderSheetsForLineRider(out)});
  } catch(e) { console.warn('[CRE] Pre-emptive sprite safety sync failed',e); }
}

function crePatchDispatchForMissingPointSafety() {
  const store=window.store; if(!store||store.__cre_sprite_dispatch_patched) return false;
  const orig=store.dispatch.bind(store);
  store.dispatch=function(action) {
    try {
      if(action && action.type==='SET_RIDERS' && Array.isArray(action.payload)) creSyncSpriteSheetsBeforeRiderDispatch(action.payload);
    } catch(_) {}
    const result=orig(action);
    // SET_RIDERS triggers the simulator rebuild asynchronously. Do not leave
    // custom-point sprite mappings suppressed forever: once the raw rider has
    // rebuilt, refresh against the actual renderer-visible point names.
    if(action && action.type==='SET_RIDERS' && window.__customRiderSpriteConfigs) {
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(window.__customRiderSpriteConfigs) creApplyAllSprites().catch(()=>{});
      }));
    }
    return result;
  };
  store.__cre_sprite_dispatch_patched=true;
  return true;
}

function creResetSpriteConfig(idx) {
  window.__customRiderSpriteConfigs[idx]={mappings:creDeepSprite(CRE_DEFAULT_SPRITE_DATA.mappings.rider||[]),version:1};
}

function creSpriteExportJson() {
  return JSON.stringify({version:1,riders:window.__customRiderSpriteConfigs},null,2);
}

function creSpriteImportJson(text) {
  const obj=JSON.parse(text);
  if(!obj || typeof obj!=='object' || !obj.riders) throw new Error('Not a CRE sprite configuration.');
  window.__customRiderSpriteConfigs=obj.riders;
}

function creSpritePreviewMappings(idx) {
  const cfg=creGetSpriteConfig(idx);
  const pointNames=creGetAvailablePointNamesFromTemplate(getTemplate(idx));
  return creFilterSafeMappings(cfg.mappings,pointNames).map(m=>creGetSpriteMappingForOutput(m));
}

function creAnimArgs(anim,t) {
  if(!anim||!anim.keyframes||!anim.keyframes.length) return null;
  if(t<=0) return anim.keyframes[0].args;
  if(t>=1) return anim.keyframes[anim.keyframes.length-1].args;
  let i=anim.keyframes.findIndex(k=>k.time>t);
  if(i<1) return anim.keyframes[0].args;
  const a=anim.keyframes[i-1],b=anim.keyframes[i],u=(t-a.time)/Math.max(1e-9,b.time-a.time);
  return a.args.map((v,j)=>(1-u)*v+u*b.args[j]);
}
function creGetPreviewTransform(m,param,t) {
  let tx=null;
  for(const a of (m.transforms||[])) if(a.param===param) { tx=a; break; }
  const args=creAnimArgs(tx,t);
  if(!tx||!args) return null;
  if(tx.type==='translate') return {type:'translate',x:args[0]||0,y:args[1]||0};
  if(tx.type==='scale') return {type:'scale',x:args[0]??1,y:args[1]??args[0]??1};
  if(tx.type==='rotate') return {type:'rotate',deg:args[0]||0,x:args[1]||0,y:args[2]||0};
  return null;
}
function creGetPreviewOpacity(m,param,t) {
  const a=m.opacity;
  if(!a||a.param!==param) return 1;
  const args=creAnimArgs(a,t);
  return args&&args.length?args[0]:1;
}

function creDrawSpritePreview(canvas, idx, image, animParam='broken', animT=0) {
  if(!canvas) return;
  const ctx=canvas.getContext('2d'); if(!ctx) return;
  const tpl=getTemplate(idx), pts=getPointMap(tpl), W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H); ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
  const all=Object.values(pts); if(!all.length) return;
  const xs=all.map(p=>p.pos.x), ys=all.map(p=>p.pos.y), minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const scale=Math.max(5,Math.min(14,Math.min((W-30)/Math.max(1,maxX-minX),(H-65)/Math.max(1,maxY-minY))));
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
  const sx=p=>(p.x-cx)*scale+W/2, sy=p=>(p.y-cy)*scale+40+(H-80)/2;
  ctx.save();ctx.strokeStyle='#bbb';ctx.lineWidth=1;
  for(const c of tpl.constraints||[]) { const segs=getConstraintSegments(c,getPointMap(tpl)); for(const [a,b] of segs){ctx.beginPath();ctx.moveTo(sx(a.pos),sy(a.pos));ctx.lineTo(sx(b.pos),sy(b.pos));ctx.stroke();} }
  ctx.restore();
  if(image){
    for(const m of creSpritePreviewMappings(idx)) {
      const a=pts[m.anchor]; if(!a) continue; const at=pts[m.lookAt]; if(m.lookAt&&!at) continue;
      const bb=m.coords?.bbox, an=m.coords?.anchor; if(!bb||!an) continue;
      ctx.save();
      ctx.globalAlpha=creGetPreviewOpacity(m,animParam,animT);
      const ax=sx(a.pos),ay=sy(a.pos); ctx.setTransform(scale,0,0,scale,ax,ay);
      if(m.lookAt){const dx=at.pos.x-a.pos.x,dy=at.pos.y-a.pos.y;ctx.rotate(Math.atan2(dy,dx));if(m.stretch)ctx.scale(Math.hypot(dx,dy)/Math.max(.001,bb.width-2),1);}
      const ptx=creGetPreviewTransform(m,animParam,animT);
      if(ptx){
        if(ptx.type==='translate')ctx.translate(ptx.x,ptx.y);
        else if(ptx.type==='scale')ctx.scale(ptx.x,ptx.y);
        else if(ptx.type==='rotate'){ctx.translate(ptx.x,ptx.y);ctx.rotate(ptx.deg*Math.PI/180);ctx.translate(-ptx.x,-ptx.y);}
      }
      ctx.translate(bb.x-an.x,bb.y-an.y);
      ctx.drawImage(image,bb.x,bb.y,bb.width,bb.height,0,0,bb.width,bb.height);
      ctx.restore();
    }
  }
  for(const p of all){ctx.beginPath();ctx.arc(sx(p.pos),sy(p.pos),p.type==='CollisionPoint'?3:2,0,Math.PI*2);ctx.fillStyle=p.type==='CollisionPoint'?'#fff':'#cde';ctx.fill();ctx.strokeStyle='#666';ctx.lineWidth=1;ctx.stroke();}
  ctx.fillStyle='#333';ctx.font='10px monospace';ctx.fillText(`${animParam}: ${Math.round(animT*100)}%`,8,H-10);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const {React, store} = window;
  const e = React.createElement;

  const css = `
    .cre-root{user-select:none;display:inline-block;color:#000}
    .cre-panel{font-family:monospace;font-size:12px;background:#f4f4f4;border:1px solid #777;border-radius:3px;padding:8px;margin-top:6px;color:#000;width:400px;box-sizing:border-box;box-shadow:0 1px 0 rgba(0,0,0,.08)}
    .cre-panel.cre-panel-popout{position:fixed;right:18px;bottom:70px;z-index:99999;transform:scale(1.28);transform-origin:top right;box-shadow:0 10px 36px rgba(0,0,0,.28);max-height:calc(100vh - 36px);overflow:auto}
    .cre-row{display:flex;align-items:center;gap:4px;margin:3px 0;flex-wrap:wrap}
    .cre-label{color:#111;min-width:16px}
    .cre-input,.cre-select,.cre-textarea{background:#fff;border:1px solid #666;color:#000;padding:2px 4px;border-radius:3px;font:inherit}
    .cre-input:focus,.cre-select:focus,.cre-textarea:focus{outline:1px solid #7aa7ff}
    .cre-input{width:88px}
    .cre-btn{background:transparent;border:1px solid #666;color:#000;padding:3px 8px;border-radius:3px;cursor:pointer;font:inherit}
    .cre-btn:hover{background:#eaeaea}
    .cre-btn.active{background:lightblue}
    .cre-btn.danger{background:#f7d7d7;border-color:#a55}
    .cre-btn.success{background:#def0de;border-color:#4a4}
    .cre-btn.apply{background:#d7e7f7;border-color:#558bbd;font-weight:bold}
    .cre-section{border-top:1px solid #ccc;margin-top:6px;padding-top:6px}
    .cre-section-title{color:#000;font-weight:bold;margin-bottom:4px}
    .cre-list{max-height:130px;overflow-y:auto;border:1px solid #777;border-radius:3px;background:#fff}
    .cre-list-item{padding:3px 6px;cursor:pointer;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;gap:6px}
    .cre-list-item:hover{background:#eef6ff}
    .cre-list-item.selected{background:#dcecff}
    .cre-canvas{border:1px solid #777;border-radius:3px;display:block;background:#fff;touch-action:none}
    .cre-tabs{display:flex;gap:2px;margin-bottom:4px}
    .cre-tab{flex:1;text-align:center;padding:3px;cursor:pointer;border:1px solid #666;border-radius:3px 3px 0 0;background:#efefef;color:#000}
    .cre-tab.active{background:#dcecff;border-color:#558bbd}
    .cre-hint{color:#444;font-size:10px;margin-top:3px}
    .cre-badge{display:inline-block;padding:1px 4px;border-radius:8px;font-size:9px;margin-left:4px;color:#fff}
    .cre-badge.stick{background:#3344aa}.cre-badge.bind{background:#aa4444}.cre-badge.repel{background:#8844aa}
    .cre-badge.remount{background:#aa8844}.cre-badge.joint{background:#338877}.cre-badge.chain{background:#666}
    .cre-coords{color:#444;font-size:10px}
    .cre-ptype{font-size:9px}
    .cre-sprite-missing{color:#a33}.cre-sprite-ok{color:#275}.cre-file-hidden{display:none}
  `;

  function allPointNames(tpl) {
    return [...new Set((tpl.points||[]).map(p=>p.name))];
  }

  class CRE extends React.Component {
    constructor(props) {
      super(props);
      this.mainRef    = React.createRef();
      this.popoutRef  = React.createRef();
      this._mounted   = false;
      this._rqPending = false;
      this._ptrStart  = null;
      this._ptrMoved  = false;
      this._drag      = null;   // {mode:'point'|'bone', ...}
      this._ia        = {       // interaction state (not in React state for perf)
        hoveredPoint:null, hoveredBone:null, draggingPoint:null,
        boneStartPoint:null, ghostLine:null,
      };
      this.state = {
        active:false, tab:'points', riderIdx:0, numRiders:1,
        currentMousePos: {x: 0, y: 0}, selectedPoint:null, editingPoint:null, selectedBone:null,
        addBoneMode:false, popout:false,
        exportText:'',
        newBone:{p1:'',p2:'',type:'Stick',endurance:0.057,remountEndurance:0.114,remountStrength:0.1,lengthFactor:0.5,q1:'',q2:'',key:'riderMounted'},
        selectedSprite:null, spriteExportText:'', spriteReady:false, spriteAnimParam:'broken', spriteAnimT:0,
      };
      const sub = store.subscribeImmediate || store.subscribe;
      sub.call(store, ()=>{ if(this._mounted) this.syncRiders(); });
      this.onWinMove = this.onWinMove.bind(this);
      this.onWinUp   = this.onWinUp.bind(this);
    }

    componentDidMount() {
      this._mounted=true; crePatchDispatchForMissingPointSafety(); this.syncRiders(); this.refreshSprites(); this.paint();
      window.addEventListener('mousemove', this.onWinMove);
      window.addEventListener('mouseup',   this.onWinUp);
    }
    componentDidUpdate() { this.paint(); }
    componentWillUnmount() {
      this._mounted=false;
      window.removeEventListener('mousemove', this.onWinMove);
      window.removeEventListener('mouseup',   this.onWinUp);
    }

    scheduleRender() {
      if (this._rqPending) return; this._rqPending=true;
      requestAnimationFrame(()=>{ this._rqPending=false; if(this._mounted){this.forceUpdate();this.paint();} });
    }

    async refreshSprites() {
      try {
        const sheets=await creBuildAllSpriteSheets();
        creDispatchSpriteSheets(sheets);
        if(this._mounted) this.setState({spriteReady:true},()=>this.paint());
      } catch(err) { console.error('[CRE] refreshSprites',err); }
    }

    selectedSpriteObj() {
      const arr=creGetSpriteConfig(this.state.riderIdx).mappings||[];
      return this.state.selectedSprite==null?null:arr[this.state.selectedSprite]||null;
    }

    selectSprite(i) { this.setState({selectedSprite:i},()=>this.paint()); }

    addSpritePart() {
      const cfg=creGetSpriteConfig(this.state.riderIdx);
      const pts=allPointNames(this.tpl());
      const anchor=pts.includes('BUTT')?'BUTT':(pts[0]||'');
      const lookAt=pts.includes('SHOULDER')?'SHOULDER':'';
      const idx=cfg.mappings.length;
      const m={
        id:idx,
        anchor:anchor||null,
        lookAt:lookAt||null,
        cam:null,
        stretch:false,
        coords:{anchor:{x:0,y:0},bbox:{x:0,y:0,width:1,height:1}},
        _baseCoords:{anchor:{x:0,y:0},bbox:{x:0,y:0,width:1,height:1}},
        transforms:[],opacity:null,copy:null,
        offsetX:0,offsetY:0,enabled:true,
        customSvg:null,customViewBox:null,customSize:null,customSlot:null,
        customAnchorX:0,customAnchorY:0,customScale:1,
        defaultLabel:`Sprite ${idx+1}`,
        label:`Sprite ${idx+1}`
      };
      cfg.mappings.push(m); cfg.version++;
      this.setState({selectedSprite:idx},()=>{this.scheduleRender();this.refreshSprites();});
    }

    setSpriteAnimParam(param) { this.setState({spriteAnimParam:param},()=>this.paint()); }
    setSpriteAnimT(value) { this.setState({spriteAnimT:Math.max(0,Math.min(1,Number(value)||0))},()=>this.paint()); }


    updateSpriteField(field,value) {
      const m=this.selectedSpriteObj(); if(!m) return;
      if(field==='anchor'||field==='lookAt') m[field]=value||null;
      else if(field==='label') m.label=value;
      else if(field==='enabled') m.enabled=!!value;
      else if(field==='stretch') m.stretch=!!value;
      else if(field==='offsetX'||field==='offsetY'||field==='customScale'||field==='customAnchorX'||field==='customAnchorY') m[field]=creNum(value,0);
      creGetSpriteConfig(this.state.riderIdx).version++;
      this.setState({},()=>{ this.scheduleRender(); this.refreshSprites(); });
    }

    async replaceSpriteFromFile(ev) {
      const input=ev.currentTarget || ev.target;
      const file=input?.files?.[0]; if(!file) return;
      try {
        const m=this.selectedSpriteObj(); if(!m) throw new Error('Select a sprite part first.');
        const text=await file.text();
        const parsed=creNamespaceImportedSvg(text,`cre_${Date.now().toString(36)}_`);
        m.customSvg=parsed; m.customSlot=null; m.customSize={width:parsed.width,height:parsed.height}; m.customAnchorX=0; m.customAnchorY=0; m.customScale=1;
        creGetSpriteConfig(this.state.riderIdx).version++;
        this.setState({},()=>{ this.scheduleRender(); this.refreshSprites(); });
      } catch(err) { console.error(err); alert('[CRE] SVG import failed: '+err.message); }
      try { input.value=''; } catch(_) {}
    }

    clearSpriteReplacement() {
      const m=this.selectedSpriteObj(); if(!m) return;
      m.customSvg=null; m.customSlot=null; m.customSize=null; m.customAnchorX=0; m.customAnchorY=0; m.customScale=1;
      creGetSpriteConfig(this.state.riderIdx).version++;
      this.setState({},()=>{this.scheduleRender();this.refreshSprites();});
    }

    exportSprites() { this.setState({spriteExportText:creSpriteExportJson()}); }

    importSprites() {
      try { creSpriteImportJson(this.state.spriteExportText); this.setState({selectedSprite:null},()=>{this.scheduleRender();this.refreshSprites();}); }
      catch(err) { alert('[CRE] Invalid sprite JSON: '+err.message); }
    }

    resetSprites() {
      if(!confirm('Reset sprite mappings for this rider to the default bosh sprite?')) return;
      creResetSpriteConfig(this.state.riderIdx); this.setState({selectedSprite:null},()=>{this.scheduleRender();this.refreshSprites();});
    }

    renderSpriteTab() {
      const cfg=creGetSpriteConfig(this.state.riderIdx), maps=cfg.mappings||[], sel=this.state.selectedSprite, m=sel==null?null:maps[sel], pts=allPointNames(this.tpl());
      return e('div',null,
        e('div',{className:'cre-section-title'},'Sprite Parts'),
        e('div',{className:'cre-list',style:{maxHeight:150}},
          maps.map((x,i)=>{
            const available=pts.includes(x.anchor)&&(!x.lookAt||pts.includes(x.lookAt));
            const nm=x.label||`${x.anchor||'?'}${x.lookAt?' → '+x.lookAt:''}`;
            return e('div',{key:i,className:'cre-list-item'+(sel===i?' selected':''),onClick:()=>this.selectSprite(i)},
              e('span',null,`${i+1}. ${nm}`),
              e('span',{className:'cre-coords',style:{color:available?'#275':'#a33'}},available?'OK':'MISSING')
            );
          })
        ),
        e('div',{className:'cre-row',style:{marginTop:4}},
          e('button',{className:'cre-btn success',onClick:()=>this.addSpritePart()},'+ Add Sprite Part')
        ),
        m && e('div',{className:'cre-section'},
          e('div',{className:'cre-section-title'},`Editing: ${m.label||('Sprite '+(sel+1))}`),
          e('div',{className:'cre-row'},e('span',{className:'cre-label'},'Label:'),e('input',{className:'cre-input',value:m.label||'',onChange:ev=>this.updateSpriteField('label',ev.target.value)})),
          e('div',{className:'cre-row'},e('span',{className:'cre-label'},'Anchor:'),e('select',{className:'cre-select',value:m.anchor||'',onChange:ev=>this.updateSpriteField('anchor',ev.target.value)},e('option',{value:''},'-- none --'),pts.map(n=>e('option',{key:n,value:n},n)))),
          e('div',{className:'cre-row'},e('span',{className:'cre-label'},'Look At:'),e('select',{className:'cre-select',value:m.lookAt||'',onChange:ev=>this.updateSpriteField('lookAt',ev.target.value)},e('option',{value:''},'-- none --'),pts.map(n=>e('option',{key:n,value:n},n)))),
          e('div',{className:'cre-row'},e('span',{className:'cre-label'},'Offset X:'),e('input',{className:'cre-input',type:'number',step:'0.25',value:m.offsetX??0,onChange:ev=>this.updateSpriteField('offsetX',ev.target.value)}),e('span',{className:'cre-label'},'Y:'),e('input',{className:'cre-input',type:'number',step:'0.25',value:m.offsetY??0,onChange:ev=>this.updateSpriteField('offsetY',ev.target.value)})),
          e('div',{className:'cre-row'},e('label',null,e('input',{type:'checkbox',checked:m.stretch===true,onChange:ev=>this.updateSpriteField('stretch',ev.target.checked)}),' Stretch')),
          e('div',{className:'cre-row'},e('label',null,e('input',{type:'checkbox',checked:m.enabled!==false,onChange:ev=>this.updateSpriteField('enabled',ev.target.checked)}),' Enabled')),
          m.customSvg && e('div',{className:'cre-row'},e('span',{className:'cre-coords'},`Custom SVG ${Math.round(m.customSvg.width)}×${Math.round(m.customSvg.height)}`),e('button',{className:'cre-btn danger',onClick:()=>this.clearSpriteReplacement()},'Remove Custom SVG')),
          m.customSvg && e('div',{className:'cre-row'},e('span',{className:'cre-label'},'Scale:'),e('input',{className:'cre-input',type:'number',step:'0.05',min:'0.05',value:m.customScale??1,onChange:ev=>this.updateSpriteField('customScale',ev.target.value)}),e('span',{className:'cre-label'},'SVG Anchor X/Y:'),e('input',{className:'cre-input',type:'number',step:'0.25',value:m.customAnchorX??0,onChange:ev=>this.updateSpriteField('customAnchorX',ev.target.value)}),e('input',{className:'cre-input',type:'number',step:'0.25',value:m.customAnchorY??0,onChange:ev=>this.updateSpriteField('customAnchorY',ev.target.value)})),
          e('div',{className:'cre-row'},e('input',{type:'file',accept:'.svg,image/svg+xml',ref:r=>{this._spriteFile=r;},style:{display:'none'},onChange:ev=>this.replaceSpriteFromFile(ev)}),e('button',{className:'cre-btn apply',onClick:()=>this._spriteFile?.click()},'Replace with SVG'))
        ),
          e('canvas',{ref:r=>{this._spritePreview=r;},width:360,height:245,className:'cre-canvas',style:{marginTop:0,width:'360px',height:'245px',background:'#fff'}}),
          e('div',{className:'cre-row',style:{marginTop:4}},
            e('span',{className:'cre-label'},'Animation:'),
            e('select',{className:'cre-select',value:this.state.spriteAnimParam,onChange:ev=>this.setSpriteAnimParam(ev.target.value)},
              e('option',{value:'rotation'},'Rotation'),e('option',{value:'blinking'},'Blinking'),e('option',{value:'broken'},'Broken'),e('option',{value:'crashed'},'Crashed')),
            e('input',{type:'range',min:0,max:1,step:0.001,value:this.state.spriteAnimT,onChange:ev=>this.setSpriteAnimT(ev.target.value),style:{flex:1,minWidth:120}}),
            e('span',{className:'cre-coords',style:{width:42,textAlign:'right'}},`${Math.round(this.state.spriteAnimT*100)}%`)
          ),
        e('div',{className:'cre-section'},
          e('div',{className:'cre-section-title'},'Sprite JSON'),
          e('textarea',{className:'cre-textarea',style:{width:'100%',height:95,fontFamily:'monospace',fontSize:9,boxSizing:'border-box',padding:4,resize:'vertical'},value:this.state.spriteExportText,onChange:ev=>this.setState({spriteExportText:ev.target.value})}),
          e('div',{className:'cre-row',style:{marginTop:4}},
            e('button',{className:'cre-btn',onClick:()=>this.exportSprites()},'Export Sprite JSON'),
            e('button',{className:'cre-btn success',onClick:()=>this.importSprites()},'Import Sprite JSON'),
            e('button',{className:'cre-btn danger',onClick:()=>this.resetSprites()},'Reset Sprites')
          )
        ),
      );
    }

    syncRiders() {
      try {
        const st=store.getState(); if(st.progress?.LOAD_TRACK?.status) return;
        const riders=window.Selectors.getRiders(st), n=riders?riders.length:1;
        const ri=Math.min(this.state.riderIdx,n-1);
        if(n!==this.state.numRiders||ri!==this.state.riderIdx) this.setState({numRiders:n,riderIdx:ri},()=>{this.refreshSprites();this.paint();});
      } catch(_){}
    }

    tpl() { return getTemplate(this.state.riderIdx); }
    // ── Keyboard shortcuts ────────────────────────────────────────────────────

    onKeyDown(ev) {
      const tag=(ev.target.tagName||'').toLowerCase();
      if (tag==='input'||tag==='textarea'||tag==='select') return;

      const {tab,selectedPoint,selectedBone,currentMousePos} = this.state;

      const isDel = ev.key==='Backspace'||ev.key==='Delete';
      const isDup = (ev.ctrlKey||ev.metaKey) && ev.key.toLowerCase()==='d';
      const isColl = ev.key.toLowerCase()==='c';
      const isFlt = ev.key.toLowerCase()==='f';

      if (isDel) {
        if (tab==='points'&&selectedPoint) {
          ev.preventDefault();
          this.deletePoint(selectedPoint);
        } else if (tab==='bones'&&selectedBone) {
          ev.preventDefault();
          this.deleteBone(selectedBone);
        }
      } else if (isDup) {
        ev.preventDefault();
        if (tab==='points'&&selectedPoint) this.dupPoint(selectedPoint);
        else if (tab==='bones'&&selectedBone) this.dupBone(selectedBone);
      } else if (isColl || isFlt) {
        if (tab==='points' && currentMousePos) {
          const canvas = this.mainRef.current;
          if (canvas) {
            // Convert screen mouse pos to model space
            const m = getMetrics(canvas, this.tpl(), 1);
            const modelPos = m.toModel(currentMousePos.x, currentMousePos.y);

            if (isColl) {
              this.addPoint('CollisionPoint', modelPos);
            } else if (isFlt) {
              this.addPoint('FlutterPoint', modelPos);
            }
          }
        }
      }
    }

    // ── Canvas ────────────────────────────────────────────────────────────────

    paint() {
      if (!this._mounted||!this.state.active) return;
      const tpl=this.tpl();
      const ia={...this._ia,selectedPoint:this.state.selectedPoint,selectedBone:this.state.selectedBone};
      drawPreview(this.mainRef.current, tpl, 1, ia);
      if (this.state.popout)
        drawPreview(this.popoutRef.current, tpl, 1.15, ia);
      if (this.state.tab==='sprites' && this._spritePreview) {
        const img=window.__customRiderSpritePreviewImages[this.state.riderIdx]||null;
        creDrawSpritePreview(this._spritePreview,this.state.riderIdx,img,this.state.spriteAnimParam,this.state.spriteAnimT);
      }
    }

    canvasPos(ev, canvas) {
      const c=canvas||this.mainRef.current; if(!c) return null;
      const r=c.getBoundingClientRect(); if(!r.width||!r.height) return null;
      return {x:(ev.clientX-r.left)*(c.width/r.width), y:(ev.clientY-r.top)*(c.height/r.height)};
    }


    nearestPoint(canvas, x, y) {
      const tpl=this.tpl(), m=getMetrics(canvas,tpl,1);
      let best=null, bd=Infinity;
      for (const p of tpl.points||[]) { const sp=m.toScreen(p.pos), d=Math.hypot(x-sp.x,y-sp.y); const r=p.type==='CollisionPoint'?9:7; if(d<r&&d<bd){best=p;bd=d;} }
      return best;
    }

    nearestBone(canvas, x, y) {
      const tpl=this.tpl(), m=getMetrics(canvas,tpl,1), pm=getPointMap(tpl);
      let best=null, bd=Infinity;
      for (const c of tpl.constraints||[]) { for (const [a,b] of getConstraintSegments(c,pm)) { const pa=m.toScreen(a.pos),pb=m.toScreen(b.pos), d=distToSeg(x,y,pa.x,pa.y,pb.x,pb.y); if(d<7&&d<bd){best=c;bd=d;} } }
      return best;
    }

    onMouseDown(ev) {
      if (!this.state.active) return;
      const canvas=this.mainRef.current; if(!canvas) return;
      const pos=this.canvasPos(ev,canvas); if(!pos) return;
      const {x,y}=pos; this._ptrStart={x,y}; this._ptrMoved=false;

      const pt=this.nearestPoint(canvas,x,y), bone=this.state.tab==='bones'?this.nearestBone(canvas,x,y):null;
      if (this.state.tab==='points'&&pt) {
        this._drag={mode:'point',name:pt.name};
        this.selPoint(pt.name);
        ev.preventDefault(); return;
      }
      if (this.state.tab==='bones'&&pt) {
        this._drag={mode:'bone',startPoint:pt.name};
        this._ia={...this._ia,boneStartPoint:pt.name,ghostLine:{from:pt,to:{x,y}}};
        this.setState({addBoneMode:false,selectedBone:null,selectedPoint:null,editingPoint:null,tab:'bones'},()=>this.paint());
        ev.preventDefault(); return;
      }
      if (this.state.tab==='bones'&&bone) { this.selBone(bone.name); ev.preventDefault(); }
    }

    onMouseMove(ev) {
      if (!this.state.active) return;
      const canvas=this.mainRef.current; if(!canvas) return;
      const pos=this.canvasPos(ev,canvas); if(!pos) return;
      this.setState({ currentMousePos: pos });
      const {x,y}=pos;
      if (this._ptrStart&&Math.hypot(x-this._ptrStart.x,y-this._ptrStart.y)>3) this._ptrMoved=true;

      const pt=this.nearestPoint(canvas,x,y), bone=this.state.tab==='bones'?this.nearestBone(canvas,x,y):null;
      if (this._drag&&this._drag.mode==='point') {
        const m=getMetrics(canvas,this.tpl(),1), model=m.toModel(x,y);
        this.movePoint(this._drag.name,model.x,model.y);
        this._ia={...this._ia,hoveredPoint:this._drag.name,hoveredBone:null}; this.paint(); return;
      }
      if (this._drag&&this._drag.mode==='bone') {
        const m=getMetrics(canvas,this.tpl(),1), model=m.toModel(x,y), from=this.getPoint(this._drag.startPoint);
        if (from) this._ia={...this._ia,boneStartPoint:this._drag.startPoint,ghostLine:{from,to:{x:model.x,y:model.y}},hoveredPoint:pt?pt.name:this._ia.hoveredPoint,hoveredBone:bone?bone.name:null};
        this.paint(); return;
      }
      this._ia={...this._ia,hoveredPoint:pt?pt.name:null,hoveredBone:bone?bone.name:null}; this.paint();
    }

    onMouseUp(ev) {
      if (!this._drag) return;
      const canvas=this.mainRef.current; if(!canvas) return;
      const pos=this.canvasPos(ev,canvas); if(!pos) return;
      const {x,y}=pos, pt=this.nearestPoint(canvas,x,y), bone=this.state.tab==='bones'?this.nearestBone(canvas,x,y):null;
      if (this._drag.mode==='point') {
        this._drag=null; this._ia={...this._ia,draggingPoint:null,ghostLine:null};
        this.paint();
      } else if (this._drag.mode==='bone') {
        const sn=this._drag.startPoint;
        if (pt&&pt.name!==sn) this.addBone(sn,pt.name);
        else if (!this._ptrMoved&&bone) this.selBone(bone.name);
        this._drag=null; this._ia={...this._ia,boneStartPoint:null,ghostLine:null}; this.paint();
      }
      this._ptrStart=null; this._ptrMoved=false;
    }

    onWinMove(ev) { if(!this._drag) return; this.onMouseMove(ev); }
    onWinUp(ev)   { if(!this._drag) return; this.onMouseUp(ev); }

    onMouseLeave() {
      if (this._drag) return;
      this._ia={...this._ia,hoveredPoint:null,hoveredBone:null}; this.paint();
    }

    // ── Points ────────────────────────────────────────────────────────────────

    getPoint(name) { return this.tpl().points.find(p=>p.name===name)||null; }
    getBone(name)  { return this.tpl().constraints.find(c=>c.name===name)||null; }

    selPoint(name) {
      const pt=this.getPoint(name);
      this._ia={...this._ia,hoveredBone:null,hoveredPoint:name};
      this.setState({selectedPoint:name,selectedBone:null,addBoneMode:false,tab:'points',
        editingPoint:pt?{name:pt.name,x:pt.pos.x,y:pt.pos.y,friction:pt.friction??'',airFriction:pt.airFriction??''}:null},
        ()=>this.paint());
    }

    selBone(name) {
      this._ia={...this._ia,hoveredPoint:null};
      this.setState({selectedBone:name,selectedPoint:null,editingPoint:null,addBoneMode:false,tab:'bones'},()=>this.paint());
    }

    movePoint(name, x, y) {
      const pt=this.getPoint(name); if(!pt) return; pt.pos.x=x; pt.pos.y=y;
      if (this.state.selectedPoint===name&&this.state.editingPoint)
        this.setState({editingPoint:{...this.state.editingPoint,x,y}},()=>this.paint());
      else this.scheduleRender();
    }

    addPoint(type, pos = {x: 0, y: 0}) {
      const tpl=this.tpl(), ex=new Set((tpl.points||[]).map(p=>p.name));
      const name=makeUnique(type==='CollisionPoint'?'New Point':'New FP', ex, type==='CollisionPoint'?'CP':'FP');
      const np={name,type,pos}; if(type==='CollisionPoint')np.friction=0.5; if(type==='FlutterPoint')np.airFriction=0.2;
      tpl.points.push(np);
      this.setState({selectedPoint:name,selectedBone:null,addBoneMode:false,tab:'points',editingPoint:{name,x:pos.x,y:pos.y,friction:0.5,airFriction:0.2}},()=>this.scheduleRender());
    }

    deletePoint(name) {
      const tpl=this.tpl();
      tpl.points=tpl.points.filter(p=>p.name!==name);
      tpl.constraints=tpl.constraints.filter(c=>!pointRefsConstraint(c,name));
      this._ia={...this._ia,hoveredPoint:null,hoveredBone:null};
      this.setState({selectedPoint:null,editingPoint:null},()=>{this.scheduleRender();this.refreshSprites();});
    }

    dupPoint(name) {
      const tpl=this.tpl(), src=tpl.points.find(p=>p.name===name); if(!src) return;
      const ex=new Set(tpl.points.map(p=>p.name));
      const nn=makeUnique(name+'_copy',ex,name+'_copy');
      const copy={...deepClone(src),name:nn,pos:{x:src.pos.x+1,y:src.pos.y+1}};
      tpl.points.push(copy);
      this.setState({selectedPoint:nn,editingPoint:{name:nn,x:copy.pos.x,y:copy.pos.y,friction:copy.friction??'',airFriction:copy.airFriction??''}},()=>this.scheduleRender());
    }

    renameSelPoint() {
      if(!this.state.selectedPoint||!this.state.editingPoint) return;
      const next=renamePointInTpl(this.tpl(),this.state.selectedPoint,this.state.editingPoint.name);
      if(next!==this.state.selectedPoint) this.setState({selectedPoint:next,editingPoint:{...this.state.editingPoint,name:next}},()=>this.scheduleRender());
    }

    updatePtField(field, value) {
      const sel=this.state.selectedPoint; if(!sel) return;
      const tpl=this.tpl(), pt=tpl.points.find(p=>p.name===sel); if(!pt) return;
      if(field==='name'){this.setState({editingPoint:{...this.state.editingPoint,name:value}});return;}
      if(field==='x'||field==='y') pt.pos[field]=parseFloat(value)||0;
      if(field==='friction'){const f=parseFloat(value);if(!isNaN(f))pt.friction=f;else delete pt.friction;}
      if(field==='airFriction'){const af=parseFloat(value);if(!isNaN(af))pt.airFriction=af;}
      this.setState({editingPoint:{...(this.state.editingPoint||{}),[field]:value}},()=>this.scheduleRender());
    }

    // ── Bones ─────────────────────────────────────────────────────────────────

    addBone(p1, p2) {
      if(!p1||!p2||p1===p2) return;
      const tpl=this.tpl(), bone=buildBoneFromDraft(this.state.newBone,p1,p2,tpl);
      tpl.constraints.push(bone);
      this.setState({selectedBone:bone.name,selectedPoint:null,editingPoint:null,addBoneMode:false,tab:'bones'},()=>this.scheduleRender());
    }

    deleteBone(name) {
      this.tpl().constraints=this.tpl().constraints.filter(c=>c.name!==name);
      this._ia={...this._ia,hoveredBone:null};
      this.setState({selectedBone:null},()=>this.scheduleRender());
    }

    dupBone(name) {
      const tpl=this.tpl(), src=tpl.constraints.find(c=>c.name===name); if(!src) return;
      const ex=new Set(tpl.constraints.map(c=>c.name));
      tpl.constraints.push({...deepClone(src),name:makeUnique(name+'_copy',ex,name+'_copy')});
      this.scheduleRender();
    }

    updateBoneField(field, value) {
      const sel=this.state.selectedBone; if(!sel) return;
      const bone=this.tpl().constraints.find(c=>c.name===sel); if(!bone) return;
      if(field==='name'){const next=renameBoneInTpl(this.tpl(),sel,value);this.setState({selectedBone:next},()=>this.scheduleRender());return;}
      bone[field]=value; this.scheduleRender();
    }

    importTpl(json) {
      try {
        window.__customRiderTemplates[this.state.riderIdx]=sanitizeTpl(json);
        this._ia={hoveredPoint:null,hoveredBone:null,draggingPoint:null,boneStartPoint:null,ghostLine:null};
        this.setState({selectedPoint:null,editingPoint:null,selectedBone:null},()=>this.scheduleRender());
      } catch(err){ alert('Invalid JSON: '+err.message); }
    }

    resetTpl() {
      window.__customRiderTemplates[this.state.riderIdx]=deepClone(DEFAULT_RIDER_TEMPLATE);
      creResetSpriteConfig(this.state.riderIdx);
      this._ia={hoveredPoint:null,hoveredBone:null,draggingPoint:null,boneStartPoint:null,ghostLine:null};
      this.setState({selectedPoint:null,editingPoint:null,selectedBone:null,selectedSprite:null},()=>{this.scheduleRender();this.refreshSprites();});
    }


    // ── Render helpers ────────────────────────────────────────────────────────

    renderBoneFields(obj, onChange) {
      return (CONSTRAINT_TYPES[obj.type]?.fields||[]).map(f =>
        e('div',{key:f.key,className:'cre-row'},
          e('span',{className:'cre-label'},f.label+':'),
          f.key==='ps' ? (obj[f.key]||[]).concat('').map((val,idx,arr)=>{
            if(idx>0&&!arr[idx-1]) return null;
            const pts=(this.tpl().points||[]).map(p=>p.name);
            return e('select',{key:idx,className:'cre-select',style:{marginBottom:'4px'},value:val,onChange:ev=>{
              const np=[...(obj[f.key]||[])]; const nv=ev.target.value; if(nv==='')np.splice(idx);else np[idx]=nv; onChange(f.key,np);
            }}, e('option',{value:''},'-- none --'), pts.map(n=>e('option',{key:n,value:n},n)));
          }) :
          (f.key==='q1'||f.key==='q2') ? e('select',{className:'cre-select',value:obj[f.key]||'',onChange:ev=>onChange(f.key,ev.target.value)},
            e('option',{value:''},'-- none --'), (this.tpl().points||[]).map(p=>e('option',{key:p.name,value:p.name},p.name))) :
          f.key==='key' ? e('select',{className:'cre-select',value:obj[f.key]||'',onChange:ev=>onChange(f.key,ev.target.value)},
            e('option',{value:''},'-- none --'), e('option',{value:'sledIntact'},'sledIntact'), e('option',{value:'riderMounted'},'riderMounted')) :
          e('input',{className:'cre-input',type:'text',value:obj[f.key]!==undefined?obj[f.key]:f.default,
            onChange:ev=>onChange(f.key,typeof f.default==='number'?(parseFloat(ev.target.value)||f.default):ev.target.value)})
        )
      );
    }

    // ── Render: points tab ────────────────────────────────────────────────────

    renderPointsTab() {
      const tpl=this.tpl(), sel=this.state.selectedPoint, ep=this.state.editingPoint, pt=tpl.points.find(p=>p.name===sel)||null;
      return e('div',null,
        e('div',{className:'cre-section-title'},'Contact Points'),
        e('div',{className:'cre-list'},
          tpl.points.map(p=>e('div',{key:p.name,className:'cre-list-item'+(sel===p.name?' selected':''),onClick:()=>this.selPoint(p.name)},
            e('span',null,p.name), e('span',{className:'cre-coords'},`(${p.pos.x.toFixed(1)}, ${p.pos.y.toFixed(1)})`),
            e('span',{className:'cre-ptype',style:{color:p.type==='CollisionPoint'?'#335':'#353'}},p.type==='CollisionPoint'?'COLL':'FLT'),
          ))
        ),
        e('div',{className:'cre-row',style:{marginTop:4}},
          e('button',{className:'cre-btn success',onClick:()=>this.addPoint('CollisionPoint')},'+ Collision'),
          e('button',{className:'cre-btn success',onClick:()=>this.addPoint('FlutterPoint')},'+ Flutter'),
          sel && e('button',{className:'cre-btn',title:'Duplicate (Ctrl+D)',onClick:()=>this.dupPoint(sel)},'⧉ Dup'),
          sel && e('button',{className:'cre-btn danger',onClick:()=>this.deletePoint(sel)},'✕ Delete'),
        ),
        sel && ep && pt && e('div',{className:'cre-section'},
          e('div',{className:'cre-section-title'},`Editing: ${sel}`),
          e('div',{className:'cre-row'},e('span',{className:'cre-label'},'Name:'),
            e('input',{className:'cre-input',type:'text',value:ep.name??'',onChange:ev=>this.updatePtField('name',ev.target.value),onBlur:()=>this.renameSelPoint()})),
          e('div',{className:'cre-row'},
            e('span',{className:'cre-label'},'X:'),e('input',{className:'cre-input',type:'number',step:'0.5',value:ep.x,onChange:ev=>this.updatePtField('x',ev.target.value)}),
            e('span',{className:'cre-label'},'Y:'),e('input',{className:'cre-input',type:'number',step:'0.5',value:ep.y,onChange:ev=>this.updatePtField('y',ev.target.value)}),
          ),
          pt.type==='CollisionPoint' && e('div',{className:'cre-row'},
            e('span',{className:'cre-label'},'Friction:'),
            e('input',{className:'cre-input',type:'number',step:'0.05',min:'0',max:'1',placeholder:'none',value:ep.friction,onChange:ev=>this.updatePtField('friction',ev.target.value)}),
            e('span',{className:'cre-hint'},'0=slippery 1=sticky'),
          ),
          pt.type==='FlutterPoint' && e('div',{className:'cre-row'},
            e('span',{className:'cre-label'},'Air Friction:'),
            e('input',{className:'cre-input',type:'number',step:'0.05',min:'0',value:ep.airFriction,onChange:ev=>this.updatePtField('airFriction',ev.target.value)}),
          ),
        ),
        !sel && e('div',{className:'cre-hint',style:{marginTop:6}},'Click a point to edit. Drag on preview to move. Backspace = delete, Ctrl+D = duplicate, C = new Collision, F = new Flutter'),
      );
    }

    // ── Render: bones tab ─────────────────────────────────────────────────────

    renderBonesTab() {
      const tpl=this.tpl(), selN=this.state.selectedBone, boneObj=tpl.constraints.find(c=>c.name===selN)||null;
      const ptNames=(tpl.points||[]).map(p=>p.name), bones=tpl.constraints||[];
      return e('div',null,
        e('div',{className:'cre-section-title'},'Bones (Constraints)'),
        e('div',{className:'cre-list'},
          bones.length===0 ? e('div',{style:{padding:'4px 8px',color:'#555'}},'No bones yet')
          : bones.map(c=>e('div',{key:c.name,className:'cre-list-item'+(selN===c.name?' selected':''),onClick:()=>this.selBone(c.name)},
            e('span',null,getConstraintText(c)), e('span',{className:`cre-badge ${BADGE[c.type]||'stick'}`},c.type),
          ))
        ),
        e('div',{className:'cre-row',style:{marginTop:4}},
          e('button',{className:'cre-btn'+(this.state.addBoneMode?' active':' success'),onClick:()=>this.setState(({addBoneMode:m})=>({addBoneMode:!m,selectedBone:null}),()=>this.paint())},this.state.addBoneMode?'Cancel':'+ Add Bone'),
          selN && e('button',{className:'cre-btn',title:'Duplicate (Ctrl+D)',onClick:()=>this.dupBone(selN)},'⧉ Dup'),
          selN && e('button',{className:'cre-btn danger',onClick:()=>this.deleteBone(selN)},'✕ Delete'),
        ),
        this.state.addBoneMode && e('div',{className:'cre-section'},
          e('div',{className:'cre-section-title'},'New Bone'),
          e('div',{className:'cre-row'},e('span',{className:'cre-label'},'Type:'),
            e('select',{className:'cre-select',value:this.state.newBone.type,onChange:ev=>this.setState({newBone:{...this.state.newBone,type:ev.target.value}})},
              Object.keys(CONSTRAINT_TYPES).map(t=>e('option',{key:t,value:t},t)))),
          e('div',{className:'cre-row'},e('span',{className:'cre-label'},'P1:'),
            e('select',{className:'cre-select',value:this.state.newBone.p1,onChange:ev=>this.setState({newBone:{...this.state.newBone,p1:ev.target.value}})},
              e('option',{value:''},'-- select --'), ptNames.map(n=>e('option',{key:n,value:n},n)))),
          e('div',{className:'cre-row'},e('span',{className:'cre-label'},'P2:'),
            e('select',{className:'cre-select',value:this.state.newBone.p2,onChange:ev=>this.setState({newBone:{...this.state.newBone,p2:ev.target.value}})},
              e('option',{value:''},'-- select --'), ptNames.map(n=>e('option',{key:n,value:n},n)))),
          ...this.renderBoneFields(this.state.newBone,(k,v)=>this.setState({newBone:{...this.state.newBone,[k]:v}})),
          e('button',{className:'cre-btn success',style:{marginTop:4},onClick:()=>this.addBone(this.state.newBone.p1,this.state.newBone.p2)},'Add Bone'),
          e('div',{className:'cre-hint'},'You can also drag from one point to another on the preview.'),
        ),
        boneObj && !this.state.addBoneMode && e('div',{className:'cre-section'},
          e('div',{className:'cre-section-title'},`Editing: ${boneObj.name}`),
          e('div',{className:'cre-row'},e('span',{className:'cre-label'},'Name:'),
            e('input',{className:'cre-input',type:'text',value:boneObj.name,onChange:ev=>this.updateBoneField('name',ev.target.value)})),
          e('div',{className:'cre-row'},e('span',{className:'cre-label'},'Type:'),
            e('select',{className:'cre-select',value:boneObj.type,onChange:ev=>this.updateBoneField('type',ev.target.value)},
              Object.keys(CONSTRAINT_TYPES).map(t=>e('option',{key:t,value:t},t)))),
          e('div',{className:'cre-row'},
            e('span',{className:'cre-label'},'P1:'),
            e('select',{className:'cre-select',value:boneObj.p1||'',onChange:ev=>this.updateBoneField('p1',ev.target.value)},ptNames.map(n=>e('option',{key:n,value:n},n))),
            e('span',{className:'cre-label'},'P2:'),
            e('select',{className:'cre-select',value:boneObj.p2||'',onChange:ev=>this.updateBoneField('p2',ev.target.value)},ptNames.map(n=>e('option',{key:n,value:n},n))),
          ),
          ...this.renderBoneFields(boneObj,(k,v)=>this.updateBoneField(k,v)),
        ),
        !boneObj&&!this.state.addBoneMode && e('div',{className:'cre-hint',style:{marginTop:4}},'Click a bone to edit. Drag between points on preview to add. Backspace = delete, Ctrl+D = duplicate.'),
      );
    }

    // ── Render: export tab ────────────────────────────────────────────────────

    renderExportTab() {
      return e('div',null,
        e('div',{className:'cre-section-title'},'Export / Import Rider JSON'),
        e('textarea',{
          className:'cre-textarea',
          style:{width:'100%',height:120,fontFamily:'monospace',fontSize:10,boxSizing:'border-box',padding:4,resize:'vertical'},
          value:this.state.exportText,
          onChange:ev=>this.setState({exportText:ev.target.value}),
          ref:r=>{this._tplTa=r;},
        }),
        e('div',{className:'cre-row',style:{marginTop:4}},
          e('button',{className:'cre-btn',onClick:()=>{
            const t=JSON.stringify(this.tpl(),null,2); this.setState({exportText:t},()=>{
              if(this._tplTa){this._tplTa.focus();this._tplTa.select();try{document.execCommand('copy');}catch(_){}}
            });
          }},'Refresh & Copy'),
          e('button',{className:'cre-btn success',onClick:()=>this.importTpl(this.state.exportText)},'Import JSON'),
        ),

      );
    }

    // ── Render: canvas ────────────────────────────────────────────────────────

    renderCanvas(isPopout) {
      const ref=isPopout?this.popoutRef:this.mainRef, w=isPopout?460:360, h=isPopout?340:220;
      return e('canvas',{
        ref, width:w, height:h, className:'cre-canvas',
        style:{marginTop:isPopout?0:8,width:`${w}px`,height:`${h}px`,
          cursor:this.state.tab==='bones'?'crosshair':'default',pointerEvents:'auto'},
        onMouseDown: ev=>this.onMouseDown(ev),
        onMouseMove: ev=>this.onMouseMove(ev),
        onMouseUp:   ev=>this.onMouseUp(ev),
        onMouseLeave:()=>this.onMouseLeave(),
      });
    }

    // ── Main render ───────────────────────────────────────────────────────────

    render() {
      const {active,tab,riderIdx,numRiders,popout} = this.state;
      return e('div',{className:'cre-root'},
        e('style',null,css),
        e('button',{style:{backgroundColor:active?'lightblue':null},onClick:()=>this.setState(({active:a})=>({active:!a}),()=>this.paint())},'Custom Rider Editor'),

        active && e('div',{
          className:'cre-panel'+(popout?' cre-panel-popout':''),
          tabIndex:0,
          onKeyDown:ev=>this.onKeyDown(ev),
        },
          numRiders>1 && e('div',{className:'cre-row'},
            e('span',{className:'cre-label'},'Rider:'),
            e('select',{className:'cre-select',value:riderIdx,onChange:ev=>{
              const ri=Number(ev.target.value);
              this.setState({riderIdx:ri,selectedPoint:null,selectedBone:null,editingPoint:null,selectedSprite:null,spriteAnimT:0},()=>{
                this._ia={hoveredPoint:null,hoveredBone:null,draggingPoint:null,boneStartPoint:null,ghostLine:null};
                if(tab==='export') this.setState({exportText:JSON.stringify(getTemplate(ri),null,2)});
                this.paint();
              });
            }}, Array.from({length:numRiders},(_,i)=>e('option',{key:i,value:i},`Rider ${i+1}`))),
          ),
          e('div',{className:'cre-tabs'},
            ['points','bones','sprites','export'].map(t=>e('div',{key:t,className:'cre-tab'+(tab===t?' active':''),onClick:()=>this.setState({tab:t},()=>{
              if(t==='export') this.setState({exportText:JSON.stringify(this.tpl(),null,2)});
              this.paint();
            })},t[0].toUpperCase()+t.slice(1)))
          ),
          tab==='points' && this.renderPointsTab(),
          tab==='bones'  && this.renderBonesTab(),
          tab==='sprites' && this.renderSpriteTab(),
          tab==='export' && this.renderExportTab(),
          tab!=='sprites' && this.renderCanvas(false),
          e('div',{className:'cre-row cre-section'},
            e('button',{className:'cre-btn apply',style:{flex:1},onClick:()=>applyToGame()},'▶ Apply Rider'),
            e('button',{className:'cre-btn',onClick:()=>this.setState(({popout:p})=>({popout:!p}),()=>this.paint())},popout?'Close Popout':'Popout'),
            e('button',{className:'cre-btn danger',onClick:()=>{if(confirm('Reset this rider to default?'))this.resetTpl();}},'↺ Reset Rider'),
          ),
        ),
      );
    }
  }

  window.registerCustomSetting(CRE);
}

if (window.registerCustomSetting) {
  main();
  try { crePatchDispatchForMissingPointSafety(); creApplyAllSprites(); } catch(_) {}
} else {
  const prev = window.onCustomToolsApiReady;
  window.onCustomToolsApiReady = () => { if (prev) prev(); main(); try { crePatchDispatchForMissingPointSafety(); creApplyAllSprites(); } catch(_) {} };
}