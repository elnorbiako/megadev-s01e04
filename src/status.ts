import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import type { NightDigest } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

/**
 * Per-night summary for the board. Counts are jobs by their LAST STATUS
 * (one job = one digest row), not raw event totals.
 * Counts are null when the digest is unavailable.
 */
export type NightSummary = {
  night: string;
  href: string;
  jobs: number | null;
  ok: number | null;
  retry: number | null;
  fail: number | null;
  badLines: number | null;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  /** Kept for compatibility: night ids, newest first. */
  nights: string[];
  /** Same nights as nights, with links and job counts by last status. */
  nightSummaries: NightSummary[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function summarizeNight(night: string, digest: NightDigest | null): NightSummary {
  const base = { night, href: `/digest/${night}` };
  if (digest === null) {
    return { ...base, jobs: null, ok: null, retry: null, fail: null, badLines: null };
  }
  const count = (s: 'ok' | 'retry' | 'fail') => digest.rows.filter((r) => r.lastStatus === s).length;
  return {
    ...base,
    jobs: digest.rows.length,
    ok: count('ok'),
    retry: count('retry'),
    fail: count('fail'),
    badLines: digest.badLines,
  };
}

export function readStatus(config: RigConfig): Status {
  const nights = nightsOnDisk(config.runsDir);
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
    nightSummaries: nights.map((n) => summarizeNight(n, readNight(config.runsDir, n))),
  };
}
