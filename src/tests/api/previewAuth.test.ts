/**
 * Verifies the "preview authorization" procedure:
 * a preview must NOT reuse the seed auth keys (parallel use logs them out) —
 * instead it gets a fresh, independent authorization minted via a real login.
 *
 * The seed accounts are PRODUCTION accounts, so the login code is not
 * deterministic — it is delivered, in-app, as a message in the Telegram
 * service chat (777000). The still-authorized seed session is used to read it.
 *
 * Phases:
 *   1. probe  — boot with the seed: discover the phone + remember the latest
 *               message id in the Telegram service chat (777000)
 *   2. login  — boot with NO keys (fresh DH handshake) and run the real
 *               auth.sendCode flow; read the login code via the seed session,
 *               then auth.signIn -> auth.checkPassword
 *   3. verify — the new key differs from the seed key, the new session works,
 *               and the original seed session is still alive (not logged out)
 *   4. emit   — write the fresh keys to tmp/seed-preview.json for the preview
 *
 * Run (production seed):
 *   TG_API_TEST=1 TG_API_PROD_DC=1 TG_API_SEED=./tmp/seed.json \
 *     pnpm test src/tests/api/previewAuth
 */

import {readFileSync, writeFileSync, mkdirSync} from 'fs';
import {dirname} from 'path';
import {createTestClient, AccountSeed, TrueDcSeed} from './harness';

const ENABLED = process.env.TG_API_TEST === '1';
const seedPath = process.env.TG_API_SEED;
const describeOrSkip = ENABLED && seedPath ? describe : describe.skip;

// cloud (2FA) password for the seed accounts is a single space
const CLOUD_PASSWORD = ' ';
// Telegram service notifications peer — login codes are delivered here in-app
const TELEGRAM_SERVICE_ID = 777000;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Pull a login code of `codeLength` digits out of a service message. */
function extractLoginCode(text: string, codeLength: number): string | undefined {
  if(!text) return undefined;
  // Telegram may print the code split by a space/hyphen ("12 345"): join those
  const joined = text.replace(/(\d)[\s\-]+(\d)/g, '$1$2');
  const standalone = joined.match(new RegExp(`(?<!\\d)\\d{${codeLength}}(?!\\d)`));
  return standalone?.[0];
}

/**
 * The harness boots the full manager stack, whose managers fire authenticated
 * startup requests (sticker sets, attach-menu bots, content settings, …). On a
 * not-yet-logged-in login client those would 401 and spiral into forced
 * logouts / unhandled rejections. A real login screen issues none of them, so
 * we mute every API call that is not part of the login flow — booting the
 * harness into a genuine "logged out" state. Returns a restore function.
 */
async function muteManagerStorm(): Promise<() => void> {
  const {ApiManager} = await import('@appManagers/apiManager');
  const proto: any = ApiManager.prototype;

  const allowed = (method: string) =>
    typeof method === 'string' && (
      method.startsWith('auth.') ||
      method.startsWith('help.') ||
      method === 'account.getPassword' ||
      method === 'users.getUsers' ||
      method === 'messages.getHistory'
    );
  const hang = () => new Promise(() => {}); // never settles -> no call, no rejection

  const originals: Record<string, any> = {};
  for(const name of ['invokeApi', 'invokeApiAfter', 'invokeApiSingle']) {
    originals[name] = proto[name];
    proto[name] = function(method: string, ...rest: any[]) {
      return allowed(method) ? originals[name].call(this, method, ...rest) : hang();
    };
  }
  originals.invokeApiSingleProcess = proto.invokeApiSingleProcess;
  proto.invokeApiSingleProcess = function(o: any) {
    return allowed(o?.method) ? originals.invokeApiSingleProcess.call(this, o) : hang();
  };

  return () => {
    for(const name in originals) proto[name] = originals[name];
  };
}

describeOrSkip('preview auth', () => {
  test('mint a fresh independent authorization for a preview', async() => {
    const seed = JSON.parse(readFileSync(seedPath!, 'utf8')) as AccountSeed;
    const testDc = process.env.TG_API_PROD_DC !== '1';
    const homeDc = seed.dcId as TrueDcSeed;

    // patch the manager stack into a logged-out state before any client boots
    const restoreApi = await muteManagerStorm();

    try {
      // ---- Phase 1: probe the seed session ----
      const probe = await createTestClient({seed, testDc, accountNumber: 1});

      const probeSelf: any = await probe.apiManager.invokeApi('users.getUsers', {
        id: [{_: 'inputUserSelf'}]
      });
      const phone: string = String(probeSelf?.[0]?.phone || '').replace(/\D/g, '');
      console.log(`[previewAuth] seed account: userId=${seed.userId} dc=${homeDc} phone=${phone}`);
      expect(phone.length).toBeGreaterThan(0);

      const servicePeer = {_: 'inputPeerUser', user_id: TELEGRAM_SERVICE_ID, access_hash: '0'};
      const serviceHistory = (limit: number) => probe.apiManager.invokeApi('messages.getHistory', {
        peer: servicePeer as any,
        offset_id: 0,
        offset_date: 0,
        add_offset: 0,
        limit,
        max_id: 0,
        min_id: 0,
        hash: '0'
      });

      const beforeHistory: any = await serviceHistory(1);
      const beforeTopId: number = beforeHistory?.messages?.[0]?.id || 0;

      // ---- Phase 2: fresh login on an empty account slot ----
      // empty authKeys -> the harness boots with no key -> a fresh DH handshake runs
      const freshSeed: AccountSeed = {userId: seed.userId, dcId: seed.dcId, authKeys: {}};
      const fresh = await createTestClient({seed: freshSeed, testDc, accountNumber: 2});

      const App = (await import('@config/app')).default;
      const sentCode: any = await fresh.apiManager.invokeApi('auth.sendCode', {
        phone_number: phone,
        api_id: App.id,
        api_hash: App.hash,
        settings: {_: 'codeSettings', pFlags: {}}
      });
      expect(sentCode?.phone_code_hash).toBeTruthy();
      const codeLength: number = sentCode?.type?.length || 5;
      console.log(`[previewAuth] auth.sendCode ok — type=${sentCode?.type?._} length=${codeLength}`);

      // read the login code from the Telegram service chat via the seed session
      let code: string | undefined;
      for(let attempt = 0; attempt < 20 && !code; attempt++) {
        await delay(1500);
        const history: any = await serviceHistory(5);
        for(const message of history?.messages || []) {
          if(message.id <= beforeTopId || typeof message.message !== 'string') continue;
          const candidate = extractLoginCode(message.message, codeLength);
          if(candidate) {
            code = candidate;
            break;
          }
        }
      }
      if(!code) {
        throw new Error(
          `[previewAuth] login code not found (sendCode type=${sentCode?.type?._}). ` +
          'A production account with an active session should receive it in-app (777000).'
        );
      }
      console.log(`[previewAuth] login code received: ${code}`);

      let auth: any;
      let needsPassword = false;
      try {
        auth = await fresh.apiManager.invokeApi('auth.signIn', {
          phone_number: phone,
          phone_code_hash: sentCode.phone_code_hash,
          phone_code: code
        }, {ignoreErrors: true});
      } catch(err: any) {
        if(err?.type === 'SESSION_PASSWORD_NEEDED') needsPassword = true;
        else throw err;
      }

      if(needsPassword) {
        console.log('[previewAuth] SESSION_PASSWORD_NEEDED — checking cloud password');
        const passwordState = await fresh.managers.passwordManager.getState();
        auth = await fresh.managers.passwordManager.check(CLOUD_PASSWORD, passwordState);
      }

      expect(auth?._).toBe('auth.authorization');
      expect(String(auth.user?.id)).toBe(String(seed.userId));

      // ---- Phase 3: verify independence ----
      const sessionStorage = (await import('@lib/sessionStorage')).default;
      const account2: any = await sessionStorage.get('account2' as any);
      const newKey: string = account2?.[`dc${homeDc}_auth_key`];
      const seedKey = seed.authKeys[homeDc]?.key;

      expect(newKey?.length).toBe(512);
      expect(newKey).not.toBe(seedKey); // fresh key, not a copy of the seed

      // the new session works
      const freshSelf: any = await fresh.apiManager.invokeApi('users.getUsers', {
        id: [{_: 'inputUserSelf'}]
      });
      expect(String(freshSelf?.[0]?.id)).toBe(String(seed.userId));

      // the original seed session is still alive (a new login does not log it out)
      const probeSelfAgain: any = await probe.apiManager.invokeApi('users.getUsers', {
        id: [{_: 'inputUserSelf'}]
      });
      expect(String(probeSelfAgain?.[0]?.id)).toBe(String(seed.userId));

      // ---- Phase 3.5: authorize every data center ----
      // A fresh login only touches the account home DC, but the browser boots
      // against App.baseDcId (2) — a different DC. A real session holds keys
      // for several DCs; a home-DC-only seed makes the preview do a fresh DH
      // handshake on the base DC and hit AUTH_KEY_UNREGISTERED. Force an
      // authorized call to every other DC so tweb exports/imports the auth and
      // persists each dc{n}_auth_key into account2.
      for(let dcId = 1 as TrueDcSeed; dcId <= 5; dcId = (dcId + 1) as TrueDcSeed) {
        if(dcId === homeDc) continue;
        try {
          await fresh.apiManager.invokeApi('users.getUsers', {
            id: [{_: 'inputUserSelf'}]
          }, {dcId});
          console.log(`[previewAuth] authorized dc${dcId}`);
        } catch(err: any) {
          console.log(`[previewAuth] dc${dcId} authorize skipped: ${err?.type || err}`);
        }
      }

      // ---- Phase 4: emit the preview seed ----
      let timeOffset: number;
      try {
        timeOffset = await sessionStorage.get('server_time_offset' as any) as number;
      } catch{}
      const previewSeed: AccountSeed = {
        userId: seed.userId,
        dcId: seed.dcId,
        authKeys: {},
        timeOffset: timeOffset ?? undefined
      };
      // re-read account2 — Phase 3.5 authorized more DCs after the earlier snapshot
      const account2Final: any = await sessionStorage.get('account2' as any);
      for(let i = 1 as TrueDcSeed; i <= 5; i = (i + 1) as TrueDcSeed) {
        const key = account2Final?.[`dc${i}_auth_key`];
        const salt = account2Final?.[`dc${i}_server_salt`];
        if(key && salt) previewSeed.authKeys[i] = {key, salt};
      }

      const outPath = process.env.PREVIEW_SEED_OUT || './tmp/seed-preview.json';
      mkdirSync(dirname(outPath), {recursive: true});
      writeFileSync(outPath, JSON.stringify(previewSeed, null, 2));
      console.log(`[previewAuth] OK — fresh preview authorization written to ${outPath}`);
      console.log(`[previewAuth] seed key dc${homeDc}: ${seedKey?.slice(0, 16)}…`);
      console.log(`[previewAuth] new  key dc${homeDc}: ${newKey.slice(0, 16)}… (independent)`);

      probe.dispose();
      fresh.dispose();
    } finally {
      restoreApi();
    }
  }, 240_000);
});
