import '@/tests/mocks/chatInputEditorNodes';

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    addEventListener: vi.fn(),
    addSharedObjectURLUpdateListener: vi.fn(),
    getState: vi.fn(async() => ({})),
    invoke: vi.fn(),
    invokeVoid: vi.fn()
  }
}));

