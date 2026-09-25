const {invoke} = vi.hoisted(() => ({
  invoke: vi.fn(() => Promise.resolve('ok'))
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {invoke}
}));

vi.mock('@config/debug', () => ({
  DEBUG: false,
  MOUNT_CLASS_TO: {},
  default: false
}));

vi.mock('@lib/accounts/getCurrentAccount', () => ({
  getCurrentAccount: () => 1
}));

import getProxiedManagers, {createProxiedManagersForAccount} from '@lib/getProxiedManagers';

describe('proxied app managers', () => {
  beforeEach(() => invoke.mockClear());

  test('does not turn Promise and JSON introspection into worker manager calls', () => {
    const managers = createProxiedManagersForAccount(1);
    const draftsManager = managers.appDraftsManager;

    expect((managers as any).then).toBeUndefined();
    expect((managers as any).toJSON).toBeUndefined();
    expect((draftsManager as any).then).toBeUndefined();
    expect((draftsManager as any).toJSON).toBeUndefined();
    expect(JSON.stringify({managers, draftsManager})).toBe(
      '{"managers":{"appDraftsManager":{}},"draftsManager":{}}'
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  test('continues forwarding real manager methods', async() => {
    const managers = getProxiedManagers();

    await managers.appDraftsManager.getDraft(123 as PeerId);

    expect(invoke).toHaveBeenCalledWith('manager', {
      name: 'appDraftsManager',
      method: 'getDraft',
      args: [123],
      accountNumber: 1
    }, false);
  });
});
