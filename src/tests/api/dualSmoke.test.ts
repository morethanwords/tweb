import {createDualClients, loadSeed} from './dualHarness';

const ENABLED = process.env.TG_API_E2E === '1';
const seedAPath = process.env.TG_API_SEED || './tmp/seed.json';
const seedBPath = process.env.TG_API_SEED_B || './tmp/seed-b.json';
const describeOrSkip = ENABLED ? describe : describe.skip;

describeOrSkip('dual-client smoke', () => {
  test('two clients in one process can each fetch self', async() => {
    const seedA = loadSeed(seedAPath);
    const seedB = loadSeed(seedBPath);

    const dual = await createDualClients({
      seedA,
      seedB,
      testDc: process.env.TG_API_PROD_DC !== '1'
    });

    try {
      const [resA, resB] = await Promise.all([
        dual.A.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]}),
        dual.B.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]})
      ]);

      const a: any = (resA as any[])[0];
      const b: any = (resB as any[])[0];


      console.log('A says it is:', {
        id: a?.id,
        username: a?.username,
        first_name: a?.first_name,
        access_hash_present: !!a?.access_hash
      });

      console.log('B says it is:', {
        id: b?.id,
        username: b?.username,
        first_name: b?.first_name,
        access_hash_present: !!b?.access_hash
      });

      expect(a?.id).toBe(seedA.userId);
      expect(b?.id).toBe(seedB.userId);
      expect(a?.id).not.toBe(b?.id);
    } finally {
      dual.dispose();
    }
  }, 60_000);
});
