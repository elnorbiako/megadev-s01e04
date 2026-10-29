import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readStatus, summarizeNight } from '../src/status.js';
import { readNight } from '../src/digest/reader.js';
import type { RigConfig } from '../src/config.js';

const base = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };
const fixtures: RigConfig = { ...base, runsDir: 'runs' };
const tempDirs: string[] = [];
function tempRunsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('status board night links', () => {
  it('links every fixture night to its digest and labels counts by last status', async () => {
    const res = await createApp(fixtures).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('by last status');
  });

  it('summaries match the digest counts and keep nights as before', () => {
    const status = readStatus(fixtures);
    expect(status.nights).toEqual(['2026-10-28', '2026-10-27']);
    expect(status.nightSummaries.map((s) => s.night)).toEqual(status.nights);
    for (const s of status.nightSummaries) {
      const d = readNight('runs', s.night);
      expect(d).not.toBeNull();
      const expected = summarizeNight(s.night, d);
      expect(s).toEqual(expected);
      expect(s.href).toBe(`/digest/${s.night}`);
      expect((s.ok ?? 0) + (s.retry ?? 0) + (s.fail ?? 0)).toBe(s.jobs);
    }
  });

  it('an empty night file is a zero-count summary, not a dash', () => {
    const dir = tempRunsDir();
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    mkdirSync(join(dir, 'ignored'));
    const status = readStatus({ ...base, runsDir: dir });
    expect(status.nights).toEqual(['2026-01-02']);
    expect(status.nightSummaries[0]).toEqual({
      night: '2026-01-02', href: '/digest/2026-01-02', jobs: 0, ok: 0, retry: 0, fail: 0, badLines: 0,
    });
  });

  it('an empty runs directory renders the empty message', async () => {
    const dir = tempRunsDir();
    const html = await (await createApp({ ...base, runsDir: dir }).request('/')).text();
    expect(html).toContain('nothing in runs/');
    expect(html).not.toContain('/digest/');
  });
});
