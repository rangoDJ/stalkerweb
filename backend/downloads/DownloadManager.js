// DownloadManager.js
// Sequential "download to server disk" queue for VOD movies/episodes.
// One download runs at a time (mirrors the "one connection per token" rule
// documented in routes/proxy.js — VOD CDNs stall a second concurrent
// connection using the same resolved link) with live progress reported over
// GET /api/downloads/events.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');
const log = require('../logger');
const TAG = 'downloads';

function sanitizeFilename(name) {
  const cleaned = String(name || 'download').replace(/[/\\?%*:|"<>]/g, '_').trim();
  return cleaned.slice(0, 200) || 'download';
}

class DownloadManager extends EventEmitter {
  // getDownloadDir: () => absolute directory path, read fresh on every
  // download so a Settings change takes effect without a restart.
  constructor(appState, getDownloadDir) {
    super();
    this.appState = appState;
    this.getDownloadDir = getDownloadDir;
    this._jobs = new Map();        // id → job
    this._queue = [];              // ids waiting to run, FIFO
    this._activeId = null;
    this._controllers = new Map(); // id → AbortController (for cancel)
  }

  list() {
    return [...this._jobs.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  // items: [{ videoId, cmd, series, seasonId, episodeId, title, seriesTitle }]
  enqueue(items) {
    const created = [];
    for (const item of items || []) {
      if (!item?.videoId || !item?.title) continue;
      const id = crypto.randomUUID();
      const job = {
        id,
        videoId:         String(item.videoId),
        cmd:             item.cmd || '',
        series:          parseInt(item.series, 10) || 0,
        seasonId:        item.seasonId || '',
        episodeId:       item.episodeId || '',
        title:           String(item.title),
        seriesTitle:     item.seriesTitle || '',
        status:          'queued', // queued | downloading | done | error | canceled
        bytesDownloaded: 0,
        totalBytes:      0,
        error:           null,
        filePath:        null,
        createdAt:       Date.now(),
      };
      this._jobs.set(id, job);
      this._queue.push(id);
      created.push(job);
    }
    if (created.length) this._emitUpdate();
    this._runNext();
    return created;
  }

  // Cancels a queued or in-flight job, or removes a finished/errored one.
  remove(id) {
    const job = this._jobs.get(id);
    if (!job) return false;
    if (job.status === 'queued') {
      this._queue = this._queue.filter(qid => qid !== id);
      this._jobs.delete(id);
      this._emitUpdate();
      return true;
    }
    if (job.status === 'downloading') {
      this._controllers.get(id)?.abort();
      return true; // job removed once the abort unwinds, in _runNext's finally
    }
    this._jobs.delete(id);
    this._emitUpdate();
    return true;
  }

  _emitUpdate() {
    this.emit('update', this.list());
  }

  async _runNext() {
    if (this._activeId) return; // already processing one — sequential by design
    const id = this._queue.shift();
    if (!id) return;
    const job = this._jobs.get(id);
    if (!job) { this._runNext(); return; }

    this._activeId = id;
    job.status = 'downloading';
    this._emitUpdate();

    const controller = new AbortController();
    this._controllers.set(id, controller);
    let tmpPath = null;

    try {
      const { vodManager, client } = this.appState;
      if (!vodManager) throw new Error('VOD not available — connect to a portal first');

      const streamUrl = await vodManager.getStreamUrl(job.videoId, job.cmd || null, job.series, {
        seasonId: job.seasonId, episodeId: job.episodeId,
      });
      if (!streamUrl) throw new Error('Could not resolve stream URL');

      const cleanUrl = streamUrl.split('?')[0].split('#')[0];
      if (/\.(m3u8?|m3u)$/i.test(cleanUrl)) {
        throw new Error("This title streams as HLS and can't be saved as a single file.");
      }

      const dir = this.getDownloadDir();
      fs.mkdirSync(dir, { recursive: true });
      const ext  = (cleanUrl.match(/\.([a-z0-9]{2,4})$/i)?.[1] || 'mp4').toLowerCase();
      const base = sanitizeFilename(job.seriesTitle ? `${job.seriesTitle} - ${job.title}` : job.title);
      let filePath = path.join(dir, `${base}.${ext}`);
      let n = 1;
      while (fs.existsSync(filePath)) filePath = path.join(dir, `${base} (${n++}).${ext}`);
      tmpPath = filePath + '.part';

      const headers = client?.streamHeadersFor ? client.streamHeadersFor(streamUrl) : {};
      const http    = client?.getHttpClient ? client.getHttpClient() : require('axios');

      const response = await http.get(streamUrl, {
        headers, responseType: 'stream', signal: controller.signal, validateStatus: () => true,
      });
      if (response.status >= 400) throw new Error(`Server returned HTTP ${response.status}`);

      job.totalBytes = parseInt(response.headers['content-length'] || '0', 10) || 0;

      const writeStream = fs.createWriteStream(tmpPath);
      let lastEmit = 0;
      await new Promise((resolve, reject) => {
        response.data.on('data', chunk => {
          job.bytesDownloaded += chunk.length;
          const now = Date.now();
          // Throttle progress broadcasts — don't flood every SSE subscriber per chunk.
          if (now - lastEmit > 500) { lastEmit = now; this._emitUpdate(); }
        });
        response.data.on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);
        response.data.pipe(writeStream);
      });

      fs.renameSync(tmpPath, filePath);
      tmpPath = null;
      job.status     = 'done';
      job.filePath   = filePath;
      job.totalBytes = job.totalBytes || job.bytesDownloaded;
      log.info(TAG, `downloaded "${job.title}" → ${filePath}`);
    } catch (e) {
      job.status = controller.signal.aborted ? 'canceled' : 'error';
      if (job.status === 'error') {
        job.error = e.message;
        log.error(TAG, `download failed for "${job.title}": ${e.message}`);
      }
    } finally {
      if (tmpPath) {
        try { fs.unlinkSync(tmpPath); } catch { /* best effort */ }
      }
      this._controllers.delete(id);
      this._activeId = null;
      if (job.status === 'canceled') this._jobs.delete(id); // canceled = removed, not kept around
      this._emitUpdate();
      this._runNext();
    }
  }
}

module.exports = DownloadManager;
