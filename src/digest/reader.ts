import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, ReadNight } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

type JobState = {
  row: DigestRow;
  firstTime: number;
  lastTime: number;
  errorTime: number;
};

// Require an explicit offset (or Z) so chronology never depends on server time zone.
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!('at' in value) || typeof value.at !== 'string' || value.at.trim() !== value.at
    || !timestampPattern.test(value.at) || !Number.isFinite(Date.parse(value.at))) return null;
  if (!('job' in value) || typeof value.job !== 'string' || value.job.trim() === '') return null;
  if (!('status' in value)
    || (value.status !== 'ok' && value.status !== 'retry' && value.status !== 'fail')) return null;
  if (!('owner' in value) || (value.owner !== null && typeof value.owner !== 'string')) return null;
  const error = 'error' in value ? value.error : undefined;
  if (error !== undefined && typeof error !== 'string') return null;

  return {
    at: value.at,
    job: value.job,
    status: value.status,
    owner: value.owner,
    error,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  // Validate before joining: an invalid identifier must never escape runsDir.
  if (night.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const jobs = new Map<string, JobState>();
  let badLines = 0;

  for (const line of contents.split('\n')) {
    if (line.trim() === '') continue;
    const event = parseEvent(line);
    if (event === null) {
      badLines += 1;
      continue;
    }

    const time = Date.parse(event.at);
    let state = jobs.get(event.job);
    if (state === undefined) {
      state = {
        row: {
          job: event.job,
          owner: event.owner,
          runs: 0,
          retries: 0,
          lastStatus: event.status,
          lastError: null,
          firstAt: event.at,
          lastAt: event.at,
        },
        firstTime: time,
        lastTime: time,
        errorTime: -Infinity,
      };
      jobs.set(event.job, state);
    }

    const { row } = state;
    row.runs += 1;
    if (event.status === 'retry') row.retries += 1;
    if (time < state.firstTime) {
      state.firstTime = time;
      row.firstAt = event.at;
    }
    if (time >= state.lastTime) {
      state.lastTime = time;
      row.lastAt = event.at;
      row.lastStatus = event.status;
      row.owner = event.owner;
    }
    if (event.error !== undefined && event.error.trim() !== '' && time >= state.errorTime) {
      state.errorTime = time;
      row.lastError = event.error;
    }
  }

  const rows = [...jobs.values()].map(({ row }) => row);
  rows.sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return { night, rows, badLines };
};
