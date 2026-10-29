import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { lane } from '../lane.js';
import { Layout } from '../views/layout.js';
import { DigestView } from '../views/digest.js';
import { readNight } from './reader.js';

export function registerDigestPage(app: Hono, config: RigConfig): void {
  app.get('/digest/:night', (c) => {
    const digest = readNight(config.runsDir, c.req.param('night'));
    if (digest === null) {
      return c.html(
        <Layout title="digest" lane={lane()}>
          <h1>not found</h1>
          <p class="mute">no run log for this night</p>
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title={`digest · ${digest.night}`} lane={lane()}>
        <DigestView digest={digest} />
      </Layout>,
    );
  });
}
