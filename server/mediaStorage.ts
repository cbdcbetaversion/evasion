import crypto from 'crypto';
import fs from 'fs';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import type { Request, Response } from 'express';

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'evasion-data')
  : path.resolve(process.cwd(), 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');

interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  cdnBaseUrl: string;
}

let s3CircuitOpen = false;

function getS3Config(): S3Config | null {
  if (s3CircuitOpen) return null;
  const endpoint = (process.env.MEDIA_S3_ENDPOINT || '').trim().replace(/\/+$/, '');
  const bucket = (process.env.MEDIA_S3_BUCKET || '').trim();
  const accessKeyId = (process.env.MEDIA_S3_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.MEDIA_S3_SECRET_ACCESS_KEY || '').trim();
  if (
    !endpoint ||
    !bucket ||
    !accessKeyId ||
    !secretAccessKey ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
    accessKeyId === 'MY_S3_ACCESS_KEY' ||
    secretAccessKey === 'MY_S3_SECRET_KEY' ||
    bucket === 'evasion-media-prod' ||
    accessKeyId.startsWith('AKIA_TEST') ||
    endpoint.includes('example.com')
  ) {
    return null;
  }
  const region = (process.env.MEDIA_S3_REGION || 'auto').trim();
  const cdnBaseUrl =
    process.env.MEDIA_CDN_URL && !process.env.MEDIA_CDN_URL.includes('mon-domaine.com')
      ? process.env.MEDIA_CDN_URL.trim().replace(/\/+$/, '')
      : `${endpoint}/${bucket}`;
  return { endpoint, bucket, region, accessKeyId, secretAccessKey, cdnBaseUrl };
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function encodeS3Path(key: string): string {
  return key
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

async function uploadToS3Compatible(
  cfg: S3Config,
  objectKey: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const targetUrl = new URL(`${cfg.endpoint}/${cfg.bucket}/${encodeS3Path(objectKey)}`);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(buffer);

  const canonicalUri = targetUrl.pathname;
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${targetUrl.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmacSha256(`AWS4${cfg.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, cfg.region);
  const kService = hmacSha256(kRegion, 's3');
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = hmacSha256(kSigning, stringToSign).toString('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(targetUrl.toString(), {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: authorization,
    },
    body: new Uint8Array(buffer),
    signal: AbortSignal.timeout(2500),
  });

  if (!res.ok) {
    throw new Error(`S3 HTTP ${res.status}`);
  }

  return `${cfg.cdnBaseUrl}/${encodeS3Path(objectKey)}`;
}

export function getMediaStorageMode(): 's3_cdn' | 'local_disk' {
  return getS3Config() ? 's3_cdn' : 'local_disk';
}

interface MediaBlobPersistenceHooks {
  save: (id: string, contentType: string, buffer: Buffer) => Promise<void>;
  load: (id: string) => Promise<{ buffer: Buffer; contentType: string } | null>;
}

let blobPersistenceHooks: MediaBlobPersistenceHooks | null = null;

export function registerMediaBlobPersistence(hooks: MediaBlobPersistenceHooks): void {
  blobPersistenceHooks = hooks;
}

export async function storeMediaBuffer(
  buffer: Buffer,
  contentType: string
): Promise<{ id: string; url: string; backend: 's3_cdn' | 'local_disk' }> {
  const safeMime = contentType.slice(0, 80) || 'application/octet-stream';
  const id = `med_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const s3 = getS3Config();
  if (s3) {
    try {
      const ext = safeMime.includes('mp4')
        ? '.mp4'
        : safeMime.includes('webm')
        ? '.webm'
        : safeMime.includes('png')
        ? '.png'
        : safeMime.includes('jpeg') || safeMime.includes('jpg')
        ? '.jpg'
        : safeMime.includes('webp')
        ? '.webp'
        : '';
      const objectKey = `evasion/${id}${ext}`;
      const url = await uploadToS3Compatible(s3, objectKey, buffer, safeMime);
      return { id, url, backend: 's3_cdn' };
    } catch {
      s3CircuitOpen = true;
    }
  }

  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }
  await fsp.writeFile(path.join(MEDIA_DIR, id), buffer);
  await fsp.writeFile(
    path.join(MEDIA_DIR, `${id}.meta.json`),
    JSON.stringify({ contentType: safeMime, size: buffer.length })
  );
  if (blobPersistenceHooks) {
    await blobPersistenceHooks.save(id, safeMime, buffer).catch(() => {});
  }
  return { id, url: `/api/media/${id}`, backend: 'local_disk' };
}

export async function isServerMediaOpenable(
  rawUrl: string | undefined,
  expectedType?: 'photo' | 'video' | 'audio' | 'file'
): Promise<boolean> {
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!url || url.startsWith('idb://') || url.startsWith('blob:')) {
    return false;
  }
  if (url.includes('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB')) {
    return false;
  }
  if (url.startsWith('data:')) {
    const commaIdx = url.indexOf(',');
    if (commaIdx === -1 || url.length - commaIdx < 60) return false;
    const header = url.slice(0, commaIdx).toLowerCase();
    if (expectedType === 'video' && !header.startsWith('data:video/')) return false;
    if (expectedType === 'audio' && !header.startsWith('data:audio/') && !header.startsWith('data:video/')) return false;
    if (expectedType === 'photo' && !header.startsWith('data:image/')) return false;
    return true;
  }
  if (url.startsWith('/api/media/')) {
    const cleanPath = url.split('?')[0];
    const safeId = path.basename(cleanPath).replace(/[^a-zA-Z0-9_.-]/g, '');
    if (!safeId) return false;
    const filePath = path.join(MEDIA_DIR, safeId);
    if (!fs.existsSync(filePath) && blobPersistenceHooks) {
      const restored = await blobPersistenceHooks.load(safeId);
      if (restored && restored.buffer && restored.buffer.length > 0) {
        if (!fs.existsSync(MEDIA_DIR)) {
          fs.mkdirSync(MEDIA_DIR, { recursive: true });
        }
        await fsp.writeFile(filePath, restored.buffer).catch(() => {});
        await fsp
          .writeFile(
            `${filePath}.meta.json`,
            JSON.stringify({ contentType: restored.contentType, size: restored.buffer.length })
          )
          .catch(() => {});
      }
    }
    if (!fs.existsSync(filePath)) {
      return false;
    }
    try {
      const stat = await fsp.stat(filePath);
      // Reject empty or 68-byte synthetic 1x1 PNG test files
      if (!stat.isFile() || stat.size <= 75) {
        return false;
      }
      if (fs.existsSync(`${filePath}.meta.json`)) {
        const meta = JSON.parse(await fsp.readFile(`${filePath}.meta.json`, 'utf-8')) as {
          contentType?: string;
        };
        const mime = (meta.contentType || '').toLowerCase();
        if (expectedType === 'video' && mime.startsWith('image/')) return false;
        if (expectedType === 'audio' && mime.startsWith('image/')) return false;
        if (expectedType === 'photo' && (mime.startsWith('audio/') || mime.startsWith('video/'))) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

function mimeToExtension(contentType: string): string {
  const mime = (contentType || '').toLowerCase();
  if (mime.includes('audio/mp4') || mime.includes('m4a') || mime.includes('aac')) return '.m4a';
  if (mime.includes('audio/mpeg') || mime.includes('mp3')) return '.mp3';
  if (mime.includes('audio/ogg')) return '.ogg';
  if (mime.includes('audio/wav')) return '.wav';
  if (mime.includes('audio/flac')) return '.flac';
  if (mime.includes('audio/webm')) return '.webm';
  if (mime.includes('video/mp4') || mime.includes('mp4')) return '.mp4';
  if (mime.includes('video/webm') || mime.includes('webm')) return '.webm';
  if (mime.includes('quicktime') || mime.includes('mov')) return '.mov';
  if (mime.includes('svg')) return '.svg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('pdf')) return '.pdf';
  if (mime.includes('zip')) return '.zip';
  if (mime.includes('json')) return '.json';
  if (mime.includes('csv')) return '.csv';
  if (mime.includes('text/plain')) return '.txt';
  if (mime.includes('wordprocessingml')) return '.docx';
  if (mime.includes('msword')) return '.doc';
  if (mime.includes('spreadsheetml')) return '.xlsx';
  return '';
}

export function sanitizeDownloadFileName(rawName: string | undefined, contentType: string, fallbackId: string): string {
  const cleaned = String(rawName || '')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .trim()
    .slice(0, 80);
  const base = cleaned || `evasion_${fallbackId}`;
  const ext = mimeToExtension(contentType);
  if (ext && !/\.[a-z0-9]{2,5}$/i.test(base)) {
    return `${base}${ext}`;
  }
  return base;
}

export async function serveLocalMediaWithRanges(req: Request, res: Response): Promise<void> {
  try {
    const safeId = path.basename(String(req.params.id || '')).replace(/[^a-zA-Z0-9_.-]/g, '');
    if (!safeId) {
      res.status(400).end();
      return;
    }
    const filePath = path.join(MEDIA_DIR, safeId);
    if (!fs.existsSync(filePath) && blobPersistenceHooks) {
      const restored = await blobPersistenceHooks.load(safeId);
      if (restored && restored.buffer && restored.buffer.length > 0) {
        if (!fs.existsSync(MEDIA_DIR)) {
          fs.mkdirSync(MEDIA_DIR, { recursive: true });
        }
        await fsp.writeFile(filePath, restored.buffer).catch(() => {});
        await fsp
          .writeFile(
            `${filePath}.meta.json`,
            JSON.stringify({ contentType: restored.contentType, size: restored.buffer.length })
          )
          .catch(() => {});
      }
    }
    if (!fs.existsSync(filePath)) {
      res.status(404).end();
      return;
    }

    let contentType = 'application/octet-stream';
    try {
      const meta = JSON.parse(await fsp.readFile(`${filePath}.meta.json`, 'utf-8')) as {
        contentType?: string;
      };
      if (meta.contentType) contentType = meta.contentType;
    } catch {
      // default mime
    }

    const stat = await fsp.stat(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const isDirectDownload = req.query?.download === '1' || req.query?.download === 'true';

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    if (isDirectDownload) {
      const fileName = sanitizeDownloadFileName(
        typeof req.query?.filename === 'string' ? req.query.filename : undefined,
        contentType,
        safeId
      );
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Length', fileSize);
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= fileSize || end >= fileSize || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', end - start + 1);
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.setHeader('Content-Length', fileSize);
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.status(500).end();
  }
}

export function cleanupUnusedLocalMediaUrls(urlsToDelete: string[], activeUrls: Set<string>): void {
  for (const u of urlsToDelete) {
    if (typeof u === 'string' && u.startsWith('/api/media/') && !activeUrls.has(u)) {
      const mediaId = path.basename(u).replace(/[^a-zA-Z0-9_.-]/g, '');
      if (!mediaId) continue;
      void fsp.unlink(path.join(MEDIA_DIR, mediaId)).catch(() => {});
      void fsp.unlink(path.join(MEDIA_DIR, `${mediaId}.meta.json`)).catch(() => {});
    }
  }
}
