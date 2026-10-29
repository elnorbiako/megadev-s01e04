export type DigestStatus = 'ok' | 'retry' | 'fail';

/** One job's valid events, aggregated by timestamp (later lines win ties). */
export type DigestRow = {
  job: string;
  /** Owner from the latest event, including an explicit null. */
  owner: string | null;
  /** Number of valid events, including retry and fail events. */
  runs: number;
  /** Number of events whose status is retry. */
  retries: number;
  lastStatus: DigestStatus;
  /** Most recent nonempty error, retained even after a later success. */
  lastError: string | null;
  /** Original timestamp strings, with their logged offsets preserved. */
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  night: string;
  /** One row per job, sorted by job in ascending string order. */
  rows: DigestRow[];
  /** Malformed JSON or schema-invalid nonblank lines. */
  badLines: number;
};

/**
 * Synchronous reader implemented and exported as readNight in ./reader.ts.
 * Import that module for the runtime function; this module exports types only.
 * Reads <runsDir>/<night>.jsonl, accepting only YYYY-MM-DD night identifiers.
 * Returns null for a missing file or invalid night identifier. Other I/O errors
 * propagate. An existing empty file yields an empty digest, not null.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
