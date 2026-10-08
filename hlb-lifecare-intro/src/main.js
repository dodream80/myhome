'use strict';
// HLB라이프케어 소개 모션그래픽.
// 모든 그림은 renderFrame(t)가 시간 t(초)만으로 결정적으로 그린다 → 프레임 단위 캡처 후 MP4로 인코딩.

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const W = 1920, H = 1080;
const FONT = '"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

const COL = {
  teal: '#22E1C3', cyan: '#38C6FF', blue: '#3A6DFF', coral: '#FF7D6E',
  white: '#F2F7FF', muted: '#93A8CA', dim: '#5B6F92', line: 'rgba(150,190,255,0.16)',
};

// 장면 경계는 96BPM 한 마디(2.5초)에 맞춘다. scripts/music.py와 같은 값을 쓴다.
const SCENES = [
  { id: 'intro', s: 0, e: 7.5, draw: sceneIntro },
  { id: 'story', s: 7.5, e: 17.5, draw: sceneStory },
  { id: 'vision', s: 17.5, e: 27.5, draw: sceneVision },
  { id: 'product', s: 27.5, e: 40, draw: sceneProduct },
  { id: 'projects', s: 40, e: 50, draw: sceneProjects },
  { id: 'partners', s: 50, e: 57.5, draw: scenePartners },
  { id: 'outro', s: 57.5, e: 65, draw: sceneOutro },
];
const DURATION = 65;

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
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
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
const brand = (x0, x1, y0 = 0, y1 = 0) => lgrad(x0, y0, x1, y1, [[0, COL.teal], [1, COL.cyan]]);
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); }
function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

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
  ctx.fillStyle = typeof o.color === 'function' ? o.color(lx, w) : (o.color || COL.white);
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

// 글자 단위로 떠오르는 텍스트.
function charsTxt(str, x, y, lt, o = {}) {
  const size = o.size || 40, weight = o.weight || 700, sp = o.spacing || 0;
  const stagger = o.stagger ?? 0.04, dur = o.dur ?? 0.6, rise = o.rise ?? size * 0.55;
  ctx.save();
  setFont(size, weight); ctx.letterSpacing = sp + 'px'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const w = ctx.measureText(str).width - sp;
  const lx = leftOf(x, w, o.align);
  const base = ctx.globalAlpha * (o.alpha ?? 1);
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.glowBlur || 30; }
  let prefix = '';
  [...str].forEach((ch, i) => {
    const cx = lx + ctx.measureText(prefix).width;
    prefix += ch;
    const p = P(lt, i * stagger, dur);
    if (p <= 0) return;
    const e = E.outCubic(p);
    ctx.globalAlpha = base * clamp(p * 1.6);
    ctx.fillStyle = o.colorAt ? o.colorAt(i, lx, w) : (o.color || COL.white);
    ctx.fillText(ch, cx, y + (1 - e) * rise);
  });
  ctx.restore();
  return w;
}

// 섹션 머리말: 짧은 선 + 영문 라벨 + 큰 제목
function header(lt, label, title, o = {}) {
  const x = o.x ?? 160, y = o.y ?? 200, align = o.align || 'left', size = o.size || 60;
  const lp = E.outCubic(P(lt, 0.05, 0.6));
  const lw = measure(label, 22, 700, 6);
  ctx.save();
  if (align === 'center') {
    const half = lw / 2 + 24;
    ctx.strokeStyle = COL.teal; ctx.lineWidth = 2; ctx.globalAlpha *= lp;
    ctx.beginPath();
    ctx.moveTo(x - half, y - 8); ctx.lineTo(x - half - 46 * lp, y - 8);
    ctx.moveTo(x + half, y - 8); ctx.lineTo(x + half + 46 * lp, y - 8);
    ctx.stroke();
  } else {
    ctx.strokeStyle = COL.teal; ctx.lineWidth = 2; ctx.globalAlpha *= lp;
    ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 46 * lp, y - 8); ctx.stroke();
  }
  ctx.restore();
  txt(label, align === 'center' ? x : x + 64, y, { size: 22, weight: 700, spacing: 6, color: COL.teal, align, alpha: P(lt, 0.2, 0.5) });
  maskTxt(title, x, y + size + 30, P(lt, 0.3, 0.9), { size, weight: 700, align, color: COL.white });
}

// ───────────────────────── icons (선 아이콘, 단위 크기 s) ─────────────────────────
function icon(name, cx, cy, s, color = COL.teal, lt = 0) {
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = 0.065; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
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
      for (let k = 0; k < 2; k++) {
        ctx.beginPath(); ctx.arc(-0.08, 0, 0.46 + k * 0.14, -0.55, 0.55); ctx.stroke();
      }
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
    case 'scale':
      rrect(-0.42, -0.42, 0.84, 0.84, 0.16); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -0.05, 0.22, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -0.05); ctx.lineTo(0.1, -0.22); ctx.stroke();
      break;
  }
  ctx.restore();
}

// ───────────────────────── background ─────────────────────────
const rngBG = mulberry32(20240709);
const PARTICLES = Array.from({ length: 90 }, () => ({
  x: rngBG() * W, y: rngBG() * H, r: 0.7 + rngBG() * 2.1, sp: 6 + rngBG() * 20,
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
function orb(x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function drawBackground(t) {
  ctx.fillStyle = lgrad(0, 0, W, H, [[0, '#030A18'], [0.55, '#061631'], [1, '#0A2346']]);
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  orb(W * 0.18 + 140 * Math.sin(t * 0.13), H * 0.24 + 90 * Math.cos(t * 0.11), 760, 'rgba(34,225,195,0.11)');
  orb(W * 0.84 + 150 * Math.cos(t * 0.09), H * 0.72 + 100 * Math.sin(t * 0.12), 880, 'rgba(58,109,255,0.16)');
  orb(W * 0.52 + 220 * Math.sin(t * 0.07 + 1), H * 0.06 + 70 * Math.sin(t * 0.1), 620, 'rgba(56,198,255,0.07)');
  ctx.restore();

  // 은은한 도트 그리드
  const sp = 48, ox = (t * 6) % sp, oy = (t * 3) % sp;
  ctx.fillStyle = 'rgba(150,190,255,0.065)';
  for (let y = -sp + oy; y < H + sp; y += sp)
    for (let x = -sp + ox; x < W + sp; x += sp) ctx.fillRect(x, y, 2, 2);

  // 떠오르는 입자
  for (const p of PARTICLES) {
    const y = ((p.y - t * p.sp) % (H + 40) + H + 40) % (H + 40) - 20;
    const x = p.x + 18 * Math.sin(t * 0.4 + p.ph);
    const a = 0.12 + 0.3 * (0.5 + 0.5 * Math.sin(t * p.tw + p.ph));
    ctx.fillStyle = p.c < 0.5 ? `rgba(34,225,195,${a})` : p.c < 0.85 ? `rgba(56,198,255,${a})` : `rgba(255,255,255,${a})`;
    circle(x, y, p.r); ctx.fill();
  }

  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

// 장면 전환 때 지나가는 사선 빛줄기
function drawSweep(t) {
  for (const sc of SCENES) {
    if (sc.s === 0) continue;
    const p = P(t, sc.s - 0.5, 1.0);
    if (p <= 0 || p >= 1) continue;
    const e = E.inOutSine(p);
    const cx = lerp(-700, W + 700, e);
    const a = Math.sin(p * Math.PI);
    ctx.save();
    ctx.translate(cx, H / 2); ctx.rotate(0.32);
    const g = ctx.createLinearGradient(-260, 0, 260, 0);
    g.addColorStop(0, 'rgba(34,225,195,0)');
    g.addColorStop(0.5, `rgba(56,198,255,${0.16 * a})`);
    g.addColorStop(1, 'rgba(34,225,195,0)');
    ctx.fillStyle = g; ctx.fillRect(-260, -H, 520, H * 2);
    ctx.fillStyle = `rgba(200,245,255,${0.35 * a})`; ctx.fillRect(-1.5, -H, 3, H * 2);
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
function drawRingMotif(cx, cy, R, lt, opts) {
  // opts: draw (0..1 그려진 정도), morph (0 직선 → 1 링), width, pulse
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
  ctx.strokeStyle = lgrad(cx - R * 2, cy - R, cx + R * 2, cy + R, [[0, COL.teal], [0.5, COL.cyan], [1, COL.teal]]);
  ctx.lineWidth = opts.width;
  ctx.shadowColor = 'rgba(56,198,255,0.85)'; ctx.shadowBlur = 26;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  if (draw < 1 && pts.length) {
    const [hx, hy] = pts[pts.length - 1];
    ctx.fillStyle = '#E8FFFB'; circle(hx, hy, 7); ctx.fill();
    orb(hx, hy, 70, 'rgba(56,198,255,0.35)');
  }
  ctx.restore();
}
function drawRingInner(cx, cy, R, lt, a) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  // 링 안의 작은 박동선
  const p = clamp(a);
  ctx.beginPath(); ctx.arc(cx, cy, R - 14, 0, TAU); ctx.clip();
  ctx.strokeStyle = COL.white; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(34,225,195,0.9)'; ctx.shadowBlur = 16;
  const xs = [-0.62, -0.3, -0.18, -0.04, 0.1, 0.2, 0.34, 0.62];
  const ys = [0, 0, -0.1, 0.42, -0.5, 0.14, 0, 0];
  const pt = i => [cx + xs[i] * R, cy + ys[i] * R * 0.8];
  const f = E.inOutCubic(p) * (xs.length - 1);
  ctx.beginPath(); ctx.moveTo(...pt(0));
  for (let i = 1; i < xs.length; i++) {
    const [ax, ay] = pt(i - 1), [bx, by] = pt(i), k = clamp(f - (i - 1));
    if (k <= 0) break;
    ctx.lineTo(lerp(ax, bx, k), lerp(ay, by, k));
  }
  ctx.stroke();
  ctx.restore();
  // 퍼져나가는 맥동
  for (let k = 0; k < 2; k++) {
    const ph = ((lt * 0.55 + k * 0.5) % 1);
    ctx.save();
    ctx.globalAlpha *= a * (1 - ph) * 0.5;
    ctx.strokeStyle = COL.teal; ctx.lineWidth = 2;
    circle(cx, cy, R + 10 + ph * 80); ctx.stroke();
    ctx.restore();
  }
}
function wordmark(cx, y, lt, size, o = {}) {
  const grad = (lx, w) => lgrad(lx + w * 0.3, 0, lx + w, 0, [[0, COL.teal], [1, COL.cyan]]);
  charsTxt('HLB LifeCare', cx, y, lt, {
    size, weight: 800, align: 'center', stagger: 0.05, dur: 0.7, spacing: -1,
    colorAt: (i, lx, w) => (i < 3 ? COL.white : grad(lx, w)),
    glow: 'rgba(56,198,255,0.35)', glowBlur: 30, alpha: o.alpha,
  });
}

// ───────────────────────── 1. intro ─────────────────────────
function sceneIntro(lt) {
  const cx = W / 2, cy = 360, R = 104;
  const draw = E.inOutCubic(P(lt, 0.25, 1.9));
  const morph = P(lt, 2.0, 1.25);
  drawRingMotif(cx, cy, R, lt, { draw, morph, lineY: H / 2, width: lerp(4, 9, E.outCubic(P(lt, 2.6, 0.8))) });
  drawRingInner(cx, cy, R, lt, P(lt, 3.0, 0.8));

  wordmark(cx, 615, lt - 3.0, 136);
  txt('HLB라이프케어', cx, 690, { size: 34, weight: 500, spacing: 5, color: COL.muted, align: 'center', alpha: E.outCubic(P(lt, 3.9, 0.8)) });

  const tp = P(lt, 4.6, 0.9);
  const tag = '만성질환의 예방부터 진단, 관리까지';
  const tw = measure(tag, 44, 600);
  maskTxt(tag, cx, 812, tp, { size: 44, weight: 600, align: 'center' });
  const lp = E.outCubic(P(lt, 4.8, 0.9));
  ctx.save();
  ctx.strokeStyle = 'rgba(34,225,195,0.7)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - tw / 2 - 36, 797); ctx.lineTo(cx - tw / 2 - 36 - 120 * lp, 797);
  ctx.moveTo(cx + tw / 2 + 36, 797); ctx.lineTo(cx + tw / 2 + 36 + 120 * lp, 797);
  ctx.stroke();
  ctx.restore();
}

// ───────────────────────── 2. story / timeline ─────────────────────────
const STORY = [
  { year: '2021', title: '바라바이오 설립', d: ['강남세브란스병원 안철우 교수 창업', '당뇨·만성대사질환 진단 플랫폼'] },
  { year: '2024', title: 'HLB그룹 편입', d: ['HLB글로벌, 지분 68% 확보', '최대주주로 그룹 합류'] },
  { year: '2025', title: 'HLB라이프케어 출범', d: ['사명 변경', '만성질환 통합 헬스케어 집중'] },
  { year: '2026', title: '피코링 허가·출시', d: ['식약처 3등급 의료기기 허가', '연속혈당측정기 시장 진출'] },
];
function sceneStory(lt) {
  header(lt, 'OUR STORY', '임상 현장의 경험에서 시작된 헬스케어 혁신');
  const y = 640, x0 = 160, x1 = 1760;
  const xs = [370, 770, 1170, 1570];
  const lp = E.inOutCubic(P(lt, 0.6, 1.1));
  ctx.save();
  ctx.strokeStyle = COL.line; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(lerp(x0, x1, lp), y); ctx.stroke();
  // 진행 채움
  const tNode = i => 1.3 + i * 1.6;
  let fill = x0;
  xs.forEach((x, i) => { fill = lerp(fill, x, E.inOutCubic(P(lt, tNode(i) - 0.55, 0.55))); });
  fill = lerp(fill, x1, E.inOutCubic(P(lt, tNode(3) + 0.6, 1.4)));
  ctx.strokeStyle = brand(x0, x1); ctx.lineWidth = 4;
  ctx.shadowColor = 'rgba(34,225,195,0.8)'; ctx.shadowBlur = 14;
  if (lt > tNode(0) - 0.55) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(fill, y); ctx.stroke(); }
  ctx.restore();

  STORY.forEach((it, i) => {
    const t0 = tNode(i), x = xs[i];
    const pop = P(lt, t0, 0.55);
    if (pop <= 0) return;
    const s = E.outBack(pop);
    const active = clamp(1 - P(lt, tNode(i + 1), 0.6)) * (i < 3 ? 1 : 1);
    ctx.save();
    orb(x, y, 60 + 30 * active, `rgba(34,225,195,${0.25 + 0.2 * active})`);
    ctx.fillStyle = '#071A33'; circle(x, y, 17 * s); ctx.fill();
    ctx.strokeStyle = COL.teal; ctx.lineWidth = 3; circle(x, y, 17 * s); ctx.stroke();
    ctx.fillStyle = COL.teal; circle(x, y, 7 * s); ctx.fill();
    ctx.restore();
    maskTxt(it.year, x, y - 52, P(lt, t0 + 0.05, 0.8), {
      size: 78, weight: 800, align: 'center', color: (lx, w) => lgrad(lx, 0, lx + w, 0, [[0, COL.teal], [1, COL.cyan]]),
    });
    const tp = E.outCubic(P(lt, t0 + 0.2, 0.7));
    ctx.save();
    ctx.globalAlpha *= tp; ctx.translate(0, (1 - tp) * 24);
    txt(it.title, x, y + 86, { size: 36, weight: 700, align: 'center' });
    it.d.forEach((line, k) => txt(line, x, y + 138 + k * 38, { size: 25, weight: 400, align: 'center', color: COL.muted }));
    ctx.restore();
  });
}

// ───────────────────────── 3. vision ─────────────────────────
const VISION = [
  { ko: '예방', en: 'PREVENTION', icon: 'shield' },
  { ko: '진단', en: 'DIAGNOSIS', icon: 'drop' },
  { ko: '관리', en: 'MANAGEMENT', icon: 'chart' },
];
function sceneVision(lt) {
  header(lt, 'VISION', '만성질환의 모든 순간을 잇는 통합 헬스케어', { x: W / 2, y: 170, align: 'center', size: 58 });
  const xs = [560, 960, 1360], cy = 560, R = 140;

  // 순환 루프 (관리 → 예방)
  const loopP = E.inOutCubic(P(lt, 2.6, 1.3));
  if (loopP > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(34,225,195,0.55)'; ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 12]); ctx.lineDashOffset = -lt * 40;
    ctx.beginPath();
    const steps = 80;
    for (let i = 0; i <= steps * loopP; i++) {
      const u = i / steps, a = lerp(0.12, Math.PI - 0.12, u);
      const x = 960 + Math.cos(a) * 400, y = cy + 90 + Math.sin(a) * 150;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    // 루프 위를 흐르는 빛
    for (let k = 0; k < 3; k++) {
      const u = ((lt * 0.22 + k / 3) % 1) * loopP;
      const a = lerp(0.12, Math.PI - 0.12, u);
      const x = 960 + Math.cos(a) * 400, y = cy + 90 + Math.sin(a) * 150;
      ctx.fillStyle = COL.cyan; circle(x, y, 4.5); ctx.fill();
      orb(x, y, 26, 'rgba(56,198,255,0.4)');
    }
    txt('끊김 없는 데이터 순환', 960, cy + 268, { size: 22, weight: 500, spacing: 2, align: 'center', color: COL.teal, alpha: P(lt, 3.5, 0.6) });
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
    orb(0, 0, R * 1.6, `rgba(34,225,195,${0.08 + 0.06 * glow})`);
    const fg = ctx.createRadialGradient(-R * 0.3, -R * 0.4, 10, 0, 0, R);
    fg.addColorStop(0, 'rgba(40,90,150,0.55)'); fg.addColorStop(1, 'rgba(8,24,50,0.9)');
    ctx.fillStyle = fg; circle(0, 0, R); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = brand(-R, R, -R, R); circle(0, 0, R); ctx.stroke();
    // 회전하는 호
    ctx.strokeStyle = 'rgba(56,198,255,0.75)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, R + 12, lt * 0.8 + i, lt * 0.8 + i + 0.9); ctx.stroke();
    icon(v.icon, 0, -40, 74, COL.teal, lt);
    txt(v.ko, 0, 50, { size: 46, weight: 700, align: 'center' });
    txt(v.en, 0, 86, { size: 17, weight: 600, spacing: 5, align: 'center', color: COL.muted });
    ctx.restore();
  });

  // 연결 화살표
  for (let i = 0; i < 2; i++) {
    const a = E.outCubic(P(lt, 1.6 + i * 0.4, 0.6));
    if (a <= 0) continue;
    const xa = xs[i] + R + 22, xb = xs[i + 1] - R - 22;
    ctx.save(); ctx.globalAlpha *= a;
    for (let k = 0; k < 3; k++) {
      const ph = (lt * 1.4 + k / 3) % 1;
      const x = lerp(xa, xb, ph);
      ctx.globalAlpha = a * Math.sin(ph * Math.PI);
      ctx.strokeStyle = COL.cyan; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 7, cy - 11); ctx.lineTo(x + 5, cy); ctx.lineTo(x - 7, cy + 11); ctx.stroke();
    }
    ctx.restore();
  }

  // 하단 키워드
  const pills = ['의료 빅데이터', 'AI 플랫폼', '스마트 디바이스'];
  const pw = pills.map(s => measure(s, 26, 600) + 64);
  const gap = 70, total = pw.reduce((a, b) => a + b, 0) + gap * 2;
  let x = W / 2 - total / 2;
  pills.forEach((s, i) => {
    const p = E.outCubic(P(lt, 4.2 + i * 0.3, 0.6));
    ctx.save(); ctx.globalAlpha *= p; ctx.translate(0, (1 - p) * 20);
    rrect(x, 908, pw[i], 58, 29);
    ctx.fillStyle = 'rgba(34,225,195,0.08)'; ctx.fill();
    ctx.strokeStyle = 'rgba(34,225,195,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    txt(s, x + pw[i] / 2, 946, { size: 26, weight: 600, align: 'center' });
    if (i < 2) txt('×', x + pw[i] + gap / 2, 946, { size: 30, weight: 300, align: 'center', color: COL.teal });
    ctx.restore();
    x += pw[i] + gap;
  });
}

// ───────────────────────── 4. product: 피코링 ─────────────────────────
function drawSensor(cx, cy, r, lt, a = 1) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  // 맥동 링
  for (let k = 0; k < 3; k++) {
    const ph = (lt * 0.5 + k / 3) % 1;
    ctx.save(); ctx.globalAlpha *= (1 - ph) * 0.45;
    ctx.strokeStyle = COL.teal; ctx.lineWidth = 2;
    circle(cx, cy, r * 1.25 + ph * r * 1.3); ctx.stroke();
    ctx.restore();
  }
  // 그림자
  const sh = ctx.createRadialGradient(cx, cy + r * 0.22, r * 0.4, cx, cy + r * 0.22, r * 1.45);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh; circle(cx, cy + r * 0.22, r * 1.45); ctx.fill();
  // 부착 패치
  ctx.fillStyle = 'rgba(220,235,255,0.10)'; circle(cx, cy, r * 1.17); ctx.fill();
  ctx.strokeStyle = 'rgba(220,235,255,0.25)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 7]);
  circle(cx, cy, r * 1.17); ctx.stroke(); ctx.setLineDash([]);
  // 본체
  const body = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
  body.addColorStop(0, '#FFFFFF'); body.addColorStop(0.55, '#E3EAF3'); body.addColorStop(1, '#AEBCD0');
  ctx.fillStyle = body; circle(cx, cy, r); ctx.fill();
  // 회전 광택
  const sheen = ctx.createConicGradient(lt * 0.7, cx, cy);
  sheen.addColorStop(0, 'rgba(255,255,255,0)'); sheen.addColorStop(0.08, 'rgba(255,255,255,0.45)');
  sheen.addColorStop(0.18, 'rgba(255,255,255,0)'); sheen.addColorStop(0.55, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.62, 'rgba(255,255,255,0.25)'); sheen.addColorStop(0.72, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen; circle(cx, cy, r); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = Math.max(1, r * 0.012); circle(cx, cy, r * 0.93); ctx.stroke();
  ctx.strokeStyle = 'rgba(110,130,165,0.35)'; ctx.lineWidth = Math.max(1, r * 0.018); circle(cx, cy, r * 0.62); ctx.stroke();
  // 중앙 창 + LED
  const led = 0.6 + 0.4 * Math.sin(lt * 3);
  const cg = ctx.createRadialGradient(cx - r * 0.05, cy - r * 0.06, 1, cx, cy, r * 0.24);
  cg.addColorStop(0, '#E9FFFB'); cg.addColorStop(0.4, COL.teal); cg.addColorStop(1, '#0F7F86');
  ctx.fillStyle = cg; circle(cx, cy, r * 0.22); ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  orb(cx, cy, r * 0.6, `rgba(34,225,195,${0.25 * led})`);
  ctx.restore();
  ctx.restore();
}

function drawPhone(cx, cy, w, h, lt, a) {
  if (a <= 0) return;
  const x = cx - w / 2, y = cy - h / 2;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
  rrect(x, y, w, h, 54); ctx.fillStyle = '#0C1A33'; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 3; ctx.strokeStyle = lgrad(x, y, x + w, y + h, [[0, 'rgba(150,200,255,0.55)'], [1, 'rgba(60,90,140,0.4)']]); ctx.stroke();
  rrect(x + 14, y + 14, w - 28, h - 28, 42); ctx.fillStyle = '#06101F'; ctx.fill();
  rrect(cx - 50, y + 30, 100, 26, 13); ctx.fillStyle = '#000'; ctx.fill();

  const L = x + 42, Rr = x + w - 42;
  txt('피코링', L, y + 116, { size: 26, weight: 700 });
  icon('bt', Rr - 12, y + 106, 30, COL.cyan);
  txt('현재 혈당', L, y + 176, { size: 20, weight: 500, color: COL.muted });
  const val = Math.round(112 + 5 * Math.sin(lt * 0.9) + 2 * Math.sin(lt * 2.3));
  const vw = txt(String(val), L, y + 270, { size: 96, weight: 800, color: (lx, ww) => lgrad(lx, 0, lx + ww, 0, [[0, COL.teal], [1, COL.cyan]]) });
  txt('mg/dL', L + vw + 14, y + 268, { size: 24, weight: 600, color: COL.muted });
  // 추세 화살표
  ctx.save(); ctx.strokeStyle = COL.teal; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const ax = Rr - 20, ay = y + 236;
  ctx.beginPath(); ctx.moveTo(ax - 22, ay); ctx.lineTo(ax + 14, ay); ctx.moveTo(ax + 2, ay - 12); ctx.lineTo(ax + 14, ay); ctx.lineTo(ax + 2, ay + 12); ctx.stroke();
  ctx.restore();

  // 그래프
  const gx = L, gw = Rr - L, gy = y + 330, gh = 230;
  const vy = v => gy + gh - (v - 40) / 180 * gh;
  ctx.fillStyle = 'rgba(34,225,195,0.08)'; ctx.fillRect(gx, vy(180), gw, vy(70) - vy(180));
  ctx.save(); ctx.strokeStyle = 'rgba(34,225,195,0.35)'; ctx.setLineDash([5, 6]); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(gx, vy(180)); ctx.lineTo(gx + gw, vy(180)); ctx.moveTo(gx, vy(70)); ctx.lineTo(gx + gw, vy(70)); ctx.stroke();
  ctx.restore();
  txt('180', gx + gw, vy(180) - 8, { size: 15, weight: 500, align: 'right', color: COL.dim });
  txt('70', gx + gw, vy(70) + 20, { size: 15, weight: 500, align: 'right', color: COL.dim });
  const gp = clamp((lt - 0.4) / 4.2);
  const curve = u => 112 + 24 * Math.sin(TAU * u * 1.3 + 0.5) + 32 * Math.exp(-Math.pow((u - 0.36) / 0.06, 2))
    + 24 * Math.exp(-Math.pow((u - 0.74) / 0.07, 2)) - 8 * Math.sin(TAU * u * 4);
  ctx.save();
  ctx.beginPath();
  const n = 120, upto = Math.floor(n * gp);
  for (let i = 0; i <= upto; i++) {
    const u = i / n, px = gx + u * gw, py = vy(curve(u));
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.strokeStyle = brand(gx, gx + gw); ctx.lineWidth = 4; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(34,225,195,0.8)'; ctx.shadowBlur = 12;
  ctx.stroke();
  if (upto > 0) {
    const u = upto / n, hx = gx + u * gw, hy = vy(curve(u));
    ctx.fillStyle = '#FFFFFF'; circle(hx, hy, 6); ctx.fill();
    orb(hx, hy, 30, 'rgba(56,198,255,0.5)');
  }
  ctx.restore();
  ['00', '06', '12', '18', '24'].forEach((s, i) => txt(s, gx + gw * i / 4, gy + gh + 30, { size: 15, weight: 500, align: 'center', color: COL.dim }));

  rrect(L, y + h - 132, gw, 70, 20); ctx.fillStyle = 'rgba(56,198,255,0.08)'; ctx.fill();
  icon('bt', L + 36, y + h - 97, 28, COL.cyan);
  txt('1분마다 자동 전송', L + 66, y + h - 89, { size: 22, weight: 600 });
  const dot = 0.5 + 0.5 * Math.sin(lt * 5);
  ctx.fillStyle = `rgba(34,225,195,${0.4 + 0.6 * dot})`; circle(Rr - 24, y + h - 97, 6); ctx.fill();
  ctx.restore();
}

const SPECS = [
  { label: 'WEIGHT', num: 2.16, dec: 2, unit: 'g', desc: ['각설탕 1개보다 가벼운', '초경량 센서'] },
  { label: 'WEAR TIME', pre: '최대 ', num: 15, dec: 0, unit: '일', desc: ['한 번 부착으로', '채혈 없이 연속 측정'] },
  { label: 'REAL-TIME', num: 1, dec: 0, unit: '분', fixed: true, desc: ['블루투스로 앱에', '혈당 자동 전송'] },
  { label: 'ACCURACY · MARD', num: 8.66, dec: 2, unit: '%', desc: ['높은 측정 정확도', '(낮을수록 정확)'] },
];
function sceneProduct(lt) {
  const k = E.inOutCubic(P(lt, 5.8, 1.0));        // A → B 전환
  // 센서 위치/크기
  const ap = P(lt, 0.15, 1.1);
  const sA = lerp(0.5, 1, E.outBack(ap));
  const sx = lerp(600, 310, k), sy = lerp(560, 560, k), sr = lerp(205, 108, k) * sA;
  drawSensor(sx, sy, sr, lt, clamp(ap * 2));

  // ── A: 제품 소개
  const aA = 1 - k;
  if (aA > 0) {
    ctx.save();
    ctx.globalAlpha *= aA; ctx.translate(-60 * k, 0);
    const X = 1040;
    txt('PRODUCT', X + 64, 300, { size: 22, weight: 700, spacing: 6, color: COL.teal, alpha: P(lt, 0.4, 0.5) });
    ctx.save(); ctx.strokeStyle = COL.teal; ctx.lineWidth = 2; ctx.globalAlpha *= E.outCubic(P(lt, 0.3, 0.6));
    ctx.beginPath(); ctx.moveTo(X, 292); ctx.lineTo(X + 46, 292); ctx.stroke(); ctx.restore();
    maskTxt('피코링', X, 450, P(lt, 0.6, 0.9), { size: 150, weight: 800, color: COL.white, glow: 'rgba(56,198,255,0.3)', glowBlur: 30 });
    maskTxt('초소형 스마트 연속혈당측정기', X, 540, P(lt, 1.0, 0.8), { size: 46, weight: 600, color: (lx, w) => lgrad(lx, 0, lx + w, 0, [[0, COL.teal], [1, COL.cyan]]) });
    txt('CGM · CONTINUOUS GLUCOSE MONITORING', X, 590, { size: 20, weight: 600, spacing: 3, color: COL.muted, alpha: P(lt, 1.4, 0.6) });
    // 허가 배지
    const bp = P(lt, 1.9, 0.6);
    if (bp > 0) {
      const bw = measure('식약처 3등급 의료기기 허가', 28, 700) + 110;
      ctx.save();
      const bs = E.outBack(bp);
      ctx.translate(X + bw / 2, 670); ctx.scale(bs, bs); ctx.translate(-(X + bw / 2), -670);
      ctx.globalAlpha *= clamp(bp * 2);
      rrect(X, 636, bw, 68, 34);
      ctx.fillStyle = 'rgba(34,225,195,0.14)'; ctx.fill();
      ctx.strokeStyle = COL.teal; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = COL.teal; circle(X + 40, 670, 20); ctx.fill();
      icon('check', X + 40, 670, 30, '#04121F');
      txt('식약처 3등급 의료기기 허가', X + 76, 680, { size: 28, weight: 700 });
      ctx.restore();
    }
    const dp = E.outCubic(P(lt, 2.4, 0.7));
    ctx.save(); ctx.globalAlpha *= dp; ctx.translate(0, (1 - dp) * 20);
    txt('채혈 없이, 24시간 실시간 혈당 측정', X, 790, { size: 32, weight: 500, color: COL.white });
    txt('100원 동전보다 작은 크기 · 1회 부착 최대 15일 사용', X, 838, { size: 24, weight: 400, color: COL.muted });
    ctx.restore();

    // 치수 표기
    const dm = E.outCubic(P(lt, 2.8, 0.8));
    if (dm > 0) {
      const yy = sy + sr * 1.17 + 70;
      const half = sr * dm;
      ctx.save();
      ctx.strokeStyle = 'rgba(200,225,255,0.6)'; ctx.lineWidth = 1.5;
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
    ctx.restore();
  }

  // ── B: 앱 연동 + 핵심 스펙
  const bA = E.outCubic(P(lt, 6.3, 0.9));
  if (bA > 0) {
    // 블루투스 데이터 흐름
    const fx0 = sx + sr + 30, fx1 = 520;
    ctx.save(); ctx.globalAlpha *= bA;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(56,198,255,${0.25 + 0.2 * Math.sin(lt * 3 - i)})`; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(sx, sy, sr + 40 + i * 26, -0.42, 0.42); ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const ph = (lt * 0.9 + i / 4) % 1;
      const px = lerp(fx0, fx1, ph);
      ctx.globalAlpha = bA * Math.sin(ph * Math.PI);
      ctx.fillStyle = COL.teal; circle(px, sy, 5); ctx.fill();
      orb(px, sy, 22, 'rgba(34,225,195,0.5)');
    }
    ctx.restore();

    ctx.save(); ctx.translate(0, (1 - bA) * 80);
    drawPhone(700, 560, 370, 740, lt - 6.3, bA);
    ctx.restore();

    const X = 1010;
    const hp = lt - 6.6;
    txt('KEY SPECS', X + 64, 232, { size: 22, weight: 700, spacing: 6, color: COL.teal, alpha: P(hp, 0, 0.5) });
    ctx.save(); ctx.strokeStyle = COL.teal; ctx.lineWidth = 2; ctx.globalAlpha *= E.outCubic(P(hp, 0, 0.5));
    ctx.beginPath(); ctx.moveTo(X, 224); ctx.lineTo(X + 46, 224); ctx.stroke(); ctx.restore();
    maskTxt('작지만, 정밀하게', X, 306, P(hp, 0.1, 0.8), { size: 56, weight: 700 });

    const cw = 370, ch = 236, gap = 26;
    SPECS.forEach((sp, i) => {
      const cxp = X + (i % 2) * (cw + gap), cyp = 360 + Math.floor(i / 2) * (ch + gap);
      const t0 = 7.0 + i * 0.3;
      const p = E.outCubic(P(lt, t0, 0.7));
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha *= p; ctx.translate(0, (1 - p) * 40);
      rrect(cxp, cyp, cw, ch, 24);
      ctx.fillStyle = lgrad(cxp, cyp, cxp + cw, cyp + ch, [[0, 'rgba(255,255,255,0.075)'], [1, 'rgba(255,255,255,0.02)']]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,200,255,0.18)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = brand(cxp, cxp + cw); ctx.fillRect(cxp + 30, cyp, 60 * p, 3);
      txt(sp.label, cxp + 30, cyp + 50, { size: 17, weight: 700, spacing: 3, color: COL.teal });
      const cnt = sp.fixed ? sp.num : sp.num * E.outCubic(P(lt, t0 + 0.1, 1.3));
      let nx = cxp + 30;
      if (sp.pre) nx += txt(sp.pre, nx, cyp + 128, { size: 30, weight: 600, color: COL.white }) + 4;
      const nw = txt(cnt.toFixed(sp.dec), nx, cyp + 128, { size: 72, weight: 800, color: (lx, w) => lgrad(lx, 0, lx + w + 40, 0, [[0, '#FFFFFF'], [1, '#BFEFFF']]) });
      txt(sp.unit, nx + nw + 8, cyp + 128, { size: 32, weight: 700, color: COL.teal });
      sp.desc.forEach((d, j) => txt(d, cxp + 30, cyp + 172 + j * 32, { size: 22, weight: 400, color: COL.muted }));
      ctx.restore();
    });
    txt('※ 제품 정보: 회사 발표 및 언론 보도 기준', X, 912, { size: 18, weight: 400, color: COL.dim, alpha: P(lt, 8.4, 0.6) });
  }
}

// ───────────────────────── 5. core projects ─────────────────────────
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
  const na = P(lt, 0, 1.2) * 0.9;
  if (na > 0) {
    const pos = NET.map(p => [p.x + 14 * Math.sin(lt * 0.35 + p.ph), p.y + 12 * Math.cos(lt * 0.3 + p.ph)]);
    ctx.save();
    ctx.lineWidth = 1;
    for (const [i, j] of NET_EDGES) {
      const [ax, ay] = pos[i], [bx, by] = pos[j];
      const d = Math.hypot(ax - bx, ay - by);
      ctx.strokeStyle = `rgba(56,198,255,${na * 0.11 * (1 - d / 300)})`;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    pos.forEach(([x, y], i) => {
      ctx.fillStyle = `rgba(34,225,195,${na * (0.2 + 0.2 * Math.sin(lt * 2 + i))})`;
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
    const hl = Math.sin(clamp((lt - (3.4 + i * 1.3)) / 1.6) * Math.PI);  // 순차 하이라이트
    ctx.save();
    ctx.globalAlpha *= p; ctx.translate(0, (1 - p) * 60 - hl * 12);
    if (hl > 0) orb(x + cw / 2, y0 + ch / 2, cw * 0.8, `rgba(34,225,195,${0.12 * hl})`);
    rrect(x, y0, cw, ch, 28);
    ctx.fillStyle = lgrad(x, y0, x + cw, y0 + ch, [[0, 'rgba(255,255,255,0.075)'], [1, 'rgba(255,255,255,0.02)']]);
    ctx.fill();
    ctx.strokeStyle = `rgba(150,200,255,${0.18 + 0.4 * hl})`; ctx.lineWidth = 1.5 + hl; ctx.stroke();
    ctx.fillStyle = brand(x, x + cw); ctx.fillRect(x + 44, y0, (cw - 88) * E.outCubic(P(lt, t0 + 0.3, 0.9)), 3);
    txt(pr.n, x + 44, y0 + 78, { size: 30, weight: 800, spacing: 2, color: COL.teal });
    // 아이콘 배경
    ctx.fillStyle = 'rgba(34,225,195,0.1)'; circle(x + cw - 100, y0 + 100, 56); ctx.fill();
    icon(pr.icon, x + cw - 100, y0 + 100, 66, COL.teal, lt);
    pr.t.forEach((s, j) => txt(s, x + 44, y0 + 250 + j * 54, { size: 40, weight: 700 }));
    ctx.fillStyle = 'rgba(150,200,255,0.2)'; ctx.fillRect(x + 44, y0 + 340, cw - 88, 1);
    pr.d.forEach((s, j) => txt(s, x + 44, y0 + 392 + j * 36, { size: 24, weight: 400, color: COL.muted }));
    ctx.restore();
  });

  const bp = E.outCubic(P(lt, 2.4, 0.8));
  ctx.save(); ctx.globalAlpha *= bp; ctx.translate(0, (1 - bp) * 16);
  const parts = [['혈당 데이터', COL.white], ['  →  ', COL.teal], ['맞춤 식단 · 건강기능식품 · 체중 관리 프로그램으로 확장', COL.muted]];
  const total = parts.reduce((a, [s]) => a + measure(s, 26, 600), 0);
  let x = W / 2 - total / 2;
  parts.forEach(([s, c]) => { x += txt(s, x, 935, { size: 26, weight: 600, color: c }); });
  ctx.restore();
}

// ───────────────────────── 6. partners ─────────────────────────
const PARTNERS = [
  { name: '인바디헬스케어', d: '피코링 판매 · 체성분 연계 건강관리', x: 400, y: 470 },
  { name: '연세대 미래캠퍼스', d: 'AI 디지털 헬스케어 공동연구 MOU', x: 1520, y: 470 },
  { name: '이노피아테크', d: '비접촉·비대면 진료 분야 확장', x: 400, y: 740 },
  { name: '솔닥', d: '만성질환 디지털 의료솔루션 구축', x: 1520, y: 740 },
];
function scenePartners(lt) {
  header(lt, 'PARTNERSHIP', '함께 확장하는 디지털 헬스케어 생태계', { x: W / 2, y: 160, align: 'center', size: 58 });
  const hx = W / 2, hy = 605, hr = 112;
  const cw = 500, ch = 124;

  // 연결선
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
    ctx.strokeStyle = 'rgba(56,198,255,0.4)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k <= 40 * lp; k++) { const [x, y] = bez(k / 40); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    if (lp >= 1) {
      for (let k = 0; k < 2; k++) {
        const u = (lt * 0.5 + k * 0.5 + i * 0.13) % 1;
        const [x, y] = bez(u);
        ctx.fillStyle = COL.teal; circle(x, y, 4.5); ctx.fill();
        orb(x, y, 24, 'rgba(34,225,195,0.45)');
      }
    }
    ctx.restore();
  });

  // 허브
  const hp = P(lt, 0.6, 0.8);
  if (hp > 0) {
    const s = E.outBack(hp);
    ctx.save();
    ctx.globalAlpha *= clamp(hp * 2);
    ctx.translate(hx, hy); ctx.scale(s, s);
    orb(0, 0, hr * 2.4, 'rgba(34,225,195,0.18)');
    ctx.strokeStyle = 'rgba(56,198,255,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([6, 10]); ctx.lineDashOffset = -lt * 30;
    circle(0, 0, hr + 34); ctx.stroke(); ctx.setLineDash([]);
    const g = ctx.createLinearGradient(-hr, -hr, hr, hr);
    g.addColorStop(0, '#1BC9B0'); g.addColorStop(1, '#2A6CF0');
    ctx.fillStyle = g; ctx.shadowColor = 'rgba(34,225,195,0.6)'; ctx.shadowBlur = 40;
    circle(0, 0, hr); ctx.fill(); ctx.shadowColor = 'transparent';
    txt('HLB', 0, -2, { size: 48, weight: 800, align: 'center' });
    txt('LifeCare', 0, 38, { size: 30, weight: 600, align: 'center', color: 'rgba(255,255,255,0.92)' });
    ctx.restore();
  }

  PARTNERS.forEach((pt, i) => {
    const p = E.outCubic(P(lt, 1.0 + i * 0.22, 0.7));
    if (p <= 0) return;
    const left = pt.x < hx;
    const x = pt.x - cw / 2, y = pt.y - ch / 2;
    ctx.save();
    ctx.globalAlpha *= p; ctx.translate((left ? -1 : 1) * (1 - p) * 50, 0);
    rrect(x, y, cw, ch, 22);
    ctx.fillStyle = 'rgba(10,30,60,0.75)'; ctx.fill();
    ctx.strokeStyle = 'rgba(150,200,255,0.22)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = brand(x, x, y, y + ch); ctx.fillRect(x, y + 26, 4, ch - 52);
    txt(pt.name, x + 36, y + 56, { size: 32, weight: 700 });
    txt(pt.d, x + 36, y + 96, { size: 22, weight: 400, color: COL.muted });
    ctx.restore();
  });

  const bp = E.outCubic(P(lt, 2.4, 0.8));
  ctx.save(); ctx.globalAlpha *= bp;
  const parts = [['B2C', COL.teal], [' 헬스케어 커머스   ', COL.white], ['·', COL.dim], ['   B2B', COL.teal], [' 보험사 · 건강검진센터 협업', COL.white]];
  const total = parts.reduce((a, [s]) => a + measure(s, 26, 600), 0);
  let x = W / 2 - total / 2;
  parts.forEach(([s, c]) => { x += txt(s, x, 955, { size: 26, weight: 600, color: c }); });
  ctx.restore();
}

// ───────────────────────── 7. outro ─────────────────────────
function sceneOutro(lt) {
  const cx = W / 2, cy = 330, R = 96;
  const rp = E.inOutCubic(P(lt, 0.15, 1.1));
  if (rp > 0) {
    ctx.save();
    ctx.strokeStyle = lgrad(cx - R * 2, cy - R, cx + R * 2, cy + R, [[0, COL.teal], [0.5, COL.cyan], [1, COL.teal]]);
    ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(56,198,255,0.85)'; ctx.shadowBlur = 26;
    ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * rp); ctx.stroke();
    ctx.restore();
  }
  drawRingInner(cx, cy, R, lt, P(lt, 0.7, 0.8));
  wordmark(cx, 575, lt - 0.7, 128);
  maskTxt('데이터로 지키는 건강한 일상', cx, 720, P(lt, 1.7, 0.9), { size: 56, weight: 700, align: 'center' });
  txt('만성질환 예방 · 진단 · 관리 통합 헬스케어 솔루션', cx, 785, { size: 28, weight: 500, align: 'center', color: COL.muted, alpha: E.outCubic(P(lt, 2.2, 0.8)) });

  const up = E.outCubic(P(lt, 2.7, 0.7));
  if (up > 0) {
    const label = 'barabio.co.kr';
    const w = measure(label, 28, 600, 1) + 100;
    ctx.save(); ctx.globalAlpha *= up; ctx.translate(0, (1 - up) * 20);
    rrect(cx - w / 2, 860, w, 64, 32);
    ctx.fillStyle = 'rgba(34,225,195,0.1)'; ctx.fill();
    ctx.strokeStyle = 'rgba(34,225,195,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    icon('globe', cx - w / 2 + 40, 892, 30, COL.teal);
    txt(label, cx - w / 2 + 66, 902, { size: 28, weight: 600, spacing: 1 });
    ctx.restore();
  }
}

// ───────────────────────── frame composer ─────────────────────────
function renderFrame(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  drawBackground(t);

  for (const sc of SCENES) {
    if (t < sc.s || t >= sc.e) continue;
    const lt = t - sc.s, dur = sc.e - sc.s;
    const isLast = sc === SCENES[SCENES.length - 1];
    const out = isLast ? 0 : E.inCubic(P(lt, dur - 0.55, 0.55));
    const zoom = 1 + 0.018 * (lt / dur);
    ctx.save();
    ctx.globalAlpha = 1 - out;
    ctx.translate(W / 2, H / 2); ctx.scale(zoom + out * 0.04, zoom + out * 0.04); ctx.translate(-W / 2, -H / 2 - out * 20);
    sc.draw(lt, dur);
    ctx.restore();
  }
  drawSweep(t);

  // 밴딩 방지용 미세 노이즈
  if (noisePattern) {
    ctx.save(); ctx.globalAlpha = 0.022; ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = noisePattern; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  // 시작/끝 페이드
  const fade = Math.max(1 - P(t, 0, 0.5), P(t, DURATION - 1.0, 1.0));
  if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
}

// ───────────────────────── boot ─────────────────────────
async function boot() {
  const weights = [300, 400, 500, 600, 700, 800];
  await Promise.all(weights.map(w => document.fonts.load(`${w} 40px Pretendard`, '가A1')));
  await document.fonts.ready;
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
