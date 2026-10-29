import type { Status } from '../status.js';

const dash = (n: number | null) => (n === null ? '—' : String(n));

export function StatusBoard({ status }: { status: Status }) {
  return (
    <>
      <h1>status</h1>
      <table>
        <tbody>
          <tr><th>adapter</th><td>{status.adapter}</td></tr>
          <tr><th>installed</th><td>{status.installed}</td></tr>
          <tr>
            <th>last beat</th>
            <td>{status.lastBeat ? `${status.lastBeat.at} · pid ${status.lastBeat.pid}` : <span class="warn">none</span>}</td>
          </tr>
        </tbody>
      </table>
      <h2>nights on disk</h2>
      {status.nightSummaries.length === 0 ? (
        <p class="mute">nothing in runs/</p>
      ) : (
        <>
          <p class="mute">counts are jobs by last status, not event totals</p>
          <table>
            <thead>
              <tr><th>night</th><th>jobs</th><th>ok</th><th>retry</th><th>fail</th><th>bad lines</th></tr>
            </thead>
            <tbody>
              {status.nightSummaries.map((s) => (
                <tr>
                  <td><a href={s.href}>{s.night}</a></td>
                  <td>{dash(s.jobs)}</td>
                  <td>{dash(s.ok)}</td>
                  <td>{dash(s.retry)}</td>
                  <td>{dash(s.fail)}</td>
                  <td>{dash(s.badLines)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
