import makeError from '@helpers/makeError';
import pause from '@helpers/schedulers/pause';
import {logger} from '@lib/logger';

// A DC other than the account's own answers 401 until the authorization is
// imported there: auth.exportAuthorization on the home DC, then
// auth.importAuthorization on that one, and the request goes again. That is
// done for a wave of 401s at a time - the requests that hit one while an
// import is on its way wait for it - and anew for the next wave (tdesktop's
// _authWaiters), so neither an import that failed once nor an authorization
// the DC has dropped since stays with the session.

const HOME_DC = 2;
const FILE_DC = 4;
// * a request asked more times than this is going round in circles
const MAX_CALLS = 20;

type Server = {
  authorized: boolean,
  failingImports: number,
  calls: string[]
};

function apiError(code: number, type: string) {
  return Object.assign(makeError(type as ErrorType), {code});
}

function countOf(server: Server, call: string) {
  return server.calls.filter((c) => c === call).length;
}

function makeNetworker(server: Server, dcId: number) {
  const answer = (method: string): Promise<any> => {
    server.calls.push(`${dcId}:${method}`);
    if(server.calls.length > MAX_CALLS) {
      return Promise.reject(apiError(999, 'ROUND_IN_CIRCLES'));
    }

    if(dcId === HOME_DC && method === 'auth.exportAuthorization') {
      return Promise.resolve({_: 'auth.exportedAuthorization', id: 1, bytes: new Uint8Array([1])});
    }

    if(dcId === FILE_DC && method === 'auth.importAuthorization') {
      if(server.failingImports) {
        --server.failingImports;
        return Promise.reject(apiError(400, 'AUTH_BYTES_INVALID'));
      }

      server.authorized = true;
      return Promise.resolve({_: 'auth.authorization'});
    }

    if(dcId === FILE_DC && method === 'upload.getFile') {
      return server.authorized ?
        Promise.resolve({_: 'upload.file'}) :
        Promise.reject(apiError(401, 'AUTH_KEY_UNREGISTERED'));
    }

    return Promise.reject(apiError(400, 'METHOD_NOT_EXPECTED'));
  };

  return {
    dcId,
    isStopped: () => false,
    attachPromise: () => {},
    // * an answer comes a moment later, as from the network
    wrapApiCall: (method: string) => pause(1).then(() => answer(method))
  };
}

// * a server whose file DC has no authorization yet, and an account at home on the other one
async function makeAccount(failingImports = 0) {
  const server: Server = {authorized: false, failingImports, calls: []};
  const {ApiManager} = await import('@appManagers/apiManager');
  const apiManager = new ApiManager();
  const networkers = new Map<number, ReturnType<typeof makeNetworker>>();
  Object.assign(apiManager, {
    baseDcId: HOME_DC,
    log: logger('API-TEST'),
    getAccountNumber: () => 1,
    getNetworker: async(dcId: number) => {
      if(!networkers.has(dcId)) networkers.set(dcId, makeNetworker(server, dcId));
      return networkers.get(dcId);
    }
  });

  const getFile = () => apiManager.invokeApi('upload.getFile', {} as any, {dcId: FILE_DC, noErrorBox: true});
  return {server, getFile};
}

describe('401 on a DC other than the home one', () => {
  test('requests that hit it together wait for one import, then go again', async() => {
    const {server, getFile} = await makeAccount();

    const results = await Promise.all([getFile(), getFile(), getFile()]);
    expect(results.map((result) => result._)).toEqual(['upload.file', 'upload.file', 'upload.file']);
    expect(countOf(server, `${HOME_DC}:auth.exportAuthorization`)).toBe(1);
    expect(countOf(server, `${FILE_DC}:auth.importAuthorization`)).toBe(1);
  });

  test('an import that failed is made again for the next request instead of failing it for good', async() => {
    const {server, getFile} = await makeAccount(1);

    await expect(getFile()).rejects.toMatchObject({type: 'AUTH_BYTES_INVALID'});

    expect((await getFile())._).toBe('upload.file');
    expect(countOf(server, `${HOME_DC}:auth.exportAuthorization`)).toBe(2);
    expect(countOf(server, `${FILE_DC}:auth.importAuthorization`)).toBe(2);
  });

  test('an authorization the DC has dropped since is imported again, not asked for again and again', async() => {
    const {server, getFile} = await makeAccount();

    expect((await getFile())._).toBe('upload.file');

    server.authorized = false;
    expect((await getFile())._).toBe('upload.file');
    expect(countOf(server, `${HOME_DC}:auth.exportAuthorization`)).toBe(2);
    expect(countOf(server, `${FILE_DC}:upload.getFile`)).toBe(4);
  });
});
