import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';
import type { ReadNight } from '../src/digest/types.js';

const night = '2026-10-28';
const fixtureDir = fileURLToPath(new URL('../runs/', import.meta.url));
const event = {
  at: '2026-10-29T01:00:00+01:00',
  job: 'lane/sync',
  status: 'ok',
  owner: 'rook',
};

let runsDir: string;

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function writeEvents(events: unknown[]) {
  writeFileSync(join(runsDir, `${night}.jsonl`), events.map((item) => JSON.stringify(item)).join('\n'));
}

describe('readNight', () => {
  it('implements the shared synchronous contract and reads the real fixture without changing it', () => {
    const reader: ReadNight = readNight;
    expect(reader(fixtureDir, night)).toEqual({
      night,
      badLines: 1,
      rows: [
        {
          job: 'digest/render', owner: null, runs: 1, retries: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
          lastStatus: 'ok', lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync', owner: 'rook', runs: 8, retries: 1,
          lastStatus: 'ok', lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0,
          lastStatus: 'fail', lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });

  it('uses chronological instants, preserves offsets, and retains the latest nonblank error after success', () => {
    // Deliberately neither file order nor timestamp-string order. Every valid
    // event counts as a run; only retry events count as retries. Latest owner
    // and status come from the latest instant, even when that owner is null.
    writeEvents([
      { ...event, at: '2026-10-29T04:00:00+02:00', owner: null },
      { ...event, at: '2026-10-29T01:45:00Z', status: 'retry', error: ' newest error ' },
      { ...event, at: '2026-10-29T02:30:00+01:00', status: 'fail', error: 'older error' },
      { ...event, at: '2026-10-28T19:00:00-05:00', status: 'retry', error: '' },
      { ...event, at: '2026-10-29T03:50:00+02:00', error: '   ' },
    ]);

    expect(readNight(runsDir, night)).toEqual({
      night,
      badLines: 0,
      rows: [{
        job: 'lane/sync', owner: null, runs: 5, retries: 2,
        lastStatus: 'ok', lastError: ' newest error ',
        firstAt: '2026-10-28T19:00:00-05:00', lastAt: '2026-10-29T04:00:00+02:00',
      }],
    });
  });

  it('uses later lines to break equal-instant ties, but keeps the first timestamp spelling', () => {
    writeEvents([
      { ...event, status: 'retry', error: 'first error' },
      { ...event, at: '2026-10-29T00:00:00Z', status: 'fail', owner: null, error: 'last error' },
    ]);
    expect(readNight(runsDir, night)?.rows).toEqual([{
      job: 'lane/sync', owner: null, runs: 2, retries: 1,
      lastStatus: 'fail', lastError: 'last error',
      firstAt: event.at, lastAt: '2026-10-29T00:00:00Z',
    }]);
  });

  it('groups arbitrary job names safely and sorts by job, not insertion order', () => {
    writeEvents([
      { ...event, job: 'z/job' },
      { ...event, job: '__proto__', owner: null },
      { ...event, job: 'a/job' },
      { ...event, job: '__proto__', owner: null, status: 'retry' },
      { ...event, job: 'A/job' },
    ]);
    expect(readNight(runsDir, night)?.rows.map(({ job, runs, retries }) => ({ job, runs, retries }))).toEqual([
      { job: 'A/job', runs: 1, retries: 0 },
      { job: '__proto__', runs: 2, retries: 1 },
      { job: 'a/job', runs: 1, retries: 0 },
      { job: 'z/job', runs: 1, retries: 0 },
    ]);
  });

  it('ignores blank lines, accepts CRLF and an unterminated final line', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), `\r\n \t\r\n${JSON.stringify(event)}\r\n\r\n${JSON.stringify(event)}`);
    const digest = readNight(runsDir, night);
    expect(digest?.badLines).toBe(0);
    expect(digest?.rows).toHaveLength(1);
    expect(digest?.rows[0].runs).toBe(2);
  });

  const invalidRecords: unknown[] = [
    null, [], 'not an object', 42, true, {},
    { job: event.job, status: 'ok', owner: null },
    { ...event, at: null },
    { ...event, at: 'not a date' },
    { ...event, at: '2026-13-29T01:00:00+01:00' },
    { ...event, at: '2026-10-29T01:00:00' },
    { at: event.at, status: 'ok', owner: null },
    { ...event, job: 1 },
    { ...event, job: '' },
    { ...event, job: '  ' },
    { at: event.at, job: event.job, owner: null },
    { ...event, status: 'unknown' },
    { ...event, status: null },
    { at: event.at, job: event.job, status: 'ok' },
    { ...event, owner: 42 },
    { ...event, error: null },
    { ...event, error: {} },
  ];

  it('counts malformed JSON and schema-invalid lines once each, then continues with valid events', () => {
    const lines = ['{"truncated":', ...invalidRecords.map((record) => JSON.stringify(record)), JSON.stringify(event)];
    writeFileSync(join(runsDir, `${night}.jsonl`), lines.join('\n'));
    const digest = readNight(runsDir, night);
    expect(digest?.badLines).toBe(1 + invalidRecords.length);
    expect(digest?.rows).toHaveLength(1);
    expect(digest?.rows[0].runs).toBe(1);
  });

  it.each(['', '\n \t\r\n'])('returns an empty digest for an existing blank file (%j)', (contents) => {
    writeFileSync(join(runsDir, `${night}.jsonl`), contents);
    expect(readNight(runsDir, night)).toEqual({ night, rows: [], badLines: 0 });
  });

  it('returns a digest rather than null when every nonblank line is bad', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), 'not json\nnull\n');
    expect(readNight(runsDir, night)).toEqual({ night, rows: [], badLines: 2 });
  });

  it('returns null for a missing night or missing runs directory', () => {
    expect(readNight(runsDir, night)).toBeNull();
    expect(readNight(join(runsDir, 'missing'), night)).toBeNull();
  });

  it.each([
    '', '../2026-10-28', '../../2026-10-28', '/2026-10-28',
    '2026-10-28/..', '..\\2026-10-28', '2026-1-2',
    '2026-10-28.jsonl', '2026-10-28\n', '2026-10-28\u0000',
  ])('rejects invalid night identifiers without reading outside runsDir (%j)', (invalidNight) => {
    writeEvents([event]);
    const nestedDir = join(runsDir, 'nested');
    mkdirSync(nestedDir);
    expect(readNight(nestedDir, invalidNight)).toBeNull();
  });

  it('propagates non-ENOENT I/O failures rather than pretending the night is missing', () => {
    const notDirectory = join(runsDir, 'regular-file');
    writeFileSync(notDirectory, 'not a directory');
    expect(() => readNight(notDirectory, night)).toThrow(expect.objectContaining({ code: 'ENOTDIR' }));

    mkdirSync(join(runsDir, `${night}.jsonl`));
    expect(() => readNight(runsDir, night)).toThrow(expect.objectContaining({ code: 'EISDIR' }));
  });
});
