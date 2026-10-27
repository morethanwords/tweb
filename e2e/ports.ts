import {createHash} from 'crypto';
import {realpathSync} from 'fs';
import {resolve} from 'path';

/*
 * The ports of the e2e servers: a block of them per checkout, a port per server in it. They were fixed (8099, 8100,
 * 8117…), the same in every checkout and worktree of the machine, and a run found another checkout's server on its
 * port: it stopped at once ("… is already used"), or, where a config takes the server it finds (playwright.config.ts),
 * tested that checkout's code. The block is counted from the checkout's path, so every process of a run — the runner
 * and its workers, which load the config again — has the same ports, and the suites of one checkout do not take each
 * other's either. 21000-32199: clear of the previews (9001-9020), 8080, cloudflared's metrics (20241-20245) and the
 * system's ephemeral ports (32768 on).
 */
const FIRST = 21_000;
const BLOCKS = 1_400;
const SLOTS = 8;
const SERVERS = ['default', 'editor', 'popups', 'popupsModules', 'focus', 'a11y'] as const;

const checkout = realpathSync(resolve(__dirname, '..'));
const block = parseInt(createHash('sha1').update(checkout).digest('hex').slice(0, 8), 16) % BLOCKS;

export default function e2ePort(server: typeof SERVERS[number]) {
  return FIRST + block * SLOTS + SERVERS.indexOf(server);
}
