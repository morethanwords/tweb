import {render} from 'solid-js/web';
import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';

/**
 * The channels like the one joined, shown under the service message of the join (`SimilarChannels`), follow the
 * user's Premium. The listener of it was added to `rootScope`, which lives as long as the page, and never removed: every
 * such message rendered - each time its bubble came into the list again - kept its list, with its avatars, for good.
 */

const mocks = vi.hoisted(() => {
  // * an answer of the worker that never comes: the list stays as it is
  const pending = () => ({cached: false, result: new Promise<never>(() => {})});
  return {
    rootScope: {
      premium: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      managers: {
        acknowledged: {
          appChatsManager: {getChannelRecommendations: pending},
          apiManager: {getLimit: pending}
        }
      }
    }
  };
});

vi.mock('@lib/rootScope', () => ({default: mocks.rootScope}));
vi.mock('@lib/apiManagerProxy', () => ({default: new Proxy({}, {get: () => () => false})}));

let SimilarChannels: typeof import('@components/chat/similarChannels').default;

beforeAll(async() => {
  stubBrowserGlobals();
  SimilarChannels = (await import('@components/chat/similarChannels')).default;
}, 60_000);

test('the Premium listener goes with the list', () => {
  // * the ones the modules imported added are none of the list's
  mocks.rootScope.addEventListener.mockClear();
  mocks.rootScope.removeEventListener.mockClear();
  const listeners = (calls: unknown[][]) => calls.filter(([event]) => event === 'premium_toggle').map(([, listener]) => listener);

  const dispose = render(() => SimilarChannels({chatId: 1, onClose: () => {}}), document.createElement('div'));
  const added = listeners(mocks.rootScope.addEventListener.mock.calls);
  expect(added).toHaveLength(1);

  dispose();
  expect(listeners(mocks.rootScope.removeEventListener.mock.calls)).toEqual(added);
});
