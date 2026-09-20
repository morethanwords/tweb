import {afterEach, describe, expect, it, vi} from 'vitest';
import AppAccountManager from '@appManagers/appAccountManager';

const TOKEN = 'web-auth-token';
const DC_ID = 2;

/**
 * Both methods only reach for `apiManager` and the logger, so the manager needs
 * none of its state/listener bootstrap here.
 */
function makeManager() {
  const invokeApi = vi.fn();
  const setBaseDcId = vi.fn();
  const setUser = vi.fn().mockResolvedValue(undefined);
  const logError = vi.fn();

  const manager = new AppAccountManager();
  Object.assign(manager as any, {
    apiManager: {invokeApi, setBaseDcId, setUser},
    log: {error: logError}
  });

  return {manager, invokeApi, setBaseDcId, setUser, logError};
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('web token authorization', () => {
  it('imports on the token own dc and stores the user it comes back with', async() => {
    const {manager, invokeApi, setBaseDcId, setUser} = makeManager();
    const user = {_: 'user', id: '777'};
    invokeApi.mockResolvedValue({_: 'auth.authorization', user});

    const authorization = await manager.importWebTokenAuthorization(TOKEN, DC_ID);

    expect(setBaseDcId).toHaveBeenCalledWith(DC_ID);
    expect(invokeApi).toHaveBeenCalledWith(
      'auth.importWebTokenAuthorization',
      expect.objectContaining({web_auth_token: TOKEN}),
      {dcId: DC_ID, ignoreErrors: true}
    );
    expect(setUser).toHaveBeenCalledWith(user);
    expect(authorization).toEqual({_: 'auth.authorization', user});
  });

  it('leaves the session alone when the import needs a sign up', async() => {
    const {manager, invokeApi, setUser} = makeManager();
    invokeApi.mockResolvedValue({_: 'auth.authorizationSignUpRequired'});

    await manager.importWebTokenAuthorization(TOKEN, DC_ID);

    expect(setUser).not.toHaveBeenCalled();
  });

  it('cancels the token without moving the base dc', () => {
    const {manager, invokeApi, setBaseDcId} = makeManager();
    invokeApi.mockResolvedValue(true);

    manager.cancelWebTokenAuthorization(TOKEN, DC_ID);

    expect(invokeApi).toHaveBeenCalledWith(
      'auth.cancelWebTokenAuthorization',
      {web_auth_token: TOKEN},
      {dcId: DC_ID, ignoreErrors: true}
    );
    expect(setBaseDcId).not.toHaveBeenCalled();
  });

  it('swallows a rejected cancellation — nobody is waiting on it', async() => {
    const {manager, invokeApi, logError} = makeManager();
    invokeApi.mockRejectedValue({type: 'AUTH_TOKEN_INVALID'});

    expect(manager.cancelWebTokenAuthorization(TOKEN, DC_ID)).toBeUndefined();
    await Promise.resolve();

    expect(logError).toHaveBeenCalled();
  });
});
