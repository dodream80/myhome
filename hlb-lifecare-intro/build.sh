#!/usr/bin/env bash
# 음악 합성 → 프레임 렌더 → 오디오 합치기까지 한 번에 실행한다.
set -euo pipefail
cd "$(dirname "$0")"

FPS="${FPS:-30}"
WORKERS="${WORKERS:-4}"
OUT="output/hlb-lifecare-intro.mp4"

[ -d node_modules/pretendard ] || npm install
mkdir -p build output

python3 scripts/music.py build/music.wav
node scripts/render.mjs --fps "$FPS" --workers "$WORKERS" --out build/video.mp4

ffmpeg -y -loglevel error -i build/video.mp4 -i build/music.wav \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart \
  -metadata title="HLB라이프케어 소개 영상" "$OUT"
echo "done → $OUT"
