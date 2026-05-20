import {readFileSync} from 'fs';
import {createTestClient, AccountSeed} from './harness';

export type DualOpts = {
  seedA: AccountSeed;
  seedB: AccountSeed;
  testDc?: boolean;
};

export async function createDualClients(opts: DualOpts) {
  const clientA = await createTestClient({
    seed: opts.seedA,
    accountNumber: 1,
    testDc: opts.testDc
  });
  const clientB = await createTestClient({
    seed: opts.seedB,
    accountNumber: 2,
    testDc: opts.testDc
  });

  return {
    A: clientA,
    B: clientB,
    dispose() {
      clientA.dispose();
      clientB.dispose();
    }
  };
}

export function loadSeed(path: string): AccountSeed {
  return JSON.parse(readFileSync(path, 'utf8')) as AccountSeed;
}
