import fs from 'fs';
import path from 'path';

// Helper to encode raw audio data into a valid 16-bit PCM WAV file
function createWavBuffer(sampleRate, samples) {
  const byteRate = sampleRate * 2; // 1 channel, 16-bit (2 bytes)
  const blockAlign = 2;
  const dataLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataLength);

  // RIFF identifier
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // SubChunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(1, 22);  // NumChannels (1 = Mono)
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  // Write samples (clamped between -1 and 1)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const intSample = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buffer.writeInt16LE(Math.round(intSample), 44 + i * 2);
  }

  return buffer;
}

const SAMPLE_RATE = 22050; // High efficiency & great sound fidelity
const DURATION_SEC = 16;   // 16 seconds loop (seamlessly repeatable)
const TOTAL_SAMPLES = SAMPLE_RATE * DURATION_SEC;

const outputDir = path.resolve('public/assets/audio');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('Generating real ambient audio for Bouclier Anti-Scroll...');

// ==========================================
// 1. SHIELD 432Hz SOFT WARM AMBIENT PAD (NO SINE BEEP)
// ==========================================
console.log('1. Generating shield_432hz.wav...');
const samples432 = new Float32Array(TOTAL_SAMPLES);
let warmAir0 = 0, warmAir1 = 0, warmAir2 = 0;
for (let i = 0; i < TOTAL_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;

  // Seamless loop envelope (smooth crossfade at start/end of 16s)
  let loopEnv = 1.0;
  if (t < 1.5) loopEnv = Math.sin((t / 1.5) * (Math.PI / 2));
  else if (t > DURATION_SEC - 1.5) loopEnv = Math.sin(((DURATION_SEC - t) / 1.5) * (Math.PI / 2));

  // Very soft, warm filtered breeze texture (deeply low-passed pink noise)
  const white = Math.random() * 2 - 1;
  warmAir0 = 0.995 * warmAir0 + 0.005 * white;
  warmAir1 = 0.992 * warmAir1 + 0.008 * warmAir0;
  warmAir2 = 0.990 * warmAir2 + 0.010 * warmAir1;

  // Slow 8-second breathing swell (0.125 Hz)
  const breath = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.125 * t - Math.PI / 2);
  const breath2 = 0.55 + 0.45 * Math.cos(2 * Math.PI * 0.0625 * t);

  // Soft acoustic plucked harp/chime notes in 432Hz tuning (C3=128Hz, G3=192Hz, C4=256Hz, E4=324Hz)
  // Softly decaying gentle notes every 4 seconds instead of a continuous sine drone
  const noteIdx = Math.floor(t / 4.0);
  const noteTime = t % 4.0;
  const noteFreqs = [256.0, 192.0, 216.0, 162.0];
  const noteFreq = noteFreqs[noteIdx % noteFreqs.length];
  const noteEnv = Math.sin(Math.min(1, noteTime / 0.15) * (Math.PI / 2)) * Math.exp(-noteTime * 1.15);
  const gentleNote =
    (Math.sin(2 * Math.PI * noteFreq * t) * 0.6 +
      Math.sin(2 * Math.PI * (noteFreq * 0.5) * t) * 0.4) *
    noteEnv *
    0.14;

  // Warm deep velvet bass foundation (108 Hz & 162 Hz fifth, very low volume)
  const deepPad =
    (Math.sin(2 * Math.PI * 108 * t) * 0.08 +
      Math.sin(2 * Math.PI * 162 * t) * 0.05 * breath2) *
    breath;

  samples432[i] = (warmAir2 * 0.45 * breath + deepPad + gentleNote) * loopEnv * 0.55;
}
fs.writeFileSync(path.join(outputDir, 'shield_432hz.wav'), createWavBuffer(SAMPLE_RATE, samples432));

// ==========================================
// 2. SHIELD GENTLE RAIN & DISTANT THUNDER
// ==========================================
console.log('2. Generating shield_rain.wav...');
const samplesRain = new Float32Array(TOTAL_SAMPLES);
let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

for (let i = 0; i < TOTAL_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;

  // Pink noise algorithm (Paul Kellet's filtered pink noise)
  const white = Math.random() * 2 - 1;
  b0 = 0.99886 * b0 + white * 0.0555179;
  b1 = 0.99332 * b1 + white * 0.0750759;
  b2 = 0.96900 * b2 + white * 0.1538520;
  b3 = 0.86650 * b3 + white * 0.3104856;
  b4 = 0.55000 * b4 + white * 0.5329522;
  b5 = -0.7616 * b5 - white * 0.0168980;
  const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
  b6 = white * 0.115926;

  // Occasional distinct raindrops
  let drop = 0;
  if (Math.random() < 0.012) {
    drop = (Math.random() * 2 - 1) * 0.35;
  }

  // Soft distant thunder roll around 6s to 10s
  let thunder = 0;
  if (t > 4 && t < 12) {
    const thunderEnv = Math.sin(((t - 4) / 8) * Math.PI);
    thunder = Math.sin(2 * Math.PI * 45 * t + Math.sin(2 * Math.PI * 7 * t)) * thunderEnv * 0.22;
  }

  // Steady soothing rain texture
  samplesRain[i] = (pink * 0.75 + drop + thunder) * 0.7;
}
fs.writeFileSync(path.join(outputDir, 'shield_rain.wav'), createWavBuffer(SAMPLE_RATE, samplesRain));

// ==========================================
// 3. SHIELD CAMPFIRE CRACKLES & WARM EMBERS
// ==========================================
console.log('3. Generating shield_campfire.wav...');
const samplesFire = new Float32Array(TOTAL_SAMPLES);
let fireLow = 0;
for (let i = 0; i < TOTAL_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;

  // Warm gentle low air turbulence
  const white = Math.random() * 2 - 1;
  fireLow = 0.96 * fireLow + 0.04 * white;

  // Randomized wood crackles and popping embers
  let crackle = 0;
  if (Math.random() < 0.008) {
    crackle = (Math.random() > 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.5);
  }
  // Soft snap bursts
  let snap = 0;
  if (Math.random() < 0.002) {
    snap = Math.sin(2 * Math.PI * 1800 * t) * 0.45;
  }

  const emberBreath = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.3 * t);
  samplesFire[i] = (fireLow * 0.65 + crackle + snap) * emberBreath * 0.65;
}
fs.writeFileSync(path.join(outputDir, 'shield_campfire.wav'), createWavBuffer(SAMPLE_RATE, samplesFire));

// ==========================================
// 4. SHIELD FOREST STREAM SANCTUARY
// ==========================================
console.log('4. Generating shield_forest_stream.wav...');
const samplesStream = new Float32Array(TOTAL_SAMPLES);
let streamFilter = 0;
for (let i = 0; i < TOTAL_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;

  // Water flow resonance: modulated filtered noise simulating babbling brook
  const white = Math.random() * 2 - 1;
  const modFreq = 0.35 + 0.2 * Math.sin(2 * Math.PI * 0.25 * t);
  streamFilter = 0.88 * streamFilter + 0.12 * white;

  // Water droplets & small bubble resonance
  let bubble = 0;
  if (Math.random() < 0.015) {
    const bubbleFreq = 600 + Math.random() * 900;
    bubble = Math.sin(2 * Math.PI * bubbleFreq * t) * 0.25;
  }

  // Soft high frequencies of rushing water
  const trickle = white * 0.08 * (0.8 + 0.2 * Math.sin(2 * Math.PI * 1.5 * t));

  samplesStream[i] = (streamFilter * 0.6 + bubble + trickle) * 0.7;
}
fs.writeFileSync(path.join(outputDir, 'shield_forest_stream.wav'), createWavBuffer(SAMPLE_RATE, samplesStream));

// ==========================================
// 5. SHIELD TIBETAN BOWL RESONANCE
// ==========================================
console.log('5. Generating shield_tibetan_bell.wav...');
const samplesBowl = new Float32Array(TOTAL_SAMPLES);
for (let i = 0; i < TOTAL_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;

  // 2 strikes across the 16s loop (at 0.2s and at 8.2s)
  const strike1Time = t - 0.2;
  const strike2Time = t - 8.2;

  let strike1 = 0;
  if (strike1Time >= 0) {
    const env = Math.exp(-strike1Time * 0.55);
    const fundamental = Math.sin(2 * Math.PI * 256 * strike1Time);
    const harmonic1 = Math.sin(2 * Math.PI * 512 * strike1Time) * 0.5;
    const harmonic2 = Math.sin(2 * Math.PI * 768 * strike1Time) * 0.3;
    const shimmer = Math.sin(2 * Math.PI * 1536 * strike1Time) * 0.15;
    strike1 = (fundamental + harmonic1 + harmonic2 + shimmer) * env;
  }

  let strike2 = 0;
  if (strike2Time >= 0) {
    const env = Math.exp(-strike2Time * 0.55);
    const fundamental = Math.sin(2 * Math.PI * 288 * strike2Time); // Higher pitch bowl
    const harmonic1 = Math.sin(2 * Math.PI * 576 * strike2Time) * 0.5;
    const harmonic2 = Math.sin(2 * Math.PI * 864 * strike2Time) * 0.3;
    strike2 = (fundamental + harmonic1 + harmonic2) * env;
  }

  // Background celestial pad
  const pad = Math.sin(2 * Math.PI * 128 * t) * 0.15 * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.1 * t));

  samplesBowl[i] = (strike1 * 0.45 + strike2 * 0.45 + pad) * 0.75;
}
fs.writeFileSync(path.join(outputDir, 'shield_tibetan_bell.wav'), createWavBuffer(SAMPLE_RATE, samplesBowl));

console.log('All real Bouclier Anti-Scroll audios successfully generated in public/assets/audio/ !');
