import {canWriteClipboardItem, copyTextToClipboard, writeClipboardItem} from '@helpers/clipboard';

class ClipboardItemMock {
  public static supports = vi.fn(() => true);

  constructor(public items: Record<string, Blob | Promise<Blob>>) {}
}

describe('clipboard items', () => {
  let write: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    write = vi.fn((items: ClipboardItemMock[]) => items[0].items['image/png']);
    Object.defineProperty(window, 'ClipboardItem', {
      configurable: true,
      value: ClipboardItemMock
    });
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {write}
    });
  });

  it('checks MIME support before offering clipboard item writing', () => {
    expect(canWriteClipboardItem('image/png')).toBe(true);

    ClipboardItemMock.supports.mockReturnValueOnce(false);
    expect(canWriteClipboardItem('image/png')).toBe(false);
  });

  it('starts writing a pending blob in the current user-activation tick', async() => {
    const blob = new Blob(['image'], {type: 'image/png'});
    const blobPromise = Promise.resolve(blob);

    const result = writeClipboardItem({'image/png': blobPromise});

    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0][0][0].items['image/png']).toBe(blobPromise);
    await expect(result).resolves.toBe(blob);
  });

  it('uses the same clipboard item writer for HTML text', async() => {
    write.mockResolvedValueOnce(undefined);

    await copyTextToClipboard('Text', '<b>Text</b>');

    const item = write.mock.calls[0][0][0] as ClipboardItemMock;
    expect(item.items['text/plain']).toBeInstanceOf(Blob);
    expect((item.items['text/plain'] as Blob).type).toBe('text/plain');
    expect(item.items['text/html']).toBeInstanceOf(Blob);
    expect((item.items['text/html'] as Blob).type).toBe('text/html');
  });
});
