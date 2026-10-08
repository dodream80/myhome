// src/index.html을 헤드리스 Chromium에서 열고 renderFrame(t)를 프레임마다 호출해 캡처한 뒤
// ffmpeg로 H.264 MP4를 만든다. 생성형 AI 없이 코드로만 그린다.
//
//   node scripts/render.mjs                       # 전체 렌더 → build/video.mp4
//   node scripts/render.mjs --fps 30 --workers 4
//   node scripts/render.mjs --stills 3,12,30      # 지정한 시각의 PNG만 build/stills/에 저장
//   node scripts/render.mjs --serve               # 브라우저 미리보기 서버만 실행
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const FONTS = path.join(ROOT, 'node_modules/pretendard/dist/web/static/woff2');
const BUILD = path.join(ROOT, 'build');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, []),
);
const FPS = Number(args.fps || 30);
const WORKERS = Number(args.workers || 4);
const OUT = path.resolve(args.out || path.join(BUILD, 'video.mp4'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.png': 'image/png' };
function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file;
    if (url.startsWith('/fonts/')) file = path.join(FONTS, path.basename(url));
    else if (url === '/music.wav') file = path.join(BUILD, 'music.wav');
    else file = path.join(SRC, url === '/' ? 'index.html' : path.normalize(url));
    if (!file.startsWith(SRC) && !file.startsWith(FONTS) && !file.startsWith(BUILD)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }).end(data);
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('[page error]', e.message));
  await page.goto(`http://127.0.0.1:${port}/?render`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  return page;
}

const capture = page => page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });

function ffmpegSegment(file) {
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-x264-params', `keyint=${FPS * 2}:min-keyint=${FPS}`,
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg exit ${c}`)))));
  return { ff, done };
}

async function renderRange(port, from, to, file, progress) {
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--disable-gpu-vsync'] });
  const page = await openPage(browser, port);
  const { ff, done } = ffmpegSegment(file);
  for (let f = from; f < to; f++) {
    await page.evaluate(t => window.renderFrame(t), f / FPS);
    const buf = await capture(page);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    progress();
  }
  ff.stdin.end();
  await done;
  await browser.close();
}

async function main() {
  fs.mkdirSync(BUILD, { recursive: true });
  const server = await serve();
  const port = server.address().port;

  if (args.serve) {
    console.log(`미리보기: http://127.0.0.1:${port}/  (Ctrl+C로 종료)`);
    return;
  }

  if (args.stills) {
    const dir = path.join(BUILD, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
    const page = await openPage(browser, port);
    for (const s of String(args.stills).split(',')) {
      const t = Number(s);
      await page.evaluate(tt => window.renderFrame(tt), t);
      const f = path.join(dir, `t${t.toFixed(2).padStart(6, '0')}.png`);
      fs.writeFileSync(f, await capture(page));
      console.log(f);
    }
    await browser.close();
    server.close();
    return;
  }

  const probe = await chromium.launch();
  const p0 = await openPage(probe, port);
  const duration = await p0.evaluate(() => window.DURATION);
  await probe.close();

  const total = Math.round(duration * FPS);
  const per = Math.ceil(total / WORKERS);
  const segDir = path.join(BUILD, 'segments');
  fs.rmSync(segDir, { recursive: true, force: true });
  fs.mkdirSync(segDir, { recursive: true });

  let doneFrames = 0;
  const started = Date.now();
  const tick = () => {
    doneFrames++;
    if (doneFrames % FPS === 0 || doneFrames === total) {
      const el = (Date.now() - started) / 1000;
      process.stdout.write(`\r  ${doneFrames}/${total} frames  ${(doneFrames / el).toFixed(1)} fps  eta ${Math.round((total - doneFrames) / (doneFrames / el))}s   `);
    }
  };
  console.log(`rendering ${total} frames @${FPS}fps with ${WORKERS} workers`);
  const segs = [];
  const jobs = [];
  for (let w = 0; w < WORKERS; w++) {
    const from = w * per, to = Math.min(total, from + per);
    if (from >= to) break;
    const file = path.join(segDir, `seg${w}.mp4`);
    segs.push(file);
    jobs.push(renderRange(port, from, to, file, tick));
  }
  await Promise.all(jobs);
  process.stdout.write('\n');
  server.close();

  const list = path.join(segDir, 'list.txt');
  fs.writeFileSync(list, segs.map(s => `file '${s}'`).join('\n'));
  await new Promise((res, rej) => {
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', OUT], { stdio: 'inherit' });
    ff.on('close', c => (c === 0 ? res() : rej(new Error(`concat exit ${c}`))));
  });
  console.log(`video → ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
