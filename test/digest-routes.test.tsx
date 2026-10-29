import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest, DigestRow } from '../src/digest/types.js';

const NIGHT = '2026-10-28';
const EMPTY_NIGHT = '2026-10-29';

const lines = [
  '{"at":"2026-10-28T23:00:06+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-10-28T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
  '{"at":"2026-10-29T01:30:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-29T01:31:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-29T01:33:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-29T01:37:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
  '{"at":"2026-10-29T04:00:01+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
  '{"at":"2026-10-29T05:41:09+01:00","job":"digest/render","status":"ok","owner":null}',
];

let runsDir: string;
const savedMarker = process.env.LANE_MARKER;

function app() {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

function jobsInHtml(html: string, jobs: string[]): string[] {
  return jobs
    .map((job) => ({ job, at: html.indexOf(job) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.job);
}

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(runsDir, `${NIGHT}.jsonl`), lines.join('\n') + '\n');
  writeFileSync(join(runsDir, `${EMPTY_NIGHT}.jsonl`), '');
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
  if (savedMarker === undefined) delete process.env.LANE_MARKER;
  else process.env.LANE_MARKER = savedMarker;
});

describe('GET /digest/:night (page)', () => {
  it('returns a self-contained HTML page with the layout and lane banner', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await app().request(`/digest/${NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('<style>');
  });

  it('contains no scripts (no client JS, ADR 0001)', async () => {
    const res = await app().request(`/digest/${NIGHT}`);
    expect(await res.text()).not.toMatch(/<script/i);
  });

  it('returns 404 for a night with no file', async () => {
    const res = await app().request('/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('returns 404 for an invalid night identifier', async () => {
    const res = await app().request('/digest/..%2Fsecret');
    expect(res.status).toBe(404);
  });

  it('renders "nothing ran" for an existing empty file', async () => {
    const res = await app().request(`/digest/${EMPTY_NIGHT}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/nothing ran/i);
  });

  it('lists jobs in ascending job order', async () => {
    const html = await (await app().request(`/digest/${NIGHT}`)).text();
    const jobs = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs'];
    expect(jobsInHtml(html, jobs)).toEqual(jobs);
  });

  it('keeps the logged timestamp offsets', async () => {
    const html = await (await app().request(`/digest/${NIGHT}`)).text();
    expect(html).toContain('2026-10-28T23:00:02+01:00');
    expect(html).toContain('2026-10-29T01:37:00+01:00');
  });

  it('renders a null owner as —', async () => {
    const html = await (await app().request(`/digest/${NIGHT}`)).text();
    expect(html).toContain('—');
    expect(html).not.toContain('null');
  });

  it('marks retries of 3 or more and fail jobs', async () => {
    const html = await (await app().request(`/digest/${NIGHT}`)).text();
    const rowFor = (job: string) => {
      const start = html.indexOf(job);
      const end = html.indexOf('</tr>', start);
      return html.slice(start, end);
    };
    expect(rowFor('fixtures/refresh')).toMatch(/warn/);
    expect(rowFor('notes/backup')).toMatch(/warn/);
    expect(rowFor('lane/sync')).not.toMatch(/warn/);
  });

  it('shows a warning for malformed lines', async () => {
    writeFileSync(join(runsDir, '2026-10-30.jsonl'), 'not json\n' + lines[0] + '\n');
    const res = await app().request('/digest/2026-10-30');
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/bad line|malformed/i);
  });

  it('escapes the lane banner', async () => {
    process.env.LANE_MARKER = '<img src=x onerror=alert(1)>';
    const html = await (await app().request(`/digest/${NIGHT}`)).text();
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('returns the NightDigest envelope', async () => {
    const res = await app().request(`/api/digest/${NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as NightDigest;
    expect(body.night).toBe(NIGHT);
    expect(body.badLines).toBe(0);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.length).toBe(5);
  });

  it('returns 404 JSON for a missing night', async () => {
    const res = await app().request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'night not found' });
  });

  it('returns an empty rows array for an empty file', async () => {
    const res = await app().request(`/api/digest/${EMPTY_NIGHT}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: EMPTY_NIGHT, rows: [], badLines: 0 });
  });

  it('counts malformed lines in badLines', async () => {
    writeFileSync(join(runsDir, '2026-10-30.jsonl'), 'not json\n' + lines[0] + '\n');
    const body = (await (await app().request('/api/digest/2026-10-30')).json()) as NightDigest;
    expect(body.badLines).toBe(1);
    expect(body.rows.length).toBe(1);
  });

  it('keeps timestamps with their offsets', async () => {
    const body = (await (await app().request(`/api/digest/${NIGHT}`)).json()) as NightDigest;
    const fixtures = body.rows.find((r) => r.job === 'fixtures/refresh');
    expect(fixtures?.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(fixtures?.lastAt).toBe('2026-10-29T01:37:00+01:00');
  });

  it('counts retries and reports fail status', async () => {
    const body = (await (await app().request(`/api/digest/${NIGHT}`)).json()) as NightDigest;
    const byJob = new Map<string, DigestRow>(body.rows.map((r) => [r.job, r]));
    expect(byJob.get('fixtures/refresh')?.retries).toBeGreaterThanOrEqual(3);
    expect(byJob.get('fixtures/refresh')?.lastStatus).toBe('ok');
    expect(byJob.get('notes/backup')?.lastStatus).toBe('fail');
    expect(byJob.get('notes/backup')?.lastError).toBe('quota exceeded');
  });

  it('keeps a null owner as null', async () => {
    const body = (await (await app().request(`/api/digest/${NIGHT}`)).json()) as NightDigest;
    expect(body.rows.find((r) => r.job === 'digest/render')?.owner).toBeNull();
  });

  it('lists rows in ascending job order', async () => {
    const body = (await (await app().request(`/api/digest/${NIGHT}`)).json()) as NightDigest;
    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toEqual([...jobs].sort());
  });

  it('agrees with the page on job order', async () => {
    const html = await (await app().request(`/digest/${NIGHT}`)).text();
    const body = (await (await app().request(`/api/digest/${NIGHT}`)).json()) as NightDigest;
    const jobs = body.rows.map((r) => r.job);
    expect(jobsInHtml(html, jobs)).toEqual(jobs);
  });
});
