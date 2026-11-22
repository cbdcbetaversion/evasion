/**
 * Synthetic Web Audio engine for ÉVASION.
 * 100% self-contained, zero external asset dependencies, zero network latency.
 */

export type SoundscapeType = '432hz' | 'silence';

const freshPreviewCache = new Map<string, { url: string; fetchedAt: number }>();
const FRESH_PREVIEW_TTL_MS = 10 * 60 * 1000;

function extractInnerStreamUrl(rawUrl: string): string {
  if (!rawUrl.startsWith('/api/music/')) return rawUrl;
  try {
    const parsed = new URL(rawUrl, 'https://evasion.local');
    return parsed.searchParams.get('url') || rawUrl;
  } catch {
    return rawUrl;
  }
}

export function isDeezerPreviewLikelyExpired(url?: string | null): boolean {
  if (!url) return false;
  let candidate = url;
  try {
    const inner = extractInnerStreamUrl(candidate);
    candidate = decodeURIComponent(inner);
  } catch {
    // keep raw candidate
  }
  const match = candidate.match(/exp=(\d{9,12})/);
  if (!match) return false;
  const expSec = Number(match[1]);
  if (!Number.isFinite(expSec)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  // Treat as expired if within 60 seconds of expiry
  return expSec <= nowSec + 60;
}

export function getPlayableCoverUrl(rawCover?: string | null): string {
  if (!rawCover) return '';
  const clean = rawCover.trim();
  if (!clean) return '';
  if (clean.startsWith('/api/music/cover') || clean.startsWith('data:') || clean.startsWith('/')) {
    return clean;
  }
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return `/api/music/cover?url=${encodeURIComponent(clean)}`;
  }
  return clean;
}

export function getPlayableDeezerUrl(
  url?: string | null,
  trackMeta?:
    | {
        id?: number | string;
        title?: string;
        artist?: string;
        audioUrl?: string;
        previewUrl?: string;
      }
    | number
    | string
    | null
): string {
  const metaObj:
    | {
        id?: number | string;
        title?: string;
        artist?: string;
        audioUrl?: string;
        previewUrl?: string;
      }
    | undefined =
    trackMeta !== null && typeof trackMeta === 'object'
      ? trackMeta
      : typeof trackMeta === 'number' || typeof trackMeta === 'string'
      ? { id: trackMeta }
      : undefined;

  const effectiveUrl = (url || metaObj?.audioUrl || metaObj?.previewUrl || '').trim();
  if (!effectiveUrl && !metaObj?.id && !metaObj?.title) return '';

  const isLegacyOrProxy =
    effectiveUrl.startsWith('/api/music/stream') ||
    effectiveUrl.startsWith('/api/music/deezer/stream');
  const isRemoteMusicCdn =
    effectiveUrl.includes('dzcdn.net') ||
    effectiveUrl.includes('deezer.com') ||
    effectiveUrl.includes('mzstatic.com') ||
    effectiveUrl.includes('apple.com');

  if (effectiveUrl && !isLegacyOrProxy && !isRemoteMusicCdn) {
    return effectiveUrl;
  }

  let innerUrl = effectiveUrl;
  let existingId = metaObj?.id !== undefined && metaObj?.id !== null ? String(metaObj.id) : '';
  let existingTitle = metaObj?.title || '';
  let existingArtist = metaObj?.artist || '';

  if (isLegacyOrProxy) {
    try {
      const parsed = new URL(effectiveUrl, 'https://evasion.local');
      innerUrl = parsed.searchParams.get('url') || '';
      if (!existingId) existingId = parsed.searchParams.get('id') || '';
      if (!existingTitle) existingTitle = parsed.searchParams.get('title') || '';
      if (!existingArtist) existingArtist = parsed.searchParams.get('artist') || '';
    } catch {
      innerUrl = '';
    }
  }

  const params = new URLSearchParams();
  if (existingId) params.set('id', existingId);
  if (existingTitle) params.set('title', existingTitle);
  if (existingArtist) params.set('artist', existingArtist);
  if (innerUrl && innerUrl.startsWith('http')) params.set('url', innerUrl);
  return `/api/music/stream?${params.toString()}`;
}

export async function resolveFreshTrackPreviewUrl(
  track?: {
    id?: number | string;
    title?: string;
    artist?: string;
    audioUrl?: string;
    previewUrl?: string;
  } | null,
  forceRefresh = false
): Promise<string | null> {
  if (!track) return null;
  const rawUrl =
    typeof track.audioUrl === 'string' && track.audioUrl.trim()
      ? track.audioUrl.trim()
      : typeof track.previewUrl === 'string'
      ? track.previewUrl.trim()
      : '';
  const cacheKey = `${String(track.id || '')}|${track.title || ''}|${track.artist || ''}`;

  if (!forceRefresh && rawUrl && !isDeezerPreviewLikelyExpired(rawUrl)) {
    return getPlayableDeezerUrl(rawUrl, track);
  }

  const cached = freshPreviewCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < FRESH_PREVIEW_TTL_MS) {
    return getPlayableDeezerUrl(cached.url, track);
  }

  if (!track.id && !track.title) {
    return getPlayableDeezerUrl(rawUrl, track) || null;
  }

  try {
    const params = new URLSearchParams();
    if (track.id !== undefined && track.id !== null) params.set('id', String(track.id));
    if (track.title) params.set('title', track.title);
    if (track.artist) params.set('artist', track.artist);
    const res = await fetch(`/api/music/refresh?${params.toString()}`, {
      credentials: 'include',
    });
    if (res.ok) {
      const data = (await res.json()) as {
        success?: boolean;
        previewUrl?: string | null;
        audioUrl?: string | null;
      };
      const resolved = data?.audioUrl || data?.previewUrl;
      if (resolved && (resolved.startsWith('http') || resolved.startsWith('/api/music/'))) {
        freshPreviewCache.set(cacheKey, { url: resolved, fetchedAt: Date.now() });
        return getPlayableDeezerUrl(resolved, track);
      }
    }
  } catch {
    // offline or transient failure
  }

  // Secondary fallback: if forceRefresh is true (meaning /api/music/stream failed on the server),
  // unwrap the inner HTTP stream URL or query a fresh audio preview so playback still succeeds.
  const unwrappedInner = extractInnerStreamUrl(rawUrl);
  if (forceRefresh && unwrappedInner && unwrappedInner.startsWith('http') && !isDeezerPreviewLikelyExpired(unwrappedInner)) {
    return unwrappedInner;
  }

  const lookupTerm = [track.title || '', track.artist || ''].filter(Boolean).join(' ').trim();
  if (forceRefresh && lookupTerm) {
    try {
      const fallbackRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(lookupTerm)}&media=music&entity=song&limit=5`
      );
      if (fallbackRes.ok) {
        const fallbackData = (await fallbackRes.json()) as {
          results?: { previewUrl?: string }[];
        };
        const firstPreview = (fallbackData.results || []).find(
          (item) => typeof item.previewUrl === 'string' && item.previewUrl.startsWith('http')
        )?.previewUrl;
        if (firstPreview) {
          freshPreviewCache.set(cacheKey, { url: firstPreview, fetchedAt: Date.now() });
          return firstPreview;
        }
      }
    } catch {
      // ignore secondary fallback errors
    }
  }

  return getPlayableDeezerUrl(rawUrl, track) || null;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private currentAmbientAudio: HTMLAudioElement | null = null;
  private ambientOsc: OscillatorNode | null = null;
  private ambientOsc2: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientNoiseSource: AudioBufferSourceNode | null = null;
  private ambientTimer: number | null = null;

  constructor() {
    // Check saved muted preference
    try {
      const saved = localStorage.getItem('evasion_muted');
      if (saved !== null) {
        this.isMuted = saved === 'true';
      }
    } catch {
      // ignore storage errors
    }

    // Unlock Web Audio on first user interaction (required on iOS Safari / Android Chrome / PWA)
    if (typeof window !== 'undefined') {
      const unlockHandler = () => {
        this.unlock();
      };
      window.addEventListener('pointerdown', unlockHandler, { passive: true });
      window.addEventListener('touchstart', unlockHandler, { passive: true });
      window.addEventListener('keydown', unlockHandler, { passive: true });
    }
  }

  public unlock() {
    try {
      this.initCtx();
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMuted(muted: boolean): boolean {
    this.isMuted = muted;
    try {
      localStorage.setItem('evasion_muted', String(this.isMuted));
    } catch {
      // ignore
    }
    if (this.isMuted && this.ambientGain) {
      this.stopAmbientSound();
    } else if (!this.isMuted) {
      this.unlock();
    }
    return this.isMuted;
  }

  public toggleMute(): boolean {
    return this.setMuted(!this.isMuted);
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public resetMute(): void {
    this.isMuted = false;
    try {
      localStorage.removeItem('evasion_muted');
    } catch {
      // ignore
    }
    this.stopAllVoicePlayback();
    this.stopAmbientSound();
  }

  /**
   * Sound of turning a heavy metallic key in a prison lock
   */
  public playKeyTurn() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Click 1 (key insertion)
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(620, now);
      osc1.frequency.exponentialRampToValueAtTime(140, now + 0.08);

      gain1.gain.setValueAtTime(0.25, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.08);

      // Click 2 (ratchet rotation)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(420, now + 0.09);
      osc2.frequency.exponentialRampToValueAtTime(880, now + 0.16);

      gain2.gain.setValueAtTime(0.3, now + 0.09);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.22);
    } catch {
      // Audio context may fail if blocked by browser policy before user interaction
    }
  }

  /**
   * Heavy cell lock clatter
   */
  public playLockSound() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(65, now + 0.15);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      // ignore
    }
  }

  /**
   * Grand liberation fanfare chord (synthesized triumph in emerald)
   */
  public playLiberationFanfare() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      // Majestic chord: C4 (261.63), E4 (329.63), G4 (392.00), C5 (523.25), E5 (659.25)
      const freqs = [261.63, 329.63, 392.00, 523.25, 659.25];
      freqs.forEach((f, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + i * 0.06);

        gain.gain.setValueAtTime(0.18, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + 1.2);
      });
    } catch {
      // ignore
    }
  }

  /**
   * Soft zen bell for detox mode complete
   */
  public playZenChime() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const freqs = [432, 864, 1296];
      freqs.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        const amp = 0.2 / (idx + 1);
        gain.gain.setValueAtTime(amp, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now);
        osc.stop(now + 2.5);
      });
    } catch {
      // ignore
    }
  }

  /**
   * Chat message incoming blip
   */
  public playChatBlip() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.06);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
    } catch {
      // ignore
    }
  }

  /**
   * Start ultra-soft 432Hz ambient soundscape during Detox session.
   * Uses warm filtered breeze + gentle decaying 432Hz-tuned acoustic notes (no continuous sine beep).
   */
  public startAmbientSound(soundscape: SoundscapeType = '432hz') {
    this.stopAmbientSound();
    if (this.isMuted || soundscape === 'silence') return;

    this.startSyntheticAmbient();

    if (typeof Audio !== 'undefined') {
      try {
        const audio = new Audio('/assets/audio/shield_432hz.wav');
        audio.loop = true;
        audio.volume = 0.28;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              this.currentAmbientAudio = audio;
            })
            .catch(() => {
              // WebAudio ambient is already playing softly
            });
        } else {
          this.currentAmbientAudio = audio;
        }
      } catch {
        // WebAudio ambient is already playing softly
      }
    }
  }

  /**
   * Soft, natural 432Hz-tuned ambient breeze & gentle acoustic harp/bowl notes (no static sine wave beep)
   */
  private startSyntheticAmbient() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // 1. Create a warm, deeply low-passed breeze buffer (4 seconds seamless noise)
      const sampleRate = this.ctx.sampleRate;
      const bufferSize = sampleRate * 4;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.015 * white) / 1.015;
        lastOut = output[i];
        output[i] *= 0.35;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(240, now);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0.001, now);
      this.ambientGain.gain.linearRampToValueAtTime(0.045, now + 3.0);

      whiteNoise.connect(filter);
      filter.connect(this.ambientGain);
      this.ambientGain.connect(this.ctx.destination);
      whiteNoise.start(now);
      this.ambientNoiseSource = whiteNoise;

      // 2. Play a soft, warm decaying acoustic note tuned to 432Hz temperament every 4.5 seconds
      const playSoftNote = () => {
        if (!this.ctx || this.isMuted || !this.ambientGain) return;
        try {
          const t = this.ctx.currentTime;
          const notes = [216, 162, 256, 192, 144]; // Warm low-mid notes in 432Hz tuning
          const freq = notes[Math.floor(Math.random() * notes.length)];

          const osc = this.ctx.createOscillator();
          const noteGain = this.ctx.createGain();
          const noteFilter = this.ctx.createBiquadFilter();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);

          noteFilter.type = 'lowpass';
          noteFilter.frequency.setValueAtTime(340, t);

          noteGain.gain.setValueAtTime(0.0001, t);
          noteGain.gain.linearRampToValueAtTime(0.018, t + 0.8);
          noteGain.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);

          osc.connect(noteFilter);
          noteFilter.connect(noteGain);
          noteGain.connect(this.ctx.destination);

          osc.start(t);
          osc.stop(t + 4.3);
        } catch {
          // ignore
        }
      };

      playSoftNote();
      this.ambientTimer = window.setInterval(playSoftNote, 4500);
    } catch {
      // ignore
    }
  }

  public stopAmbientSound() {
    try {
      if (this.currentAmbientAudio) {
        try {
          this.currentAmbientAudio.pause();
          this.currentAmbientAudio.currentTime = 0;
          this.currentAmbientAudio.removeAttribute('src');
        } catch {
          // ignore
        }
        this.currentAmbientAudio = null;
      }

      if (this.ambientTimer !== null) {
        clearInterval(this.ambientTimer);
        this.ambientTimer = null;
      }
      if (this.ambientNoiseSource) {
        try {
          this.ambientNoiseSource.stop();
          this.ambientNoiseSource.disconnect();
        } catch {
          // ignore
        }
        this.ambientNoiseSource = null;
      }
      if (this.ambientOsc2) {
        try {
          this.ambientOsc2.stop();
          this.ambientOsc2.disconnect();
        } catch {
          // ignore
        }
        this.ambientOsc2 = null;
      }
      if (this.ambientOsc) {
        try {
          this.ambientOsc.stop();
          this.ambientOsc.disconnect();
        } catch {
          // ignore
        }
        this.ambientOsc = null;
      }
      if (this.ambientGain) {
        try {
          this.ambientGain.disconnect();
        } catch {
          // ignore
        }
        this.ambientGain = null;
      }
    } catch {
      // ignore
    }
  }

  // Active voice playback reference
  private currentVoiceSource: AudioBufferSourceNode | null = null;
  private currentVoiceAudioElement: HTMLAudioElement | null = null;
  private currentBlobUrl: string | null = null;
  private currentSimulatedOscs: OscillatorNode[] = [];

  public stopAllVoicePlayback() {
    try {
      if (this.currentVoiceSource) {
        try {
          this.currentVoiceSource.stop();
          this.currentVoiceSource.disconnect();
        } catch {
          // ignore
        }
        this.currentVoiceSource = null;
      }
      if (this.currentVoiceAudioElement) {
        try {
          this.currentVoiceAudioElement.pause();
          this.currentVoiceAudioElement.currentTime = 0;
        } catch {
          // ignore
        }
        this.currentVoiceAudioElement = null;
      }
      if (this.currentBlobUrl) {
        try {
          URL.revokeObjectURL(this.currentBlobUrl);
        } catch {
          // ignore
        }
        this.currentBlobUrl = null;
      }
      if (this.currentSimulatedOscs.length > 0) {
        this.currentSimulatedOscs.forEach((osc) => {
          try {
            osc.stop();
            osc.disconnect();
          } catch {
            // ignore
          }
        });
        this.currentSimulatedOscs = [];
      }
    } catch {
      // ignore
    }
  }

  /**
   * Convert a base64 data:audio/... string into a binary Blob and ArrayBuffer,
   * stripping any ';codecs=...' parameter that breaks iOS Safari playback.
   */
  public base64ToAudioBlob(dataUrl: string): { blob: Blob; buffer: ArrayBuffer; mimeType: string } | null {
    try {
      if (!dataUrl || !dataUrl.includes(',')) return null;
      const [header, base64] = dataUrl.split(',');
      if (!base64 || base64.length < 64) return null;

      const mimeMatch = header.match(/data:([^;]+)/);
      const cleanMime = mimeMatch && mimeMatch[1] ? mimeMatch[1] : 'audio/mp4';

      const binaryStr = window.atob(base64);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const blob = new Blob([bytes.buffer], { type: cleanMime });
      return { blob, buffer: bytes.buffer, mimeType: cleanMime };
    } catch {
      return null;
    }
  }

  public getAudioContext(): AudioContext | null {
    this.initCtx();
    return this.ctx;
  }

  /**
   * Play real recorded user audio cleanly across iOS Safari, Android Chrome, and Desktop.
   */
  public playVoiceNote(
    audioData: string | undefined,
    duration: number,
    _hasVoiceFilter: boolean,
    onEnded: () => void,
    _spokenText?: string
  ): () => void {
    this.stopAllVoicePlayback();

    if (!audioData || !audioData.startsWith('data:audio') || audioData.includes('simulated')) {
      const timer = setTimeout(onEnded, 400);
      return () => clearTimeout(timer);
    }

    const parsed = this.base64ToAudioBlob(audioData);
    if (!parsed) {
      const timer = setTimeout(onEnded, 400);
      return () => clearTimeout(timer);
    }

    // Primary playback via native Blob Object URL + HTMLAudioElement (playsInline for iOS)
    try {
      const blobUrl = URL.createObjectURL(parsed.blob);
      this.currentBlobUrl = blobUrl;

      const audio = new Audio();
      audio.preload = 'auto';
      (audio as unknown as { playsInline: boolean }).playsInline = true;
      audio.src = blobUrl;
      audio.volume = 1.0;
      this.currentVoiceAudioElement = audio;

      let fallbackTriggered = false;
      const tryWebAudioDecodeFallback = () => {
        if (fallbackTriggered) return;
        fallbackTriggered = true;
        this.playViaWebAudioBuffer(parsed.buffer.slice(0), duration, onEnded);
      };

      audio.onended = () => {
        this.stopAllVoicePlayback();
        onEnded();
      };

      audio.onerror = () => {
        tryWebAudioDecodeFallback();
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          tryWebAudioDecodeFallback();
        });
      }

      return () => {
        this.stopAllVoicePlayback();
      };
    } catch {
      return this.playViaWebAudioBuffer(parsed.buffer.slice(0), duration, onEnded);
    }
  }

  private playViaWebAudioBuffer(arrayBuffer: ArrayBuffer, duration: number, onEnded: () => void): () => void {
    try {
      this.initCtx();
      if (!this.ctx) {
        const t = setTimeout(onEnded, duration * 1000);
        return () => clearTimeout(t);
      }

      let cancelled = false;
      this.ctx.decodeAudioData(
        arrayBuffer,
        (audioBuffer) => {
          if (cancelled || !this.ctx) return;
          const source = this.ctx.createBufferSource();
          source.buffer = audioBuffer;
          const gain = this.ctx.createGain();
          gain.gain.value = 1.3;
          source.connect(gain);
          gain.connect(this.ctx.destination);
          this.currentVoiceSource = source;

          source.onended = () => {
            this.currentVoiceSource = null;
            if (!cancelled) onEnded();
          };
          source.start(0);
        },
        () => {
          if (!cancelled) onEnded();
        }
      );

      return () => {
        cancelled = true;
        this.stopAllVoicePlayback();
      };
    } catch {
      const t = setTimeout(onEnded, 500);
      return () => clearTimeout(t);
    }
  }
}

export const soundEngine = new SoundEngine();


