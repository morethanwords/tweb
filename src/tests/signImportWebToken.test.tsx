import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';

import type {AuthState} from '@types';

const mocks = vi.hoisted(() => ({
  importWebTokenAuthorization: vi.fn(),
  cancelWebTokenAuthorization: vi.fn(),
  pushToState: vi.fn(),
  navigate: vi.fn(),
  toIm: vi.fn(),
  back: vi.fn(),
  defaultAuthState: 'authStateSignIn' as 'authStateSignIn' | 'authStateSignQr'
}));

vi.mock('@config/state', () => ({
  STATE_INIT: {
    authState: {
      get _() {
        return mocks.defaultAuthState;
      }
    }
  }
}));

vi.mock('@/pages/authFlow', () => ({
  useAuthFlow: () => ({
    managers: {
      appAccountManager: {
        importWebTokenAuthorization: mocks.importWebTokenAuthorization,
        cancelWebTokenAuthorization: mocks.cancelWebTokenAuthorization
      },
      appStateManager: {pushToState: mocks.pushToState}
    },
    navigate: mocks.navigate,
    back: mocks.back,
    toIm: mocks.toIm
  })
}));

import SignImportCard from '@/pages/cards/SignImportCard';

const TOKEN = 'web-auth-token';
const DC_ID = 2;

const payload = {
  token: TOKEN,
  userId: '777',
  dcId: DC_ID,
  isTest: false,
  tgAddr: ''
} as AuthState.signImport['data'];

let dispose: () => void;

function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  dispose = render(() => <SignImportCard spec={{name: 'signImport', payload}} />, container);
  return container;
}

/** The card kicks off an unawaited async import — let its chain settle. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mocks.defaultAuthState = 'authStateSignIn';
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('sign import card', () => {
  it('drops the web token when it falls back to another auth method', async() => {
    mocks.importWebTokenAuthorization.mockRejectedValue({type: 'AUTH_TOKEN_INVALID'});

    mount();
    await flush();

    expect(mocks.cancelWebTokenAuthorization).toHaveBeenCalledWith(TOKEN, DC_ID);
    expect(mocks.navigate).toHaveBeenCalledWith({name: 'signIn'});
  });

  it('keeps the web token while the password step takes over', async() => {
    mocks.importWebTokenAuthorization.mockRejectedValue({type: 'SESSION_PASSWORD_NEEDED'});

    mount();
    await flush();

    expect(mocks.cancelWebTokenAuthorization).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith({name: 'password'});
  });

  it('keeps the web token once the import signed the user in', async() => {
    mocks.importWebTokenAuthorization.mockResolvedValue({_: 'auth.authorization', user: {_: 'user', id: '777'}});

    mount();
    await flush();

    expect(mocks.importWebTokenAuthorization).toHaveBeenCalledWith(TOKEN, DC_ID);
    expect(mocks.cancelWebTokenAuthorization).not.toHaveBeenCalled();
    expect(mocks.toIm).toHaveBeenCalled();
  });
});
