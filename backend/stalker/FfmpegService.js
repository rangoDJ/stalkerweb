// FfmpegService.js
// Server-side remux/transcode for UDP, RTP, and RTSP streams that browsers
// cannot fetch natively.
//
// Strategy:
//   1. ffprobe the source to identify video/audio codecs.
//   2. If both are already browser-safe (H.264 + AAC/MP3/Opus/PCM) use
//      -c copy — pure remux, negligible CPU.
//   3. Otherwise re-encode: video → libx264, audio → aac.
//   4. Output format is always mpegts piped to stdout so mpegts.js can play it.

'use strict';

const { spawn, spawnSync } = require('child_process');
const log = require('../logger');
const TAG = 'ffmpeg';

// ── Availability check (cached) ───────────────────────────────────────────────

let _available = null;

function isAvailable() {
  if (_available !== null) return _available;
  try {
    const r = spawnSync('ffmpeg', ['-version'], { timeout: 5_000, stdio: 'pipe' });
    _available = r.status === 0;
  } catch {
    _available = false;
  }
  if (_available) log.info(TAG, 'FFmpeg found — UDP/RTP/RTSP remux enabled');
  else            log.warn(TAG, 'FFmpeg not found — UDP/RTP/RTSP channels unavailable');
  return _available;
}

// ── Browser-safe codec sets ───────────────────────────────────────────────────
// Codecs that every modern browser can decode natively inside MPEG-TS via MSE.
const SAFE_VIDEO = new Set(['h264', 'hevc', 'h265']); // hevc needs Safari/Edge but is common
const SAFE_AUDIO = new Set(['aac', 'mp3', 'opus', 'pcm_alaw', 'pcm_mulaw']);

// ── ffprobe codec probe ───────────────────────────────────────────────────────
// Returns { video: 'h264'|null, audio: 'aac'|null, safe: bool } or null on error.
// probe timeout is generous: multicast/RTSP sources can take a few seconds to
// start delivering frames.
async function probeCodecs(streamUrl) {
  const inputArgs = _inputArgs(streamUrl);
  return new Promise((resolve) => {
    const probe = spawn('ffprobe', [
      ...inputArgs,
      '-i', streamUrl,
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-select_streams', 'a:0,v:0',   // first audio + first video only
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let out = '';
    probe.stdout.on('data', d => { out += d.toString(); });

    const timer = setTimeout(() => {
      try { probe.kill('SIGKILL'); } catch {}
      log.warn(TAG, `ffprobe timed out for ${streamUrl} — assuming re-encode needed`);
      resolve(null);
    }, 12_000);

    probe.on('close', () => {
      clearTimeout(timer);
      try {
        const json = JSON.parse(out);
        let video = null, audio = null;
        for (const s of json.streams || []) {
          if (s.codec_type === 'video' && !video) video = (s.codec_name || '').toLowerCase();
          if (s.codec_type === 'audio' && !audio) audio = (s.codec_name || '').toLowerCase();
        }
        const safe = (!video || SAFE_VIDEO.has(video)) && (!audio || SAFE_AUDIO.has(audio));
        log.info(TAG, `probe: video=${video ?? 'none'} audio=${audio ?? 'none'} safe=${safe}`);
        resolve({ video, audio, safe });
      } catch {
        log.warn(TAG, 'ffprobe output parse failed — assuming re-encode needed');
        resolve(null);
      }
    });

    probe.on('error', (err) => {
      clearTimeout(timer);
      log.warn(TAG, `ffprobe error: ${err.message} — assuming re-encode needed`);
      resolve(null);
    });
  });
}

// ── Input args for each protocol ─────────────────────────────────────────────

function _inputArgs(url) {
  const lower = url.toLowerCase();
  if (lower.startsWith('rtsp://')) {
    // TCP avoids UDP packet loss on RTSP; more reliable over NAT
    return ['-rtsp_transport', 'tcp'];
  }
  if (lower.startsWith('udp://') || lower.startsWith('rtp://') ||
      lower.startsWith('igmp://') || lower.startsWith('mc://')) {
    // Give ffmpeg time to receive the multicast/unicast burst before giving up.
    // Value is in microseconds (10 s).
    return ['-timeout', '10000000'];
  }
  return [];
}

// ── Codec args: copy vs re-encode ─────────────────────────────────────────────

function _codecArgs(probeResult) {
  if (probeResult?.safe) {
    // All streams already browser-compatible — pure remux, near-zero CPU
    return ['-c', 'copy'];
  }
  // Re-encode to the universal baseline that every browser supports
  log.info(TAG, probeResult
    ? `unsafe codecs (video=${probeResult.video} audio=${probeResult.audio}) — re-encoding to H.264/AAC`
    : 'codec probe failed — re-encoding to H.264/AAC as fallback');
  return [
    '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
    '-c:a', 'aac',
    '-b:a', '128k',
  ];
}

// ── Main transcode entry point ────────────────────────────────────────────────
// Probes the source, chooses copy vs re-encode, spawns FFmpeg, pipes to res.
// Returns a Promise that resolves when the FFmpeg process has started (or rejects
// on immediate failure — e.g. spawn error).

async function transcode(streamUrl, req, res) {
  // Probe first so we pick the right codec args
  const probe = await probeCodecs(streamUrl);

  const inputArgs  = _inputArgs(streamUrl);
  const codecArgs  = _codecArgs(probe);
  const outputArgs = ['-f', 'mpegts', 'pipe:1'];
  const mode = probe?.safe ? 'copy' : 're-encode';

  const args = ['-hide_banner', '-loglevel', 'warning', ...inputArgs, '-i', streamUrl, ...codecArgs, ...outputArgs];
  log.info(TAG, `spawning FFmpeg [${mode}]: ffmpeg ${args.join(' ')}`);

  const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  // Stream the raw MPEG-TS bytes to the browser
  res.set('Content-Type', 'video/MP2T');
  res.set('Cache-Control', 'no-cache, no-store');
  res.set('Access-Control-Allow-Origin', '*');

  ffmpeg.stdout.pipe(res);

  // ── Lifecycle management ─────────────────────────────────────────────────
  let killed = false;
  function kill(reason) {
    if (killed) return;
    killed = true;
    log.debug(TAG, `terminating FFmpeg process (${reason})`);
    try { ffmpeg.kill('SIGKILL'); } catch {}
  }

  // Kill immediately when the viewer closes the tab/navigates away
  req.on('close', () => kill('client disconnected'));

  ffmpeg.on('error', (err) => {
    log.error(TAG, `process error: ${err.message}`);
    kill('process error');
    if (!res.headersSent) {
      res.status(502).send(`FFmpeg error: ${err.message}`);
    } else if (!res.writableEnded) {
      res.destroy();
    }
  });

  ffmpeg.on('close', (code, signal) => {
    if (!killed && code !== 0) {
      log.warn(TAG, `FFmpeg exited with code=${code} signal=${signal}`);
    }
    if (!res.writableEnded) res.end();
  });

  // Log FFmpeg stderr at debug level (it's verbose but useful for debugging).
  // Suppress the repeated "Last message repeated N times" lines.
  let stderrBuf = '';
  ffmpeg.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
    const lines = stderrBuf.split('\n');
    stderrBuf = lines.pop(); // keep incomplete last line
    for (const line of lines) {
      const t = line.trim();
      if (t && !t.startsWith('Last message repeated')) log.debug(TAG, t);
    }
  });
}

module.exports = { isAvailable, transcode, probeCodecs };
