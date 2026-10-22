// Reads a recording or render as mono: WAV directly, any other format through ffmpeg when it is installed.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const DECODE_SAMPLE_RATE_HZ = 48000;

function readWav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format = null;
  let data = null;
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = bytes.toString('ascii', at, at + 4);
    const size = view.getUint32(at + 4, true);
    if (id === 'fmt ') {
      const tag = view.getUint16(at + 8, true);
      format = { tag: tag === 0xfffe ? view.getUint16(at + 32, true) : tag, channels: view.getUint16(at + 10, true), sampleRate: view.getUint32(at + 12, true), bits: view.getUint16(at + 22, true) };
    }
    if (id === 'data') data = { at: at + 8, size: Math.min(size, bytes.length - at - 8) };
    at += 8 + size + (size % 2);
  }
  const { tag, channels, sampleRate, bits } = format;
  const width = bits / 8;
  const frames = Math.floor(data.size / (width * channels));
  const mono = new Float64Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const at = data.at + (frame * channels + channel) * width;
      if (tag === 3) sum += bits === 64 ? view.getFloat64(at, true) : view.getFloat32(at, true);
      else if (bits === 16) sum += view.getInt16(at, true) / 32768;
      else if (bits === 24) sum += ((view.getUint8(at) | view.getUint8(at + 1) << 8 | view.getInt8(at + 2) << 16)) / 8388608;
      else sum += view.getInt32(at, true) / 2147483648;
    }
    mono[frame] = sum / channels;
  }
  return { samples: mono, sampleRate };
}

function decode(file) {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(DECODE_SAMPLE_RATE_HZ), '-f', 'f32le', '-'], { maxBuffer: 2 ** 31 });
  if (result.error || result.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${result.error?.message ?? result.stderr}`);
  const bytes = result.stdout;
  const floats = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 4));
  return { samples: Float64Array.from(floats), sampleRate: DECODE_SAMPLE_RATE_HZ };
}

export function readAudio(file) {
  const bytes = readFileSync(file);
  const isWav = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE';
  return isWav ? readWav(bytes) : decode(file);
}
