// * Loading the accounts' state (loadStateForAllAccountsOnce) with what it reads mocked: the session's storage (the
// * account slots, `storage.values`), each account's kept state (`states`, by account number), whether that state
// * could be read (`harness.readable`) and whether the passcode is on (`harness.passcode`). Import it before the code
// * under test; `load()` loads every account afresh, `resetLoadState()` empties what a test kept.
// * plain values (vi.hoisted ones cannot be exported): the mocks below read them only once the code under test
// * imports what they stand for, by when they are made
const values: Record<string, any> = {};
const clone = (value: any) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
export const storage = {
  values,
  get: vi.fn(async(key: string) => clone(values[key])),
  set: vi.fn(async(obj: Record<string, any>) => {
    for(const key in obj) {
      values[key] = clone(obj[key]);
    }
  }),
  delete: vi.fn(async(key: string) => {
    delete values[key];
  }),
  deleteIfEqual: vi.fn(async(key: string, value: any) => {
    if(JSON.stringify(values[key]) === JSON.stringify(value)) delete values[key];
  })
};

export const states: Record<string, Record<string, any>> = {};
export const harness = {readable: true, passcode: false};

vi.mock('@lib/sessionStorage', () => ({default: storage}));
vi.mock('@lib/passcode/deferredIsUsingPasscode', () => ({default: {isUsingPasscode: async() => harness.passcode}}));
vi.mock('@lib/stateStorage', () => ({
  default: class {
    constructor(private accountNumber: number | 'old') {}
    async get(key: string) {
      return harness.readable ? states[this.accountNumber]?.[key] : undefined;
    }

    // * a storage that failed to read turns itself off (AppStorage)
    isAvailable() {
      return harness.readable;
    }
  }
}));
vi.mock('@lib/commonStateStorage', () => ({default: {get: async(): Promise<any> => undefined, set: async() => {}}}));
vi.mock('@lib/storage', () => ({
  default: class {
    async getAll(): Promise<any[]> {
      return [];
    }
    async set() {}
    async clear() {}
  }
}));
vi.mock('@lib/files/idb', () => ({IDB: {deleteDatabaseByName: async() => {}}}));

export async function load() {
  vi.resetModules();
  const {default: loadStateForAllAccountsOnce} = await import('@appManagers/utils/state/loadState');
  return loadStateForAllAccountsOnce();
}

export function resetLoadState() {
  for(const key in storage.values) delete storage.values[key];
  for(const key in states) delete states[key];
  harness.readable = true;
  harness.passcode = false;
}
