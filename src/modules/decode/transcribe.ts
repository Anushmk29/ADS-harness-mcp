import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Spoken-word transcripts for decoded videos. ffmpeg pulls a short mono audio clip straight from
// the video URL; Groq or OpenAI Whisper transcribe it when a key is set, otherwise local
// faster-whisper does (free, slower). Any failure leaves that item caption-only.

const run = promisify(execFile);
export interface Segment { start: number; text: string }
export interface Transcript { text: string; segments: Segment[] }
export interface Transcriber {
  name: string;
  /** One result per file, null where that file failed. costUsd covers the whole call. */
  transcribe(files: string[]): Promise<{ results: Array<Transcript | null>; costUsd: number }>;
}

const MAX_SECONDS = 90;

export async function extractAudio(videoUrl: string, out: string): Promise<boolean> {
  try {
    await run(process.env.DECODE_FFMPEG ?? 'ffmpeg', ['-y', '-loglevel', 'error', '-i', videoUrl, '-t', String(MAX_SECONDS), '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', out], { timeout: 90_000 });
    return fs.existsSync(out) && fs.statSync(out).size > 1000;
  } catch { return false; }
}

/** "[0:04] text" lines, the shape the classifier reads. */
export function timestamped(t: Transcript): string {
  return t.segments.map(s => `[${Math.floor(s.start / 60)}:${String(Math.floor(s.start % 60)).padStart(2, '0')}] ${s.text}`).join('\n');
}

function apiTranscriber(name: string, url: string, key: string, model: string, usdPerHour: number, fetchImpl: typeof fetch): Transcriber {
  return {
    name,
    async transcribe(files) {
      let seconds = 0;
      const results = await Promise.all(files.map(async file => {
        try {
          const form = new FormData();
          form.append('file', new Blob([fs.readFileSync(file)], { type: 'audio/mpeg' }), path.basename(file));
          form.append('model', model);
          form.append('response_format', 'verbose_json');
          const res = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(120_000) });
          if (!res.ok) return null;
          const body = await res.json() as any;
          seconds += Number(body.duration) || 0;
          const segments = (body.segments ?? []).map((s: any) => ({ start: Math.round(Number(s.start) * 10) / 10, text: String(s.text ?? '').trim() }));
          return { text: String(body.text ?? '').trim(), segments };
        } catch { return null; }
      }));
      return { results, costUsd: (seconds / 3600) * usdPerHour };
    }
  };
}

const LOCAL_SCRIPT = `
import sys, json
from faster_whisper import WhisperModel
m = WhisperModel(sys.argv[1], device="cpu", compute_type="int8")
out = []
for p in sys.argv[2:]:
    try:
        segs, _ = m.transcribe(p, vad_filter=True)
        s = [{"start": round(x.start, 1), "text": x.text.strip()} for x in segs]
        out.append({"text": " ".join(x["text"] for x in s), "segments": s})
    except Exception:
        out.append(None)
print(json.dumps(out))
`;

function localTranscriber(): Transcriber {
  const model = process.env.DECODE_WHISPER_MODEL ?? 'base';
  return {
    name: `local faster-whisper (${model})`,
    async transcribe(files) {
      const python = process.env.DECODE_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
      const { stdout } = await run(python, ['-c', LOCAL_SCRIPT, model, ...files], { timeout: 30 * 60_000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
      return { results: JSON.parse(stdout.trim().split('\n').pop() ?? '[]'), costUsd: 0 };
    }
  };
}

/** Groq (cheapest) > OpenAI > local faster-whisper; DECODE_TRANSCRIBE=off disables it. */
export function pickTranscriber(fetchImpl: typeof fetch = fetch): Transcriber | null {
  const choice = process.env.DECODE_TRANSCRIBE;
  if (choice === 'off') return null;
  if (process.env.GROQ_API_KEY && (!choice || choice === 'groq')) {
    return apiTranscriber('groq whisper-large-v3', 'https://api.groq.com/openai/v1/audio/transcriptions', process.env.GROQ_API_KEY, 'whisper-large-v3', 0.111, fetchImpl);
  }
  if (process.env.OPENAI_API_KEY && (!choice || choice === 'openai')) {
    return apiTranscriber('openai whisper-1', 'https://api.openai.com/v1/audio/transcriptions', process.env.OPENAI_API_KEY, 'whisper-1', 0.36, fetchImpl);
  }
  return localTranscriber();
}
