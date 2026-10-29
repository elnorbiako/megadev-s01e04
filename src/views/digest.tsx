import type { DigestRow, NightDigest } from '../digest/types.js';

const RETRY_WARN_AT = 3;

function orDash(value: string | null): string {
  return value ?? '—';
}

function DigestTable({ row }: { row: DigestRow }) {
  const retriesWarn = row.retries >= RETRY_WARN_AT;
  const failWarn = row.lastStatus === 'fail';
  return (
    <tr>
      <td>{row.job}</td>
      <td>{orDash(row.owner)}</td>
      <td>{row.runs}</td>
      <td class={retriesWarn ? 'warn' : undefined}>{row.retries}</td>
      <td class={failWarn ? 'warn' : undefined}>{row.lastStatus}</td>
      <td class={row.lastError ? undefined : 'mute'}>{orDash(row.lastError)}</td>
      <td>{row.firstAt}</td>
      <td>{row.lastAt}</td>
    </tr>
  );
}

export function DigestView({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.badLines > 0 ? (
        <p class="warn">
          {digest.badLines} unreadable {digest.badLines === 1 ? 'line' : 'lines'} skipped
        </p>
      ) : null}
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <DigestTable row={row} />
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
