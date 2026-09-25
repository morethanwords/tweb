import '@/tests/mocks/chatInputEditorUi';

vi.hoisted(() => {
  const matchMedia = () => ({matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}});
  Object.defineProperty(window, 'matchMedia', {configurable: true, value: matchMedia});
  vi.stubGlobal('fetch', vi.fn(async() => new Response('', {status: 404})));
});
vi.mock('@lib/apiManagerProxy', () => ({default: {
  addEventListener: vi.fn(), addSharedObjectURLUpdateListener: vi.fn(), getState: vi.fn(async() => ({})), invoke: vi.fn(), invokeVoid: vi.fn()
}}));
vi.mock('@components/emoticonsDropdown', () => ({default: {}, EmoticonsDropdown: class {}}));
vi.mock('@lib/appDialogsManager', () => ({AppDialogsManager: class {}, default: {}}));
vi.mock('@components/popups/peer', () => ({default: class {}}));
vi.mock('@components/sidebarLeft', () => ({default: {}}));
vi.mock('@components/sidebarRight', () => ({default: {}}));

vi.mock('@environment/webpSupport', () => ({default: true}));
