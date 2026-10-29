import { describe, expect, it } from 'vitest';
import type { NightDigest } from '../src/digest/types.js';
import { DigestView } from '../src/views/digest.js';

async function render(digest: NightDigest): Promise<string> {
  return await (<DigestView digest={digest} />).toString();
}

const base = {
  owner: 'rook',
  runs: 1,
  retries: 0,
  lastStatus: 'ok' as const,
  lastError: null,
  firstAt: '2026-10-28T02:00:00+01:00',
  lastAt: '2026-10-28T02:00:00+01:00',
};

describe('digest view', () => {
  it('says nothing ran for an empty night', async () => {
    const html = await render({ night: '2026-10-28', rows: [], badLines: 0 });
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });

  it('renders null owner as a dash and warns on retries >= 3 and fail', async () => {
    const html = await render({
      night: '2026-10-28',
      badLines: 0,
      rows: [
        { ...base, job: 'a', owner: null, runs: 4, retries: 3, lastStatus: 'retry', lastError: 'timeout' },
        { ...base, job: 'b', retries: 2, lastStatus: 'fail', lastError: 'boom' },
      ],
    });
    expect(html).toContain('<td>—</td>');
    expect(html).toContain('<td class="warn">3</td>');
    expect(html).toContain('<td class="warn">fail</td>');
    expect(html).toContain('boom');
    expect(html).toContain('<td>2</td>');
  });

  it('warns about bad lines only when there are some', async () => {
    const clean = await render({ night: '2026-10-28', rows: [], badLines: 0 });
    const dirty = await render({ night: '2026-10-28', rows: [], badLines: 1 });
    expect(clean).not.toContain('unreadable');
    expect(dirty).toContain('1 unreadable line skipped');
  });
});
