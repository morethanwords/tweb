import {describe, it, expect} from 'vitest';
import {readFileSync} from 'fs';
import {createTestClient, AccountSeed} from './harness';

const ENABLED = process.env.TG_BURST === '1';

describe.skipIf(!ENABLED)('burst send B -> A', () => {
  it('sends a burst of messages from B to A', async() => {
    const seed: AccountSeed = JSON.parse(readFileSync(process.env.TG_API_SEED_B || './tmp/seed-b.json', 'utf8'));
    const client = await createTestClient({seed, accountNumber: 1, testDc: false});

    try {
      await client.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]});

      const resolved = await client.apiManager.invokeApi('contacts.resolveUsername', {username: process.env.TG_TARGET_USERNAME || 'somewhatusername'});
      const user: any = resolved.users[0];
      console.log('resolved target', user.id, user.username);
      const peer = {_: 'inputPeerUser', user_id: user.id, access_hash: user.access_hash} as any;

      const count = +(process.env.TG_BURST_COUNT || 25);
      for(let i = 0; i < count; ++i) {
        await client.apiManager.invokeApi('messages.sendMessage', {
          peer,
          message: `burst ${i + 1}/${count} ${new Date().toISOString()}`,
          random_id: String(Date.now()) + String(Math.floor(Math.random() * 1e6))
        });
        await new Promise((r) => setTimeout(r, 120));
      }

      console.log('sent', count, 'messages');
      expect(true).toBe(true);
    } finally {
      await client.dispose?.();
    }
  }, 120000);
});
