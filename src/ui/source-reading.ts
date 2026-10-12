import { open, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface SourceReading {
  status: 'readable' | 'failed'; checked_at: string; resolved_location: string;
  preview: string; truncated: boolean; error: string | null;
}

export function sourceLocation(projectPath: string, location: string): string {
  return /^https?:\/\//i.test(location) ? new URL(location).href : resolve(projectPath, location);
}

// A bounded preview makes accessibility visible; it does not claim the Agent read the whole source.
export async function readSource(projectPath: string, location: string): Promise<SourceReading> {
  const reading: SourceReading = { status: 'failed', checked_at: new Date().toISOString(), resolved_location: location, preview: '', truncated: false, error: null };
  const limit = 64 * 1024;
  try {
    const target = sourceLocation(projectPath, location);
    reading.resolved_location = target;
    let bytes: Buffer;
    if (/^https?:\/\//i.test(target)) {
      const response = await fetch(target, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      if (!/text\/|json|xml/.test(response.headers.get('content-type') ?? '')) throw new Error('此链接不提供文本预览，请打开原文阅读');
      const reader = response.body!.getReader();
      const chunks: Buffer[] = [];
      let count = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          chunks.push(Buffer.from(value).subarray(0, limit - count));
          count += value.byteLength;
          if (count >= limit) { reading.truncated = true; break; }
        }
      } finally { await reader.cancel(); }
      bytes = Buffer.concat(chunks);
    } else {
      const info = await stat(target);
      if (info.isDirectory()) {
        const entries = await readdir(target, { withFileTypes: true });
        reading.preview = entries.slice(0, 100).map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`).join('\n');
        reading.truncated = entries.length > 100;
        reading.status = 'readable';
        return reading;
      }
      const file = await open(target, 'r');
      try {
        const result = await file.read(Buffer.alloc(Math.min(info.size, limit)), 0, Math.min(info.size, limit), 0);
        bytes = result.buffer.subarray(0, result.bytesRead);
        reading.truncated = info.size > limit;
      } finally { await file.close(); }
      if (bytes.includes(0) || bytes.subarray(0, 4).toString() === '%PDF') throw new Error('此文件不支持文本预览，请打开原文阅读');
    }
    reading.preview = bytes.toString('utf8');
    reading.status = 'readable';
  } catch (error) { reading.error = error instanceof Error ? error.message : String(error); }
  return reading;
}
