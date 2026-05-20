import {readFileSync} from 'fs';
import {createTestClient, AccountSeed} from './harness';

const ENABLED = process.env.TG_API_TEST === '1';
const seedPath = process.env.TG_API_SEED;
const TRACE = process.env.TG_API_PRINT === '1';
const describeOrSkip = ENABLED && seedPath ? describe : describe.skip;

type Call = {
  t: number;        // ms since T0
  method: string;
  paramsSummary: string;
  resolvedAt?: number;
  error?: string;
  ok?: boolean;
};

describeOrSkip('startup trace', () => {
  test('measure & dump initial API calls', async() => {
    const seed = JSON.parse(readFileSync(seedPath!, 'utf8')) as AccountSeed;
    const client = await createTestClient({seed, testDc: process.env.TG_API_PROD_DC !== '1'});

    const T0 = Date.now();
    const calls: Call[] = [];
    const realInvoke = client.apiManager.invokeApi.bind(client.apiManager);

    (client.apiManager as any).invokeApi = (method: string, params: any, opts: any) => {
      const call: Call = {
        t: Date.now() - T0,
        method,
        paramsSummary: summarizeParams(method, params)
      };
      calls.push(call);

      const promise = realInvoke(method as any, params, opts) as Promise<any>;
      promise.then(
        () => {
          call.resolvedAt = Date.now() - T0;
          call.ok = true;
        },
        (err) => {
          call.resolvedAt = Date.now() - T0;
          call.ok = false;
          call.error = (err && (err.type || err.message)) || String(err);
        }
      );
      return promise;
    };

    // Mimic typical startup actions a freshly-opened tweb tab issues:
    // 1) sync updates state
    client.managers.apiUpdatesManager.attach();
    // 2) load the first dialog page (the chat list)
    const dialogsP = (client.managers.dialogsStorage as any).getDialogs({limit: 20});
    if(dialogsP?.then) await dialogsP.catch(() => {});

    // Let any cascading calls (getDifference, getFullUser, getAppConfig, ...) settle
    await new Promise((r) => setTimeout(r, 7000));

    if(TRACE) {
      printTrace(calls);
    }

    expect(calls.length).toBeGreaterThan(0);
  }, 30_000);
});

function summarizeParams(method: string, params: any): string {
  if(!params) return '';
  try {
    const pick: Record<string, any> = {};
    const keys = Object.keys(params).slice(0, 5);
    for(const k of keys) {
      const v = (params as any)[k];
      if(v == null) pick[k] = v;
      else if(typeof v === 'object') {
        if(Array.isArray(v)) pick[k] = `[len=${v.length}]`;
        else if((v as any)._) pick[k] = (v as any)._;
        else pick[k] = '{…}';
      } else {
        const s = String(v);
        pick[k] = s.length > 24 ? s.slice(0, 21) + '…' : s;
      }
    }
    return JSON.stringify(pick);
  } catch{
    return '';
  }
}

function printTrace(calls: Call[]) {
  const lines: string[] = [];
  lines.push(`\n=== Startup API trace (${calls.length} calls) ===`);
  lines.push('time(ms)  duration  status  method                               params');
  lines.push('--------  --------  ------  -----------------------------------  ----------------------------------------');
  for(const c of calls) {
    const dur = c.resolvedAt !== undefined ? (c.resolvedAt - c.t) + 'ms' : '...';
    const status = c.ok === true ? 'ok' : c.ok === false ? 'err:' + c.error : '...';
    lines.push(
      pad(String(c.t), 8) + '  ' +
      pad(dur, 8) + '  ' +
      pad(status, 6) + '  ' +
      pad(c.method, 35) + '  ' +
      c.paramsSummary
    );
  }

  // Aggregate by method
  const byMethod = new Map<string, {count: number; totalDur: number}>();
  for(const c of calls) {
    const e = byMethod.get(c.method) || {count: 0, totalDur: 0};
    e.count++;
    if(c.resolvedAt !== undefined) e.totalDur += c.resolvedAt - c.t;
    byMethod.set(c.method, e);
  }

  lines.push('\n=== Aggregate ===');
  lines.push('count  totalDur  method');
  lines.push('-----  --------  --------------------------------------');
  const sorted = [...byMethod.entries()].sort((a, b) => b[1].count - a[1].count);
  for(const [method, {count, totalDur}] of sorted) {
    lines.push(pad(String(count), 5) + '  ' + pad(totalDur + 'ms', 8) + '  ' + method);
  }


  console.log(lines.join('\n'));
}

function pad(s: string, n: number) {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
