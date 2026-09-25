import '@/tests/mocks/chatInputEditorNodes';

vi.hoisted(() => {
  Object.defineProperties(HTMLCanvasElement.prototype, {
    getContext: {configurable: true, value: (): null => null},
    toDataURL: {configurable: true, value: () => 'data:image/webp;base64,test'}
  });
});

beforeEach(async() => {
  const [{default: element}, {CustomEmojiRendererElement: renderer}] = await Promise.all([
    import('@lib/customEmoji/element'),
    import('@lib/customEmoji/renderer')
  ]);
  vi.mocked(element.create).mockReset();
  vi.mocked(renderer.create).mockReset();
});
