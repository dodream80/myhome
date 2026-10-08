'use strict';
// HLB라이프케어 소개 모션그래픽 (레드 브랜드 테마).
// 모든 그림은 renderFrame(t)가 시간 t(초)만으로 결정적으로 그린다 → 프레임 단위 캡처 후 MP4로 인코딩.

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const W = 1920, H = 1080;
const FONT = '"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

// 로고(#EF3E36)와 마이피코링 앱(#EF5A4A)에서 가져온 색
const COL = {
  red: '#EF3E36', coral: '#FF6B4F', app: '#EF5A4A', deep: '#C8261F', pink: '#FFE7E3', blush: '#FFF5F3',
  ink: '#1D2129', body: '#3B404C', muted: '#7B808D', faint: '#B4B8C1', line: 'rgba(239,62,54,0.16)',
  white: '#FFFFFF', blue: '#2F86F6', skyBg: '#EAF3FF',
};

// 장면 경계는 96BPM 한 마디(2.5초)에 맞춘다. scripts/music.py와 같은 값을 쓴다.
// red: true인 장면은 빨간 패널이 밀려 들어와 배경이 된다.
const SCENES = [
  { id: 'intro', s: 0, e: 7.5, draw: sceneIntro },
  { id: 'story', s: 7.5, e: 17.5, draw: sceneStory },
  { id: 'vision', s: 17.5, e: 27.5, draw: sceneVision, red: true },
  { id: 'product', s: 27.5, e: 37.5, draw: sceneProduct },
  { id: 'app', s: 37.5, e: 47.5, draw: sceneApp },
  { id: 'projects', s: 47.5, e: 57.5, draw: sceneProjects },
  { id: 'partners', s: 57.5, e: 65, draw: scenePartners },
  { id: 'outro', s: 65, e: 72.5, draw: sceneOutro },
];
const DURATION = 72.5;
// 빨간 띠가 지나가는 전환 (빨간 패널 장면의 앞뒤는 패널 자체가 전환 역할)
const BAND_CUTS = [7.5, 37.5, 47.5, 57.5, 65];

// ───────────────────────── math / easing ─────────────────────────
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const P = (t, s, d) => clamp((t - s) / d);
const E = {
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inCubic: t => t * t * t,
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: t => 1 - Math.pow(1 - t, 4),
  inOutQuart: t => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
const bump = (t, s, d) => Math.sin(P(t, s, d) * Math.PI);  // 0 → 1 → 0
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────── drawing helpers ─────────────────────────
function setFont(size, weight = 700) { ctx.font = `${weight} ${size}px ${FONT}`; }
function lgrad(x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
const redGrad = (x0, x1, y0 = 0, y1 = 0) => lgrad(x0, y0, x1, y1, [[0, COL.red], [1, COL.coral]]);
const redText = (lx, w) => redGrad(lx, lx + w);
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); }
function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function orb(x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
// 그림자 있는 흰 카드
function card(x, y, w, h, r, o = {}) {
  ctx.save();
  ctx.shadowColor = o.shadow || 'rgba(190,60,50,0.13)';
  ctx.shadowBlur = o.blur ?? 44; ctx.shadowOffsetY = o.dy ?? 16;
  rrect(x, y, w, h, r); ctx.fillStyle = o.fill || COL.white; ctx.fill();
  ctx.restore();
  if (o.stroke !== false) {
    ctx.save(); rrect(x, y, w, h, r);
    ctx.strokeStyle = o.stroke || 'rgba(239,62,54,0.10)'; ctx.lineWidth = o.lw || 1.5; ctx.stroke();
    ctx.restore();
  }
}

function measure(str, size, weight = 700, spacing = 0) {
  ctx.save(); setFont(size, weight); ctx.letterSpacing = spacing + 'px';
  const w = ctx.measureText(str).width - spacing;
  ctx.restore();
  return w;
}
function leftOf(x, w, align) { return align === 'center' ? x - w / 2 : align === 'right' ? x - w : x; }

// 텍스트. o.color는 문자열 또는 (left, width) => fillStyle 함수.
function txt(str, x, y, o = {}) {
  const size = o.size || 40, weight = o.weight || 700, sp = o.spacing || 0;
  ctx.save();
  setFont(size, weight); ctx.letterSpacing = sp + 'px';
  ctx.textAlign = 'left'; ctx.textBaseline = o.baseline || 'alphabetic';
  const w = ctx.measureText(str).width - sp;
  const lx = leftOf(x, w, o.align);
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.fillStyle = typeof o.color === 'function' ? o.color(lx, w) : (o.color || COL.ink);
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.glowBlur || 24; }
  ctx.fillText(str, lx, y);
  ctx.restore();
  return w;
}

// 아래에서 위로 마스크 안으로 밀려 올라오는 텍스트. p: 0→1
function maskTxt(str, x, y, p, o = {}) {
  if (p <= 0) return;
  const size = o.size || 40;
  const w = measure(str, size, o.weight || 700, o.spacing || 0);
  const lx = leftOf(x, w, o.align);
  const e = E.outQuart(clamp(p));
  ctx.save();
  ctx.beginPath(); ctx.rect(lx - 60, y - size * 1.08, w + 120, size * 1.46); ctx.clip();
  txt(str, x, y + (1 - e) * size * 1.3, { ...o, alpha: (o.alpha ?? 1) * clamp(p * 2.2) });
  ctx.restore();
}

// 섹션 머리말: 짧은 선 + 영문 라벨 + 큰 제목
function header(lt, label, title, o = {}) {
  const x = o.x ?? 160, y = o.y ?? 200, align = o.align || 'left', size = o.size || 60;
  const accent = o.onRed ? 'rgba(255,255,255,0.9)' : COL.red;
  const lp = E.outCubic(P(lt, 0.05, 0.6));
  const lw = measure(label, 22, 700, 6);
  ctx.save();
  ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.globalAlpha *= lp;
  ctx.beginPath();
  if (align === 'center') {
    const half = lw / 2 + 24;
    ctx.moveTo(x - half, y - 8); ctx.lineTo(x - half - 46 * lp, y - 8);
    ctx.moveTo(x + half, y - 8); ctx.lineTo(x + half + 46 * lp, y - 8);
  } else {
    ctx.moveTo(x, y - 8); ctx.lineTo(x + 46 * lp, y - 8);
  }
  ctx.stroke();
  ctx.restore();
  txt(label, align === 'center' ? x : x + 64, y, { size: 22, weight: 700, spacing: 6, color: accent, align, alpha: P(lt, 0.2, 0.5) });
  maskTxt(title, x, y + size + 30, P(lt, 0.3, 0.9), { size, weight: 700, align, color: o.onRed ? COL.white : COL.ink });
}

// ───────────────────────── logo ─────────────────────────
const LOGO = new Image();
let LOGO_WHITE = null;
function makeWhiteLogo() {
  const c = document.createElement('canvas');
  c.width = LOGO.naturalWidth; c.height = LOGO.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(LOGO, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, c.width, c.height);
  LOGO_WHITE = c;
}
// 왼쪽에서 오른쪽으로 닦아내듯 드러나는 로고. p: 0→1
function drawLogo(cx, cy, w, p, o = {}) {
  const e = E.inOutQuart(clamp(p));
  if (e <= 0) return;
  const h = w * LOGO.naturalHeight / LOGO.naturalWidth;
  const x = cx - w / 2, y = cy - h / 2;
  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.beginPath(); ctx.rect(x - 20, y - 30, (w + 40) * e, h + 60); ctx.clip();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(o.white ? LOGO_WHITE : LOGO, x, y, w, h);
  ctx.restore();
  if (o.edge && e > 0 && e < 1) {
    const ex = x - 20 + (w + 40) * e;
    ctx.save();
    ctx.globalAlpha *= Math.sin(e * Math.PI);
    ctx.fillStyle = lgrad(0, y - 40, 0, y + h + 40, [[0, 'rgba(239,62,54,0)'], [0.5, COL.red], [1, 'rgba(239,62,54,0)']]);
    ctx.fillRect(ex - 2, y - 40, 4, h + 80);
    orb(ex, cy, 90, 'rgba(255,107,79,0.25)');
    ctx.restore();
  }
}

// ───────────────────────── icons (선 아이콘, 단위 크기 s) ─────────────────────────
function icon(name, cx, cy, s, color = COL.red, lt = 0) {
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = 0.07; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (name) {
    case 'shield':
      ctx.moveTo(0, -0.5); ctx.lineTo(0.42, -0.34); ctx.lineTo(0.42, 0.02);
      ctx.quadraticCurveTo(0.42, 0.36, 0, 0.52); ctx.quadraticCurveTo(-0.42, 0.36, -0.42, 0.02);
      ctx.lineTo(-0.42, -0.34); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.17, 0.01); ctx.lineTo(-0.03, 0.15); ctx.lineTo(0.2, -0.12); ctx.stroke();
      break;
    case 'drop':
      ctx.moveTo(0, -0.52);
      ctx.bezierCurveTo(0.12, -0.32, 0.38, -0.06, 0.38, 0.16);
      ctx.arc(0, 0.16, 0.38, 0, Math.PI);
      ctx.bezierCurveTo(-0.38, -0.06, -0.12, -0.32, 0, -0.52);
      ctx.closePath(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.24, 0.2); ctx.lineTo(-0.09, 0.2); ctx.lineTo(-0.02, 0.0); ctx.lineTo(0.06, 0.36);
      ctx.lineTo(0.12, 0.2); ctx.lineTo(0.25, 0.2); ctx.stroke();
      break;
    case 'chart':
      ctx.moveTo(-0.44, -0.44); ctx.lineTo(-0.44, 0.44); ctx.lineTo(0.46, 0.44); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.3, 0.2); ctx.lineTo(-0.08, -0.02); ctx.lineTo(0.08, 0.12); ctx.lineTo(0.38, -0.28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0.2, -0.3); ctx.lineTo(0.4, -0.3); ctx.lineTo(0.4, -0.1); ctx.stroke();
      break;
    case 'ai': {
      const pts = [[0, 0]];
      for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * TAU / 6; pts.push([Math.cos(a) * 0.42, Math.sin(a) * 0.42]); }
      for (let i = 1; i <= 6; i++) {
        ctx.moveTo(0, 0); ctx.lineTo(pts[i][0], pts[i][1]);
        const j = i % 6 + 1; ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]);
      }
      ctx.globalAlpha *= 0.75; ctx.stroke(); ctx.globalAlpha /= 0.75;
      pts.forEach(([x, y], i) => {
        const pulse = 0.065 + 0.025 * Math.max(0, Math.sin(lt * 4 - i));
        circle(x, y, i === 0 ? 0.1 : pulse); ctx.fill();
      });
      break;
    }
    case 'device':
      circle(-0.08, 0, 0.32); ctx.stroke();
      circle(-0.08, 0, 0.11); ctx.fill();
      for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.arc(-0.08, 0, 0.46 + k * 0.14, -0.55, 0.55); ctx.stroke(); }
      break;
    case 'capsule':
      ctx.rotate(-Math.PI / 4);
      rrect(-0.18, -0.48, 0.36, 0.96, 0.18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.18, 0); ctx.lineTo(0.18, 0); ctx.stroke();
      ctx.globalAlpha *= 0.35; rrect(-0.18, 0, 0.36, 0.48, [0, 0, 0.18, 0.18]); ctx.fill();
      break;
    case 'check':
      ctx.moveTo(-0.3, 0.02); ctx.lineTo(-0.08, 0.24); ctx.lineTo(0.32, -0.2); ctx.stroke();
      break;
    case 'bt':
      ctx.moveTo(-0.22, -0.22); ctx.lineTo(0.2, 0.2); ctx.lineTo(0, 0.42); ctx.lineTo(0, -0.42);
      ctx.lineTo(0.2, -0.2); ctx.lineTo(-0.22, 0.22); ctx.stroke();
      break;
    case 'globe':
      circle(0, 0, 0.42); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, 0.18, 0.42, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.42, 0); ctx.lineTo(0.42, 0);
      ctx.moveTo(-0.36, -0.2); ctx.lineTo(0.36, -0.2); ctx.moveTo(-0.36, 0.2); ctx.lineTo(0.36, 0.2); ctx.stroke();
      break;
    case 'spark':
      ctx.moveTo(0, -0.48); ctx.quadraticCurveTo(0.05, -0.05, 0.48, 0); ctx.quadraticCurveTo(0.05, 0.05, 0, 0.48);
      ctx.quadraticCurveTo(-0.05, 0.05, -0.48, 0); ctx.quadraticCurveTo(-0.05, -0.05, 0, -0.48); ctx.fill();
      circle(0.36, -0.36, 0.08); ctx.fill();
      break;
    case 'meal':
      ctx.moveTo(-0.22, -0.42); ctx.lineTo(-0.22, 0.44);
      ctx.moveTo(-0.34, -0.42); ctx.lineTo(-0.34, -0.12); ctx.quadraticCurveTo(-0.34, 0.0, -0.22, 0.0);
      ctx.moveTo(-0.1, -0.42); ctx.lineTo(-0.1, -0.12); ctx.quadraticCurveTo(-0.1, 0.0, -0.22, 0.0);
      ctx.moveTo(0.24, 0.44); ctx.lineTo(0.24, -0.42); ctx.quadraticCurveTo(0.42, -0.2, 0.36, 0.06); ctx.lineTo(0.24, 0.06);
      ctx.stroke();
      break;
    case 'run':
      ctx.moveTo(-0.44, 0); ctx.lineTo(0.44, 0); ctx.stroke();
      rrect(-0.36, -0.22, 0.14, 0.44, 0.04); ctx.fill(); rrect(0.22, -0.22, 0.14, 0.44, 0.04); ctx.fill();
      rrect(-0.48, -0.13, 0.1, 0.26, 0.03); ctx.fill(); rrect(0.38, -0.13, 0.1, 0.26, 0.03); ctx.fill();
      break;
  }
  ctx.restore();
}

// ───────────────────────── backgrounds ─────────────────────────
const rngBG = mulberry32(20240709);
const PARTICLES = Array.from({ length: 80 }, () => ({
  x: rngBG() * W, y: rngBG() * H, r: 0.8 + rngBG() * 2.2, sp: 6 + rngBG() * 18,
  ph: rngBG() * TAU, tw: 0.6 + rngBG() * 1.6, c: rngBG(),
}));
let noisePattern = null;
function makeNoise() {
  const n = document.createElement('canvas'); n.width = n.height = 256;
  const nc = n.getContext('2d'); const img = nc.createImageData(256, 256);
  const r = mulberry32(99);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(r() * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  nc.putImageData(img, 0, 0);
  noisePattern = ctx.createPattern(n, 'repeat');
}
function particles(t, colorOf) {
  for (const p of PARTICLES) {
    const y = ((p.y - t * p.sp) % (H + 40) + H + 40) % (H + 40) - 20;
    const x = p.x + 18 * Math.sin(t * 0.4 + p.ph);
    const a = 0.5 + 0.5 * Math.sin(t * p.tw + p.ph);
    ctx.fillStyle = colorOf(p, a);
    circle(x, y, p.r); ctx.fill();
  }
}
function dotGrid(t, color) {
  const sp = 48, ox = (t * 6) % sp, oy = (t * 3) % sp;
  ctx.fillStyle = color;
  for (let y = -sp + oy; y < H + sp; y += sp)
    for (let x = -sp + ox; x < W + sp; x += sp) ctx.fillRect(x, y, 2, 2);
}
function drawBackground(t) {
  ctx.fillStyle = lgrad(0, 0, W, H, [[0, '#FFFFFF'], [0.55, '#FFF8F6'], [1, '#FFF0ED']]);
  ctx.fillRect(0, 0, W, H);
  orb(W * 0.16 + 140 * Math.sin(t * 0.13), H * 0.22 + 90 * Math.cos(t * 0.11), 760, 'rgba(239,62,54,0.07)');
  orb(W * 0.86 + 150 * Math.cos(t * 0.09), H * 0.76 + 100 * Math.sin(t * 0.12), 880, 'rgba(255,107,79,0.08)');
  orb(W * 0.55 + 220 * Math.sin(t * 0.07 + 1), H * 0.05 + 70 * Math.sin(t * 0.1), 620, 'rgba(255,170,155,0.12)');
  dotGrid(t, 'rgba(239,62,54,0.075)');
  particles(t, (p, a) => (p.c < 0.6 ? `rgba(239,62,54,${0.08 + 0.2 * a})` : `rgba(255,140,120,${0.1 + 0.2 * a})`));
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(150,40,30,0)'); v.addColorStop(1, 'rgba(150,40,30,0.04)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}
function drawRedBackdrop(t) {
  ctx.fillStyle = lgrad(0, 0, W, H, [[0, '#F24A3F'], [0.55, '#E5352D'], [1, '#C42620']]);
  ctx.fillRect(0, 0, W, H);
  orb(W * 0.2 + 120 * Math.sin(t * 0.2), H * 0.2, 800, 'rgba(255,150,120,0.22)');
  orb(W * 0.85, H * 0.85 + 60 * Math.cos(t * 0.15), 760, 'rgba(120,0,0,0.18)');
  dotGrid(t, 'rgba(255,255,255,0.11)');
  particles(t, (p, a) => `rgba(255,255,255,${0.1 + 0.25 * a})`);
}

// 빨간 패널: 사선 평행사변형. L/R은 위·아래 가장자리의 중간 x
const SK = 220;
function panelPath(L, R) {
  ctx.beginPath();
  ctx.moveTo(L + SK, 0); ctx.lineTo(R + SK, 0); ctx.lineTo(R - SK, H); ctx.lineTo(L - SK, H); ctx.closePath();
}
function redPanelEdges(t, sc) {
  const a = E.inOutQuart(P(t, sc.s - 0.55, 0.85));
  const b = E.inOutQuart(P(t, sc.e - 0.45, 0.85));
  if (a <= 0 || b >= 1) return null;
  return { L: lerp(-SK * 2, W + SK * 2, b), R: lerp(-SK * 2, W + SK * 2, a), a, b };
}
function drawPanelAccents(pe) {
  ctx.save();
  if (pe.a < 1) { panelPath(pe.R, pe.R + 70); ctx.fillStyle = COL.coral; ctx.fill(); panelPath(pe.R + 110, pe.R + 126); ctx.fillStyle = 'rgba(255,107,79,0.45)'; ctx.fill(); }
  if (pe.b > 0) { panelPath(pe.L - 70, pe.L); ctx.fillStyle = COL.coral; ctx.fill(); panelPath(pe.L - 126, pe.L - 110); ctx.fillStyle = 'rgba(255,107,79,0.45)'; ctx.fill(); }
  ctx.restore();
}
// 밝은 장면 사이를 지나가는 빨간 띠
function drawWipeBands(t) {
  for (const c of BAND_CUTS) {
    const p = P(t, c - 0.5, 1.0);
    if (p <= 0 || p >= 1) continue;
    const e = E.inOutQuart(p);
    const bw = W * 0.5;
    const cx = lerp(-bw / 2 - SK * 2 - 200, W + bw / 2 + SK * 2 + 40, e);
    ctx.save();
    panelPath(cx - bw / 2 - 150, cx - bw / 2 - 134); ctx.fillStyle = 'rgba(255,107,79,0.45)'; ctx.fill();
    panelPath(cx - bw / 2 - 100, cx - bw / 2 - 30); ctx.fillStyle = COL.coral; ctx.fill();
    panelPath(cx - bw / 2, cx + bw / 2); ctx.fillStyle = lgrad(cx - bw, 0, cx + bw, H, [[0, '#F24A3F'], [1, '#C42620']]); ctx.fill();
    ctx.restore();
  }
}

// ───────────────────────── shared motifs ─────────────────────────
// 화면을 가로지르는 혈당/심박 곡선 → 링으로 모핑
function waveY(u, amp) {
  const g = (c, w) => Math.exp(-Math.pow((u - c) / w, 2));
  return amp * (22 * Math.sin(u * TAU * 2.2 + 0.6) * Math.sin(u * Math.PI)
    - 150 * g(0.5, 0.009) + 58 * g(0.486, 0.007) + 46 * g(0.516, 0.011) - 10 * g(0.47, 0.02));
}
function ringStroke(cx, cy, R) {
  return lgrad(cx - R * 2, cy - R, cx + R * 2, cy + R, [[0, COL.red], [0.5, COL.coral], [1, COL.red]]);
}
function drawRingMotif(cx, cy, R, lt, opts) {
  const N = 260, draw = opts.draw, m = opts.morph;
  if (draw <= 0) return;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    if (u > draw) break;
    const lx = lerp(-80, W + 80, u), ly = (opts.lineY ?? cy) + waveY(u, 1 - m);
    const th = Math.PI / 2 + TAU * u;
    const rx = cx + R * Math.cos(th), ry = cy + R * Math.sin(th);
    const mm = E.inOutCubic(clamp(m * 1.15 - Math.abs(u - 0.5) * 0.3));
    pts.push([lerp(lx, rx, mm), lerp(ly, ry, mm)]);
  }
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = ringStroke(cx, cy, R);
  ctx.lineWidth = opts.width;
  ctx.shadowColor = 'rgba(239,62,54,0.35)'; ctx.shadowBlur = 18;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  if (draw < 1 && pts.length) {
    const [hx, hy] = pts[pts.length - 1];
    orb(hx, hy, 70, 'rgba(255,107,79,0.35)');
    ctx.fillStyle = COL.red; circle(hx, hy, 7); ctx.fill();
  }
  ctx.restore();
}
function drawRingInner(cx, cy, R, lt, a) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.beginPath(); ctx.arc(cx, cy, R - 14, 0, TAU); ctx.clip();
  ctx.strokeStyle = COL.red; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const xs = [-0.62, -0.3, -0.18, -0.04, 0.1, 0.2, 0.34, 0.62];
  const ys = [0, 0, -0.1, 0.42, -0.5, 0.14, 0, 0];
  const pt = i => [cx + xs[i] * R, cy + ys[i] * R * 0.8];
  const f = E.inOutCubic(clamp(a)) * (xs.length - 1);
  ctx.beginPath(); ctx.moveTo(...pt(0));
  for (let i = 1; i < xs.length; i++) {
    const [ax, ay] = pt(i - 1), [bx, by] = pt(i), k = clamp(f - (i - 1));
    if (k <= 0) break;
    ctx.lineTo(lerp(ax, bx, k), lerp(ay, by, k));
  }
  ctx.stroke();
  ctx.restore();
  for (let k = 0; k < 2; k++) {
    const ph = (lt * 0.55 + k * 0.5) % 1;
    ctx.save();
    ctx.globalAlpha *= a * (1 - ph) * 0.4;
    ctx.strokeStyle = COL.red; ctx.lineWidth = 2;
    circle(cx, cy, R + 10 + ph * 80); ctx.stroke();
    ctx.restore();
  }
}

// ───────────────────────── 1. intro ─────────────────────────
function sceneIntro(lt) {
  const cx = W / 2, cy = 290, R = 96;
  const draw = E.inOutCubic(P(lt, 0.25, 1.9));
  const morph = P(lt, 2.0, 1.25);
  drawRingMotif(cx, cy, R, lt, { draw, morph, lineY: H / 2, width: lerp(4, 9, E.outCubic(P(lt, 2.6, 0.8))) });
  drawRingInner(cx, cy, R, lt, P(lt, 3.0, 0.8));

  drawLogo(cx, 528, 1000, P(lt, 3.0, 1.2), { edge: true });

  const tag = '만성질환의 예방부터 진단, 관리까지';
  const tw = measure(tag, 46, 600);
  maskTxt(tag, cx, 712, P(lt, 4.4, 0.9), { size: 46, weight: 600, align: 'center' });
  const lp = E.outCubic(P(lt, 4.6, 0.9));
  ctx.save();
  ctx.strokeStyle = 'rgba(239,62,54,0.7)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - tw / 2 - 36, 696); ctx.lineTo(cx - tw / 2 - 36 - 120 * lp, 696);
  ctx.moveTo(cx + tw / 2 + 36, 696); ctx.lineTo(cx + tw / 2 + 36 + 120 * lp, 696);
  ctx.stroke();
  ctx.restore();
  txt('INTEGRATED HEALTHCARE FOR CHRONIC DISEASE', cx, 772, { size: 20, weight: 600, spacing: 6, align: 'center', color: COL.muted, alpha: E.outCubic(P(lt, 5.0, 0.8)) });
}

// ───────────────────────── 2. story / timeline ─────────────────────────
const STORY = [
  { year: '2021', title: '바라바이오 설립', d: ['강남세브란스병원 안철우 교수 창업', '당뇨·만성대사질환 진단 플랫폼'] },
  { year: '2024', title: 'HLB그룹 편입', d: ['HLB글로벌, 지분 68% 확보', '최대주주로 그룹 합류'] },
  { year: '2025', title: 'HLB라이프케어 출범', d: ['사명 변경', '만성질환 통합 헬스케어 집중'] },
  { year: '2026', title: '피코링 허가·출시', d: ['식약처 3등급 의료기기 허가', '연속혈당측정기 피코링 출시'] },
];
function sceneStory(lt) {
  header(lt, 'OUR STORY', '임상 현장의 경험에서 시작된 헬스케어 혁신');
  const y = 640, x0 = 160, x1 = 1760;
  const xs = [370, 770, 1170, 1570];
  const lp = E.inOutCubic(P(lt, 0.6, 1.1));
  ctx.save();
  ctx.strokeStyle = COL.line; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(lerp(x0, x1, lp), y); ctx.stroke();
  const tNode = i => 1.3 + i * 1.6;
  let fill = x0;
  xs.forEach((x, i) => { fill = lerp(fill, x, E.inOutCubic(P(lt, tNode(i) - 0.55, 0.55))); });
  fill = lerp(fill, x1, E.inOutCubic(P(lt, tNode(3) + 0.6, 1.4)));
  ctx.strokeStyle = redGrad(x0, x1); ctx.lineWidth = 4;
  if (lt > tNode(0) - 0.55) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(fill, y); ctx.stroke(); }
  ctx.restore();

  STORY.forEach((it, i) => {
    const t0 = tNode(i), x = xs[i];
    const pop = P(lt, t0, 0.55);
    if (pop <= 0) return;
    const s = E.outBack(pop);
    const active = i < 3 ? clamp(1 - P(lt, tNode(i + 1), 0.6)) : 1;
    orb(x, y, 60 + 30 * active, `rgba(239,62,54,${0.12 + 0.12 * active})`);
    ctx.save();
    ctx.fillStyle = COL.white; circle(x, y, 17 * s); ctx.fill();
    ctx.strokeStyle = COL.red; ctx.lineWidth = 3; circle(x, y, 17 * s); ctx.stroke();
    ctx.fillStyle = COL.red; circle(x, y, 7 * s); ctx.fill();
    ctx.restore();
    maskTxt(it.year, x, y - 52, P(lt, t0 + 0.05, 0.8), { size: 78, weight: 800, align: 'center', color: redText });
    const tp = E.outCubic(P(lt, t0 + 0.2, 0.7));
    ctx.save();
    ctx.globalAlpha *= tp; ctx.translate(0, (1 - tp) * 24);
    txt(it.title, x, y + 86, { size: 36, weight: 700, align: 'center' });
    it.d.forEach((line, k) => txt(line, x, y + 138 + k * 38, { size: 25, weight: 400, align: 'center', color: COL.muted }));
    ctx.restore();
  });
}

// ───────────────────────── 3. vision (빨간 패널) ─────────────────────────
const VISION = [
  { ko: '예방', en: 'PREVENTION', icon: 'shield' },
  { ko: '진단', en: 'DIAGNOSIS', icon: 'drop' },
  { ko: '관리', en: 'MANAGEMENT', icon: 'chart' },
];
function sceneVision(lt) {
  header(lt, 'VISION', '만성질환의 모든 순간을 잇는 통합 헬스케어', { x: W / 2, y: 170, align: 'center', size: 58, onRed: true });
  const xs = [560, 960, 1360], cy = 560, R = 140;

  // 순환 루프 (관리 → 예방)
  const loopP = E.inOutCubic(P(lt, 2.6, 1.3));
  if (loopP > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 12]); ctx.lineDashOffset = -lt * 40;
    ctx.beginPath();
    const steps = 80;
    for (let i = 0; i <= steps * loopP; i++) {
      const a = lerp(0.12, Math.PI - 0.12, i / steps);
      const x = 960 + Math.cos(a) * 400, y = cy + 90 + Math.sin(a) * 150;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    for (let k = 0; k < 3; k++) {
      const u = ((lt * 0.22 + k / 3) % 1) * loopP;
      const a = lerp(0.12, Math.PI - 0.12, u);
      const x = 960 + Math.cos(a) * 400, y = cy + 90 + Math.sin(a) * 150;
      orb(x, y, 26, 'rgba(255,255,255,0.45)');
      ctx.fillStyle = COL.white; circle(x, y, 4.5); ctx.fill();
    }
    txt('끊김 없는 데이터 순환', 960, cy + 268, { size: 22, weight: 600, spacing: 2, align: 'center', color: COL.white, alpha: 0.9 * P(lt, 3.5, 0.6) });
  }

  VISION.forEach((v, i) => {
    const t0 = 0.9 + i * 0.4, x = xs[i];
    const p = P(lt, t0, 0.7);
    if (p <= 0) return;
    const s = lerp(0.6, 1, E.outBack(p));
    const glow = 0.5 + 0.5 * Math.sin(lt * 2 - i * 1.1);
    ctx.save();
    ctx.globalAlpha *= clamp(p * 2);
    ctx.translate(x, cy); ctx.scale(s, s);
    orb(0, 0, R * 1.6, `rgba(255,190,170,${0.12 + 0.08 * glow})`);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; circle(0, 0, R); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; circle(0, 0, R); ctx.stroke();
    ctx.strokeStyle = COL.white; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, R + 12, lt * 0.8 + i, lt * 0.8 + i + 0.9); ctx.stroke();
    icon(v.icon, 0, -40, 74, COL.white, lt);
    txt(v.ko, 0, 50, { size: 46, weight: 700, align: 'center', color: COL.white });
    txt(v.en, 0, 86, { size: 17, weight: 600, spacing: 5, align: 'center', color: 'rgba(255,255,255,0.78)' });
    ctx.restore();
  });

  for (let i = 0; i < 2; i++) {
    const a = E.outCubic(P(lt, 1.6 + i * 0.4, 0.6));
    if (a <= 0) continue;
    const xa = xs[i] + R + 22, xb = xs[i + 1] - R - 22;
    for (let k = 0; k < 3; k++) {
      const ph = (lt * 1.4 + k / 3) % 1;
      const x = lerp(xa, xb, ph);
      ctx.save();
      ctx.globalAlpha *= a * Math.sin(ph * Math.PI);
      ctx.strokeStyle = COL.white; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 7, cy - 11); ctx.lineTo(x + 5, cy); ctx.lineTo(x - 7, cy + 11); ctx.stroke();
      ctx.restore();
    }
  }

  const pills = ['의료 빅데이터', 'AI 플랫폼', '스마트 디바이스'];
  const pw = pills.map(s => measure(s, 26, 600) + 64);
  const gap = 70, total = pw.reduce((a, b) => a + b, 0) + gap * 2;
  let x = W / 2 - total / 2;
  pills.forEach((s, i) => {
    const p = E.outCubic(P(lt, 4.2 + i * 0.3, 0.6));
    ctx.save(); ctx.globalAlpha *= p; ctx.translate(0, (1 - p) * 20);
    rrect(x, 908, pw[i], 58, 29);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1.5; ctx.stroke();
    txt(s, x + pw[i] / 2, 946, { size: 26, weight: 600, align: 'center', color: COL.white });
    if (i < 2) txt('×', x + pw[i] + gap / 2, 946, { size: 30, weight: 300, align: 'center', color: COL.white });
    ctx.restore();
    x += pw[i] + gap;
  });
}

// ───────────────────────── 4. product: 피코링 ─────────────────────────
function drawSensor(cx, cy, r, lt, a = 1, rings = true) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  if (rings) {
    for (let k = 0; k < 3; k++) {
      const ph = (lt * 0.5 + k / 3) % 1;
      ctx.save(); ctx.globalAlpha *= (1 - ph) * 0.45;
      ctx.strokeStyle = COL.red; ctx.lineWidth = 2;
      circle(cx, cy, r * 1.25 + ph * r * 1.3); ctx.stroke();
      ctx.restore();
    }
  }
  // 그림자
  const sh = ctx.createRadialGradient(cx, cy + r * 0.18, r * 0.5, cx, cy + r * 0.18, r * 1.4);
  sh.addColorStop(0, 'rgba(150,40,30,0.28)'); sh.addColorStop(1, 'rgba(150,40,30,0)');
  ctx.fillStyle = sh; circle(cx, cy + r * 0.18, r * 1.4); ctx.fill();
  // 부착 패치
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; circle(cx, cy, r * 1.16); ctx.fill();
  ctx.strokeStyle = 'rgba(200,80,70,0.22)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 7]);
  circle(cx, cy, r * 1.16); ctx.stroke(); ctx.setLineDash([]);
  // 본체
  const body = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
  body.addColorStop(0, '#FFFFFF'); body.addColorStop(0.6, '#F1F2F5'); body.addColorStop(1, '#D3D7DF');
  ctx.fillStyle = body; circle(cx, cy, r); ctx.fill();
  const sheen = ctx.createConicGradient(lt * 0.7, cx, cy);
  sheen.addColorStop(0, 'rgba(255,255,255,0)'); sheen.addColorStop(0.08, 'rgba(255,255,255,0.7)');
  sheen.addColorStop(0.18, 'rgba(255,255,255,0)'); sheen.addColorStop(0.55, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.62, 'rgba(255,255,255,0.4)'); sheen.addColorStop(0.72, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen; circle(cx, cy, r); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = Math.max(1, r * 0.014); circle(cx, cy, r * 0.93); ctx.stroke();
  ctx.strokeStyle = 'rgba(150,155,168,0.28)'; ctx.lineWidth = Math.max(1, r * 0.012); circle(cx, cy, r * 0.62); ctx.stroke();
  // 중앙 버튼 (앱 이미지처럼 작은 원 + 점)
  const bx = cx - r * 0.06, by = cy + r * 0.04;
  ctx.save();
  ctx.shadowColor = 'rgba(80,80,100,0.25)'; ctx.shadowBlur = r * 0.08; ctx.shadowOffsetY = r * 0.02;
  ctx.fillStyle = '#F7F8FA'; circle(bx, by, r * 0.17); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(140,145,160,0.45)'; ctx.lineWidth = Math.max(1, r * 0.012); circle(bx, by, r * 0.17); ctx.stroke();
  ctx.fillStyle = '#9AA0AE'; circle(bx + r * 0.05, by - r * 0.03, r * 0.035); ctx.fill();
  const led = 0.5 + 0.5 * Math.sin(lt * 3);
  ctx.fillStyle = `rgba(239,62,54,${0.5 + 0.5 * led})`; circle(cx + r * 0.42, cy - r * 0.42, r * 0.025); ctx.fill();
  ctx.restore();
}

const SPECS = [
  { label: 'WEIGHT', num: 2.16, dec: 2, unit: 'g', desc: ['각설탕 1개보다 가벼운', '초경량 센서'] },
  { label: 'WEAR TIME', pre: '최대 ', num: 15, dec: 0, unit: '일', desc: ['한 번 부착으로', '채혈 없이 연속 측정'] },
  { label: 'REAL-TIME', num: 1, dec: 0, unit: '분', fixed: true, desc: ['블루투스로 앱에', '혈당 자동 전송'] },
  { label: 'ACCURACY · MARD', num: 8.66, dec: 2, unit: '%', desc: ['높은 측정 정확도', '(낮을수록 정확)'] },
];
function sceneProduct(lt) {
  const k = E.inOutCubic(P(lt, 4.6, 1.0));         // A → B 전환
  const ap = P(lt, 0.15, 1.1);
  const sA = lerp(0.5, 1, E.outBack(ap));
  const sx = lerp(600, 450, k), sy = 530, sr = lerp(200, 165, k) * sA;
  orb(sx, sy, sr * 2.6, 'rgba(255,107,79,0.10)');
  drawSensor(sx, sy, sr, lt, clamp(ap * 2));

  // 치수 표기 (A, B 모두 유지)
  const dm = E.outCubic(P(lt, 2.8, 0.8));
  if (dm > 0) {
    const yy = sy + sr * 1.16 + 64;
    const half = sr * dm;
    ctx.save();
    ctx.strokeStyle = 'rgba(29,33,41,0.45)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx - half, yy); ctx.lineTo(sx + half, yy);
    ctx.moveTo(sx - half, yy - 10); ctx.lineTo(sx - half, yy + 10);
    ctx.moveTo(sx + half, yy - 10); ctx.lineTo(sx + half, yy + 10);
    ctx.stroke();
    ctx.setLineDash([4, 6]); ctx.globalAlpha *= 0.5;
    ctx.beginPath(); ctx.moveTo(sx - sr, sy); ctx.lineTo(sx - sr, yy); ctx.moveTo(sx + sr, sy); ctx.lineTo(sx + sr, yy); ctx.stroke();
    ctx.restore();
    txt('2.2cm × 4.2mm', sx, yy + 44, { size: 28, weight: 700, align: 'center', alpha: dm });
  }

  // ── A: 제품 소개
  if (k < 1) {
    ctx.save();
    ctx.globalAlpha *= 1 - k; ctx.translate(-60 * k, 0);
    const X = 1040;
    txt('PRODUCT · PICOLING', X + 64, 300, { size: 22, weight: 700, spacing: 6, color: COL.red, alpha: P(lt, 0.4, 0.5) });
    ctx.save(); ctx.strokeStyle = COL.red; ctx.lineWidth = 2.5; ctx.globalAlpha *= E.outCubic(P(lt, 0.3, 0.6));
    ctx.beginPath(); ctx.moveTo(X, 292); ctx.lineTo(X + 46, 292); ctx.stroke(); ctx.restore();
    maskTxt('피코링', X, 450, P(lt, 0.6, 0.9), { size: 150, weight: 800 });
    maskTxt('초소형 스마트 연속혈당측정기', X, 540, P(lt, 1.0, 0.8), { size: 46, weight: 700, color: redText });
    txt('CGM · CONTINUOUS GLUCOSE MONITORING', X, 590, { size: 20, weight: 600, spacing: 3, color: COL.muted, alpha: P(lt, 1.4, 0.6) });
    const bp = P(lt, 1.9, 0.6);
    if (bp > 0) {
      const bw = measure('식약처 3등급 의료기기 허가', 28, 700) + 110;
      ctx.save();
      const bs = E.outBack(bp);
      ctx.translate(X + bw / 2, 670); ctx.scale(bs, bs); ctx.translate(-(X + bw / 2), -670);
      ctx.globalAlpha *= clamp(bp * 2);
      rrect(X, 636, bw, 68, 34);
      ctx.fillStyle = COL.pink; ctx.fill();
      ctx.strokeStyle = 'rgba(239,62,54,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = COL.red; circle(X + 40, 670, 20); ctx.fill();
      icon('check', X + 40, 670, 30, COL.white);
      txt('식약처 3등급 의료기기 허가', X + 76, 680, { size: 28, weight: 700, color: COL.deep });
      ctx.restore();
    }
    const dp = E.outCubic(P(lt, 2.4, 0.7));
    ctx.save(); ctx.globalAlpha *= dp; ctx.translate(0, (1 - dp) * 20);
    txt('채혈 없이, 24시간 실시간 혈당 측정', X, 790, { size: 32, weight: 600 });
    txt('100원 동전보다 작은 크기 · 1회 부착 최대 15일 사용', X, 838, { size: 24, weight: 400, color: COL.muted });
    ctx.restore();
    ctx.restore();
  }

  // ── B: 핵심 스펙
  const hp = lt - 5.2;
  if (hp > 0) {
    const X = 900;
    txt('KEY SPECS', X + 64, 232, { size: 22, weight: 700, spacing: 6, color: COL.red, alpha: P(hp, 0, 0.5) });
    ctx.save(); ctx.strokeStyle = COL.red; ctx.lineWidth = 2.5; ctx.globalAlpha *= E.outCubic(P(hp, 0, 0.5));
    ctx.beginPath(); ctx.moveTo(X, 224); ctx.lineTo(X + 46, 224); ctx.stroke(); ctx.restore();
    maskTxt('작지만, 정밀하게', X, 306, P(hp, 0.1, 0.8), { size: 56, weight: 700 });

    const cw = 435, ch = 230, gap = 30;
    SPECS.forEach((sp, i) => {
      const cxp = X + (i % 2) * (cw + gap), cyp = 360 + Math.floor(i / 2) * (ch + 26);
      const t0 = 5.6 + i * 0.3;
      const p = E.outCubic(P(lt, t0, 0.7));
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha *= p; ctx.translate(0, (1 - p) * 40);
      card(cxp, cyp, cw, ch, 24);
      ctx.fillStyle = redGrad(cxp, cxp + cw); ctx.fillRect(cxp + 32, cyp, 60 * p, 4);
      txt(sp.label, cxp + 32, cyp + 52, { size: 17, weight: 700, spacing: 3, color: COL.red });
      const cnt = sp.fixed ? sp.num : sp.num * E.outCubic(P(lt, t0 + 0.1, 1.3));
      let nx = cxp + 32;
      if (sp.pre) nx += txt(sp.pre, nx, cyp + 128, { size: 30, weight: 700 }) + 4;
      const nw = txt(cnt.toFixed(sp.dec), nx, cyp + 128, { size: 72, weight: 800, color: redText });
      txt(sp.unit, nx + nw + 8, cyp + 128, { size: 32, weight: 700, color: COL.ink });
      sp.desc.forEach((d, j) => txt(d, cxp + 32, cyp + 172 + j * 32, { size: 22, weight: 400, color: COL.muted }));
      ctx.restore();
    });
    txt('※ 제품 정보: 회사 발표 및 언론 보도 기준', X, 930, { size: 18, weight: 400, color: COL.faint, alpha: P(lt, 7.0, 0.6) });
  }
}

// ───────────────────────── 5. 마이피코링 앱 ─────────────────────────
function myPicoling(x, y, s, align = 'center', alpha = 1) {
  const bw = 46 * s, bh = 32 * s, gap = 6 * s;
  const tw = measure('picoling', 44 * s, 400);
  const total = bw + gap + tw;
  const lx = leftOf(x, total, align);
  ctx.save();
  ctx.globalAlpha *= alpha;
  rrect(lx, y - bh + 4 * s, bw, bh, 8 * s); ctx.fillStyle = COL.app; ctx.fill();
  txt('my', lx + bw / 2, y - 3 * s, { size: 22 * s, weight: 800, align: 'center', color: COL.white });
  txt('picoling', lx + bw + gap, y, { size: 44 * s, weight: 400, color: COL.app });
  ctx.restore();
}
function blueCurve(u) {
  return 0.5 + 0.34 * Math.exp(-Math.pow((u - 0.25) / 0.1, 2)) - 0.18 * Math.exp(-Math.pow((u - 0.45) / 0.07, 2))
    + 0.16 * Math.exp(-Math.pow((u - 0.62) / 0.07, 2)) - 0.12 * Math.exp(-Math.pow((u - 0.78) / 0.06, 2))
    + 0.12 * Math.exp(-Math.pow((u - 0.9) / 0.06, 2));
}
function statusBar(sx, sy, sw) {
  const y = sy + 30, r = sx + sw - 28;
  ctx.save();
  ctx.fillStyle = COL.ink;
  rrect(r - 36, y - 10, 36, 20, 7); ctx.fill();
  txt('90', r - 18, y + 6, { size: 14, weight: 800, align: 'center', color: COL.white });
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(r - 58, y + 8, 4 + i * 5, -Math.PI * 0.75, -Math.PI * 0.25); ctx.stroke(); }
  for (let i = 0; i < 4; i++) ctx.fillRect(r - 100 + i * 7, y + 6 - (i + 1) * 4, 4.5, (i + 1) * 4);
  txt('9:41', sx + 40, y + 7, { size: 18, weight: 700 });
  ctx.restore();
}
function appSplash(sx, sy, sw, sh, lt, a) {
  ctx.save();
  ctx.globalAlpha *= a;
  const cx = sx + sw / 2;
  const wp = E.outCubic(P(lt, 0.5, 0.7));
  ctx.save(); ctx.globalAlpha *= wp; ctx.translate(0, (1 - wp) * 20);
  myPicoling(cx, sy + 190, 1.05);
  txt('나의 혈당 관리를 스마트하게, 마이피코링', cx, sy + 236, { size: 16, weight: 600, align: 'center', color: COL.app });
  ctx.restore();

  // 빨간 아치 (앱 화면 하단)
  const ar = E.outCubic(P(lt, 0.2, 1.0));
  const arcTop = sy + sh - 270 + (1 - ar) * 300;
  ctx.save();
  circle(cx, arcTop + 760, 760);
  ctx.fillStyle = lgrad(0, arcTop, 0, sy + sh, [[0, '#F26552'], [1, '#EC4B3D']]); ctx.fill();
  ctx.restore();
  drawLogo(cx, sy + sh - 70 + (1 - ar) * 100, 170, P(lt, 1.0, 0.8), { white: true });

  // 혈당 카드 + 센서
  const cp = E.outCubic(P(lt, 0.8, 0.8));
  const cw = 156, ch = 206, cxL = cx - 40, cy = sy + 360 + (1 - cp) * 40;
  ctx.save(); ctx.globalAlpha *= cp;
  card(cxL, cy, cw, ch, 20, { shadow: 'rgba(60,110,200,0.18)', blur: 30, dy: 10, stroke: 'rgba(60,110,200,0.08)' });
  txt('116', cxL + cw / 2, cy + 42, { size: 24, weight: 800, align: 'center', color: COL.blue });
  ctx.strokeStyle = 'rgba(60,110,200,0.12)'; ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(cxL + 14, cy + 80 + i * 36); ctx.lineTo(cxL + cw - 14, cy + 80 + i * 36); ctx.stroke(); }
  const gp = E.inOutCubic(P(lt, 1.2, 1.4));
  ctx.beginPath();
  const n = 60;
  for (let i = 0; i <= n * gp; i++) {
    const u = i / n, px = cxL + 10 + u * (cw + 30), py = cy + ch - 30 - blueCurve(u) * 140;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.strokeStyle = COL.blue; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(47,134,246,0.35)'; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowColor = 'transparent';
  if (gp > 0.3) {
    const px = cxL + 10 + 0.25 * (cw + 30), py = cy + ch - 30 - blueCurve(0.25) * 140;
    ctx.fillStyle = COL.white; circle(px, py, 6); ctx.fill();
    ctx.strokeStyle = COL.blue; ctx.lineWidth = 3; circle(px, py, 6); ctx.stroke();
  }
  ctx.restore();
  const sp = E.outBack(P(lt, 1.1, 0.6));
  if (sp > 0) {
    ctx.save(); ctx.translate(cxL - 4, cy + ch - 46); ctx.scale(sp, sp);
    drawSensor(0, 0, 52, lt, 1, false);
    ctx.restore();
  }
  ctx.restore();
}
function appDashboard(sx, sy, sw, sh, dl, a) {
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate((1 - a) * 40, 0);
  const L = sx + 26, R = sx + sw - 26, gw = R - L;
  myPicoling(L, sy + 90, 0.55, 'left');
  icon('bt', R - 10, sy + 80, 26, COL.app);

  txt('현재 혈당', L, sy + 142, { size: 15, weight: 600, color: COL.muted });
  const val = Math.round(116 + 3 * Math.sin(dl * 1.1));
  const vw = txt(String(val), L, sy + 200, { size: 56, weight: 800 });
  txt('mg/dL', L + vw + 8, sy + 198, { size: 16, weight: 600, color: COL.muted });
  const chipW = measure('목표 범위', 14, 700) + 26;
  rrect(R - chipW, sy + 166, chipW, 30, 15); ctx.fillStyle = COL.skyBg; ctx.fill();
  txt('목표 범위', R - chipW / 2, sy + 186, { size: 14, weight: 700, align: 'center', color: COL.blue });

  // 그래프 카드
  const gy = sy + 222, gh = 236;
  card(L - 4, gy, gw + 8, gh, 18, { shadow: 'rgba(60,110,200,0.14)', blur: 24, dy: 8, stroke: 'rgba(60,110,200,0.08)' });
  const px0 = L + 14, pw = gw - 28, py0 = gy + 24, ph = gh - 64;
  const vy = v => py0 + ph - (v - 50) / 170 * ph;
  ctx.fillStyle = 'rgba(47,134,246,0.07)'; ctx.fillRect(px0, vy(180), pw, vy(70) - vy(180));
  const curve = u => 112 + 46 * Math.exp(-Math.pow((u - 0.3) / 0.08, 2)) + 30 * Math.exp(-Math.pow((u - 0.74) / 0.07, 2))
    - 16 * Math.exp(-Math.pow((u - 0.52) / 0.06, 2)) + 6 * Math.sin(TAU * u * 3);
  const gp = E.inOutCubic(P(dl, 0.3, 2.2));
  ctx.save();
  ctx.beginPath();
  const n = 120;
  for (let i = 0; i <= n * gp; i++) {
    const u = i / n, x = px0 + u * pw, y = vy(curve(u));
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.strokeStyle = COL.blue; ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
  const marker = (u, label, color) => {
    if (gp < u) return;
    const mp = E.outBack(P(dl, 0.3 + 2.2 * u, 0.4));
    const x = px0 + u * pw, y = vy(curve(u)) - 16;
    const w = measure(label, 12, 700) + 18;
    ctx.save(); ctx.translate(x, y); ctx.scale(mp, mp);
    rrect(-w / 2, -24, w, 22, 11); ctx.fillStyle = color; ctx.fill();
    txt(label, 0, -8, { size: 12, weight: 700, align: 'center', color: COL.white });
    ctx.restore();
    ctx.fillStyle = COL.white; circle(x, y + 16, 5); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; circle(x, y + 16, 5); ctx.stroke();
  };
  marker(0.3, '식사', COL.app);
  marker(0.52, '걷기', '#14B8A6');
  marker(0.74, '식사', COL.app);
  ['06', '12', '18', '24'].forEach((s, i) => txt(s, px0 + pw * (i + 1) / 4, gy + gh - 14, { size: 12, weight: 500, align: 'center', color: COL.faint }));

  // 식사 · 걷기 타일
  const tp = E.outCubic(P(dl, 2.6, 0.6));
  if (tp > 0) {
    ctx.save(); ctx.globalAlpha *= tp; ctx.translate(0, (1 - tp) * 20);
    const tw = (gw - 12) / 2, ty = sy + 476, th = 92;
    [['meal', '식사', '3회 기록', COL.app, 'rgba(239,90,74,0.1)'], ['run', '걷기', '40분', '#14B8A6', 'rgba(20,184,166,0.1)']].forEach(([ic, a1, a2, c, bg], i) => {
      const tx = L + i * (tw + 12);
      card(tx, ty, tw, th, 16, { blur: 20, dy: 6, shadow: 'rgba(120,60,50,0.10)' });
      ctx.fillStyle = bg; circle(tx + 34, ty + th / 2, 20); ctx.fill();
      icon(ic, tx + 34, ty + th / 2, 24, c);
      txt(a1, tx + 64, ty + 40, { size: 14, weight: 600, color: COL.muted });
      txt(a2, tx + 64, ty + 66, { size: 19, weight: 800 });
    });
    ctx.restore();
  }
  // 인사이트 카드
  const ip = E.outCubic(P(dl, 3.6, 0.6));
  if (ip > 0) {
    ctx.save(); ctx.globalAlpha *= ip; ctx.translate(0, (1 - ip) * 20);
    const iy = sy + 588;
    rrect(L - 4, iy, gw + 8, 116, 18); ctx.fillStyle = COL.blush; ctx.fill();
    ctx.strokeStyle = 'rgba(239,62,54,0.18)'; ctx.lineWidth = 1.5; ctx.stroke();
    icon('spark', L + 22, iy + 32, 22, COL.app);
    txt('오늘의 건강 인사이트', L + 42, iy + 38, { size: 14, weight: 800, color: COL.app });
    txt('식후 걷기로 혈당이 안정적으로', L + 14, iy + 72, { size: 17, weight: 600 });
    txt('유지되고 있어요', L + 14, iy + 98, { size: 17, weight: 600 });
    ctx.restore();
  }
  ctx.restore();
}
function drawAppPhone(cx, cy, w, h, lt, a) {
  if (a <= 0) return;
  const x = cx - w / 2, y = cy - h / 2;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.save();
  ctx.shadowColor = 'rgba(120,40,30,0.28)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 34;
  rrect(x, y, w, h, 64); ctx.fillStyle = lgrad(x, y, x + w, y + h, [[0, '#EFE6DD'], [0.5, '#D8CCC0'], [1, '#EDE3D9']]); ctx.fill();
  ctx.restore();
  rrect(x + 6, y + 6, w - 12, h - 12, 58); ctx.fillStyle = '#121216'; ctx.fill();
  const sx = x + 18, sy = y + 18, sw = w - 36, sh = h - 36;
  ctx.save();
  rrect(sx, sy, sw, sh, 46); ctx.clip();
  ctx.fillStyle = COL.white; ctx.fillRect(sx, sy, sw, sh);
  statusBar(sx, sy, sw);
  const spA = 1 - E.inCubic(P(lt, 3.6, 0.5));
  const dA = E.outCubic(P(lt, 3.9, 0.6));
  if (spA > 0) { ctx.save(); ctx.translate(-50 * (1 - spA), 0); appSplash(sx, sy, sw, sh, lt, spA); ctx.restore(); }
  if (dA > 0) appDashboard(sx, sy, sw, sh, lt - 3.9, dA);
  ctx.restore();
  ctx.restore();
}
const APP_FEATURES = [
  { icon: 'bt', t: '실시간 혈당 모니터링', d: '1분마다 블루투스로 앱에 자동 전송', hl: [4.2, 2.2] },
  { icon: 'chart', t: '식사·운동 연결 지표', d: '식사와 운동까지 연결된 지표를 한눈에', hl: [6.4, 1.4] },
  { icon: 'spark', t: '맞춤 건강 인사이트', d: '혈당·생활 습관 데이터를 함께 분석', hl: [7.6, 1.8] },
];
function sceneApp(lt) {
  const pa = E.outCubic(P(lt, 0.1, 1.0));
  orb(590, 560, 560, `rgba(255,107,79,${0.16 * pa})`);
  ctx.save(); ctx.translate(0, (1 - pa) * 120);
  drawAppPhone(590, 548, 400, 820, lt, pa);
  ctx.restore();

  const X = 1000;
  txt('MY PICOLING APP', X + 64, 262, { size: 22, weight: 700, spacing: 6, color: COL.red, alpha: P(lt, 0.4, 0.5) });
  ctx.save(); ctx.strokeStyle = COL.red; ctx.lineWidth = 2.5; ctx.globalAlpha *= E.outCubic(P(lt, 0.3, 0.6));
  ctx.beginPath(); ctx.moveTo(X, 254); ctx.lineTo(X + 46, 254); ctx.stroke(); ctx.restore();
  maskTxt('나의 혈당 관리를 스마트하게,', X, 340, P(lt, 0.5, 0.9), { size: 50, weight: 700 });
  maskTxt('마이피코링', X, 444, P(lt, 0.8, 0.9), { size: 90, weight: 800, color: redText });

  APP_FEATURES.forEach((f, i) => {
    const p = E.outCubic(P(lt, 1.6 + i * 0.3, 0.7));
    if (p <= 0) return;
    const y0 = 560 + i * 128;
    const hl = bump(lt, f.hl[0], f.hl[1] + 0.6);
    ctx.save();
    ctx.globalAlpha *= p; ctx.translate((1 - p) * 40, 0);
    if (hl > 0) {
      ctx.save(); ctx.globalAlpha *= hl;
      card(X - 24, y0 - 54, 780, 108, 22);
      ctx.fillStyle = redGrad(X - 24, X - 24, y0 - 54, y0 + 54); ctx.fillRect(X - 24, y0 - 30, 4, 60);
      ctx.restore();
    }
    const s = 1 + 0.08 * hl;
    ctx.fillStyle = hl > 0.5 ? COL.red : COL.pink;
    circle(X + 38, y0, 36 * s); ctx.fill();
    icon(f.icon, X + 38, y0, 40 * s, hl > 0.5 ? COL.white : COL.red, lt);
    txt(f.t, X + 100, y0 - 6, { size: 30, weight: 700 });
    txt(f.d, X + 100, y0 + 30, { size: 22, weight: 400, color: COL.muted });
    ctx.restore();
  });
}

// ───────────────────────── 6. core projects ─────────────────────────
const rngNet = mulberry32(31);
const NET = Array.from({ length: 46 }, () => ({ x: rngNet() * W, y: rngNet() * H, ph: rngNet() * TAU }));
const NET_EDGES = [];
NET.forEach((a, i) => NET.forEach((b, j) => { if (j > i && Math.hypot(a.x - b.x, a.y - b.y) < 280) NET_EDGES.push([i, j]); }));
const PROJECTS = [
  { n: '01', icon: 'ai', t: ['AI 기반', '만성질환 예측 플랫폼'], d: ['의료 빅데이터로', '발병 위험을 미리 예측'] },
  { n: '02', icon: 'device', t: ['개인 맞춤형', '만성질환 의료기기'], d: ['예방부터 진단·관리까지', '나에게 맞춘 디바이스'] },
  { n: '03', icon: 'capsule', t: ['만성질환', '건강기능식품'], d: ['데이터 기반으로 설계한', '맞춤형 건강 솔루션'] },
];
function sceneProjects(lt) {
  const na = P(lt, 0, 1.2);
  if (na > 0) {
    const pos = NET.map(p => [p.x + 14 * Math.sin(lt * 0.35 + p.ph), p.y + 12 * Math.cos(lt * 0.3 + p.ph)]);
    ctx.save();
    ctx.lineWidth = 1;
    for (const [i, j] of NET_EDGES) {
      const [ax, ay] = pos[i], [bx, by] = pos[j];
      const d = Math.hypot(ax - bx, ay - by);
      ctx.strokeStyle = `rgba(239,62,54,${na * 0.09 * (1 - d / 300)})`;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    pos.forEach(([x, y], i) => {
      ctx.fillStyle = `rgba(239,62,54,${na * (0.15 + 0.15 * Math.sin(lt * 2 + i))})`;
      circle(x, y, 2.5); ctx.fill();
    });
    ctx.restore();
  }
  header(lt, 'CORE PROJECTS', '의료 빅데이터로 여는 3대 핵심 사업');

  const cw = 470, ch = 470, gap = 65, x0 = (W - (cw * 3 + gap * 2)) / 2, y0 = 360;
  PROJECTS.forEach((pr, i) => {
    const t0 = 0.9 + i * 0.3;
    const p = E.outCubic(P(lt, t0, 0.8));
    if (p <= 0) return;
    const x = x0 + i * (cw + gap);
    const hl = bump(lt, 3.4 + i * 1.3, 1.6);
    ctx.save();
    ctx.globalAlpha *= p; ctx.translate(0, (1 - p) * 60 - hl * 14);
    card(x, y0, cw, ch, 28, { blur: 44 + 20 * hl, shadow: `rgba(190,60,50,${0.13 + 0.12 * hl})`, stroke: `rgba(239,62,54,${0.10 + 0.5 * hl})`, lw: 1.5 + hl });
    ctx.fillStyle = redGrad(x, x + cw); ctx.fillRect(x + 44, y0, (cw - 88) * E.outCubic(P(lt, t0 + 0.3, 0.9)), 4);
    txt(pr.n, x + 44, y0 + 78, { size: 30, weight: 800, spacing: 2, color: COL.red });
    ctx.fillStyle = hl > 0.5 ? COL.red : COL.pink; circle(x + cw - 100, y0 + 100, 56); ctx.fill();
    icon(pr.icon, x + cw - 100, y0 + 100, 66, hl > 0.5 ? COL.white : COL.red, lt);
    pr.t.forEach((s, j) => txt(s, x + 44, y0 + 250 + j * 54, { size: 40, weight: 700 }));
    ctx.fillStyle = 'rgba(239,62,54,0.14)'; ctx.fillRect(x + 44, y0 + 340, cw - 88, 1.5);
    pr.d.forEach((s, j) => txt(s, x + 44, y0 + 392 + j * 36, { size: 24, weight: 400, color: COL.muted }));
    ctx.restore();
  });

  const bp = E.outCubic(P(lt, 2.4, 0.8));
  ctx.save(); ctx.globalAlpha *= bp; ctx.translate(0, (1 - bp) * 16);
  const parts = [['혈당 데이터', COL.ink], ['  →  ', COL.red], ['맞춤 식단 · 건강기능식품 · 체중 관리 프로그램으로 확장', COL.muted]];
  const total = parts.reduce((a, [s]) => a + measure(s, 26, 600), 0);
  let x = W / 2 - total / 2;
  parts.forEach(([s, c]) => { x += txt(s, x, 935, { size: 26, weight: 600, color: c }); });
  ctx.restore();
}

// ───────────────────────── 7. partners ─────────────────────────
const PARTNERS = [
  { name: '인바디헬스케어', d: '피코링 판매 · 체성분 연계 건강관리', x: 400, y: 470 },
  { name: '연세대 미래캠퍼스', d: 'AI 디지털 헬스케어 공동연구 MOU', x: 1520, y: 470 },
  { name: '이노피아테크', d: '비접촉·비대면 진료 분야 확장', x: 400, y: 740 },
  { name: '솔닥', d: '만성질환 디지털 의료솔루션 구축', x: 1520, y: 740 },
];
function scenePartners(lt) {
  header(lt, 'PARTNERSHIP', '함께 확장하는 디지털 헬스케어 생태계', { x: W / 2, y: 160, align: 'center', size: 58 });
  const hx = W / 2, hy = 605, hr = 140;
  const cw = 500, ch = 124;

  PARTNERS.forEach((pt, i) => {
    const lp = E.inOutCubic(P(lt, 1.3 + i * 0.2, 0.8));
    if (lp <= 0) return;
    const left = pt.x < hx;
    const ex = left ? pt.x + cw / 2 : pt.x - cw / 2, ey = pt.y;
    const ang = Math.atan2(ey - hy, ex - hx);
    const sx0 = hx + Math.cos(ang) * (hr + 34), sy0 = hy + Math.sin(ang) * (hr + 34);
    const c1x = lerp(sx0, ex, 0.5), c1y = sy0, c2x = lerp(sx0, ex, 0.5), c2y = ey;
    const bez = u => {
      const m = 1 - u;
      return [m * m * m * sx0 + 3 * m * m * u * c1x + 3 * m * u * u * c2x + u * u * u * ex,
              m * m * m * sy0 + 3 * m * m * u * c1y + 3 * m * u * u * c2y + u * u * u * ey];
    };
    ctx.save();
    ctx.strokeStyle = 'rgba(239,62,54,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k <= 40 * lp; k++) { const [x, y] = bez(k / 40); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    if (lp >= 1) {
      for (let k = 0; k < 2; k++) {
        const u = (lt * 0.5 + k * 0.5 + i * 0.13) % 1;
        const [x, y] = bez(u);
        orb(x, y, 22, 'rgba(255,107,79,0.35)');
        ctx.fillStyle = COL.red; circle(x, y, 4.5); ctx.fill();
      }
    }
    ctx.restore();
  });

  const hp = P(lt, 0.6, 0.8);
  if (hp > 0) {
    const s = E.outBack(hp);
    ctx.save();
    ctx.globalAlpha *= clamp(hp * 2);
    ctx.translate(hx, hy); ctx.scale(s, s);
    orb(0, 0, hr * 2.3, 'rgba(255,107,79,0.16)');
    ctx.strokeStyle = 'rgba(239,62,54,0.4)'; ctx.lineWidth = 2; ctx.setLineDash([6, 10]); ctx.lineDashOffset = -lt * 30;
    circle(0, 0, hr + 34); ctx.stroke(); ctx.setLineDash([]);
    ctx.save();
    ctx.shadowColor = 'rgba(190,60,50,0.25)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 16;
    ctx.fillStyle = COL.white; circle(0, 0, hr); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = redGrad(-hr, hr, -hr, hr); ctx.lineWidth = 4; circle(0, 0, hr); ctx.stroke();
    drawLogo(0, 0, 226, 1);
    ctx.restore();
  }

  PARTNERS.forEach((pt, i) => {
    const p = E.outCubic(P(lt, 1.0 + i * 0.22, 0.7));
    if (p <= 0) return;
    const left = pt.x < hx;
    const x = pt.x - cw / 2, y = pt.y - ch / 2;
    ctx.save();
    ctx.globalAlpha *= p; ctx.translate((left ? -1 : 1) * (1 - p) * 50, 0);
    card(x, y, cw, ch, 22, { blur: 36, dy: 12 });
    ctx.fillStyle = redGrad(x, x, y, y + ch); ctx.fillRect(x, y + 26, 4, ch - 52);
    txt(pt.name, x + 36, y + 56, { size: 32, weight: 700 });
    txt(pt.d, x + 36, y + 96, { size: 22, weight: 400, color: COL.muted });
    ctx.restore();
  });

  const bp = E.outCubic(P(lt, 2.4, 0.8));
  ctx.save(); ctx.globalAlpha *= bp;
  const parts = [['B2C', COL.red], [' 헬스케어 커머스   ', COL.ink], ['·', COL.faint], ['   B2B', COL.red], [' 보험사 · 건강검진센터 협업', COL.ink]];
  const total = parts.reduce((a, [s]) => a + measure(s, 26, 600), 0);
  let x = W / 2 - total / 2;
  parts.forEach(([s, c]) => { x += txt(s, x, 955, { size: 26, weight: 600, color: c }); });
  ctx.restore();
}

// ───────────────────────── 8. outro ─────────────────────────
function sceneOutro(lt) {
  const cx = W / 2, cy = 290, R = 96;
  const rp = E.inOutCubic(P(lt, 0.15, 1.1));
  if (rp > 0) {
    ctx.save();
    ctx.strokeStyle = ringStroke(cx, cy, R);
    ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(239,62,54,0.35)'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * rp); ctx.stroke();
    ctx.restore();
  }
  drawRingInner(cx, cy, R, lt, P(lt, 0.7, 0.8));
  drawLogo(cx, 528, 1000, P(lt, 0.7, 1.2), { edge: true });
  maskTxt('데이터로 지키는 건강한 일상', cx, 712, P(lt, 1.7, 0.9), { size: 56, weight: 700, align: 'center' });
  txt('만성질환 예방 · 진단 · 관리 통합 헬스케어 솔루션', cx, 776, { size: 28, weight: 500, align: 'center', color: COL.muted, alpha: E.outCubic(P(lt, 2.2, 0.8)) });

  const up = E.outCubic(P(lt, 2.7, 0.7));
  if (up > 0) {
    const label = 'hlblifecare.co.kr';
    const w = measure(label, 28, 600, 1) + 100;
    ctx.save(); ctx.globalAlpha *= up; ctx.translate(0, (1 - up) * 20);
    rrect(cx - w / 2, 850, w, 64, 32);
    ctx.fillStyle = COL.pink; ctx.fill();
    ctx.strokeStyle = 'rgba(239,62,54,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
    icon('globe', cx - w / 2 + 40, 882, 30, COL.red);
    txt(label, cx - w / 2 + 66, 892, { size: 28, weight: 700, spacing: 1, color: COL.deep });
    ctx.restore();
  }
}

// ───────────────────────── frame composer ─────────────────────────
function drawScene(sc, t) {
  const lt = t - sc.s, dur = sc.e - sc.s;
  const isLast = sc === SCENES[SCENES.length - 1];
  const out = isLast ? 0 : E.inCubic(P(lt, dur - 0.55, 0.55));
  const zoom = 1 + 0.018 * (lt / dur) + out * 0.04;
  ctx.save();
  ctx.globalAlpha = 1 - out;
  ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H / 2 - out * 20);
  sc.draw(lt, dur);
  ctx.restore();
}
function renderFrame(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  drawBackground(t);
  for (const sc of SCENES) if (!sc.red && t >= sc.s && t < sc.e) drawScene(sc, t);

  // 빨간 패널 장면: 패널 모양으로 잘라서 그 위에 그린다
  for (const sc of SCENES) {
    if (!sc.red) continue;
    const pe = redPanelEdges(t, sc);
    if (!pe) continue;
    ctx.save();
    panelPath(pe.L, pe.R); ctx.clip();
    drawRedBackdrop(t);
    if (t >= sc.s && t < sc.e) drawScene(sc, t);
    ctx.restore();
    drawPanelAccents(pe);
  }
  drawWipeBands(t);

  if (noisePattern) {
    ctx.save(); ctx.globalAlpha = 0.02; ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = noisePattern; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  const fade = Math.max(1 - P(t, 0, 0.5), P(t, DURATION - 1.0, 1.0));
  if (fade > 0) { ctx.fillStyle = `rgba(255,255,255,${fade})`; ctx.fillRect(0, 0, W, H); }
}

// ───────────────────────── boot ─────────────────────────
async function boot() {
  const weights = [300, 400, 500, 600, 700, 800];
  LOGO.src = 'assets/hlb-lifecare-logo.png';
  await Promise.all([LOGO.decode(), ...weights.map(w => document.fonts.load(`${w} 40px Pretendard`, '가A1'))]);
  await document.fonts.ready;
  makeWhiteLogo();
  makeNoise();
  window.renderFrame = renderFrame;
  window.DURATION = DURATION;
  window.__ready = true;

  if (new URLSearchParams(location.search).has('render')) { document.body.classList.add('render'); return; }

  // 브라우저 미리보기: 클릭으로 재생/정지, 음악은 build/music.wav가 있으면 함께 재생
  const audio = new Audio('music.wav');
  let playing = false, t0 = 0, offset = 0;
  const now = () => (playing ? offset + (performance.now() - t0) / 1000 : offset);
  const loop = () => {
    let t = now();
    if (t >= DURATION) { offset = 0; t0 = performance.now(); t = 0; audio.currentTime = 0; }
    renderFrame(t);
    requestAnimationFrame(loop);
  };
  const toggle = () => {
    if (playing) { offset = now(); playing = false; audio.pause(); }
    else { t0 = performance.now(); playing = true; audio.currentTime = offset; audio.play().catch(() => {}); }
  };
  cv.addEventListener('click', toggle);
  addEventListener('keydown', e => {
    if (e.key === ' ') toggle();
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      offset = clamp(now() + (e.key === 'ArrowRight' ? 2 : -2), 0, DURATION - 0.01);
      t0 = performance.now(); audio.currentTime = offset;
    }
  });
  loop();
}
boot();
