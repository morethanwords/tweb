const mocks = vi.hoisted(() => ({
  pinObjectURL: vi.fn()
}));

vi.mock('@helpers/objectUrl', () => ({
  pinObjectURL: mocks.pinObjectURL
}));

import createMediaMetadataObjectURLPins from '@helpers/mediaMetadataObjectURLPins';

function makeMetadata(artwork: MediaImage[]) {
  return {artwork} as unknown as MediaMetadata;
}

describe('media metadata object URL pins', () => {
  let unpins: Map<string, ReturnType<typeof vi.fn>>;
  let setMetadata: ReturnType<typeof vi.fn>;
  let setMediaMetadata: (metadata: MediaMetadata | null) => void;

  beforeEach(() => {
    unpins = new Map();
    setMetadata = vi.fn();
    mocks.pinObjectURL.mockReset();
    mocks.pinObjectURL.mockImplementation((url: string) => {
      const unpin = vi.fn();
      unpins.set(url, unpin);
      return unpin;
    });
    setMediaMetadata = createMediaMetadataObjectURLPins(
      setMetadata as (metadata: MediaMetadata | null) => void
    );
  });

  it('pins blob artwork once and ignores non-blob sources', () => {
    const metadata = makeMetadata([
      {src: 'blob:test/first'},
      {src: 'blob:test/first'},
      {src: 'https://example.com/fallback.png'}
    ]);

    setMediaMetadata(metadata);

    expect(mocks.pinObjectURL).toHaveBeenCalledOnce();
    expect(mocks.pinObjectURL).toHaveBeenCalledWith('blob:test/first');
    expect(setMetadata).toHaveBeenCalledWith(metadata);
    expect(unpins.get('blob:test/first')).not.toHaveBeenCalled();
  });

  it('keeps an existing pin across same-artwork updates without re-pinning', () => {
    setMediaMetadata(makeMetadata([{src: 'blob:test/first'}]));
    const unpinFirst = unpins.get('blob:test/first');

    setMediaMetadata(makeMetadata([
      {src: 'blob:test/first'},
      {src: 'https://example.com/fallback.png'}
    ]));

    expect(mocks.pinObjectURL).toHaveBeenCalledOnce();
    expect(unpinFirst).not.toHaveBeenCalled();
  });

  it('unpins artwork that is no longer referenced', () => {
    setMediaMetadata(makeMetadata([
      {src: 'blob:test/first'},
      {src: 'blob:test/second'}
    ]));
    const unpinFirst = unpins.get('blob:test/first');
    const unpinSecond = unpins.get('blob:test/second');

    setMediaMetadata(makeMetadata([{src: 'blob:test/second'}]));

    expect(unpinFirst).toHaveBeenCalledOnce();
    expect(unpinSecond).not.toHaveBeenCalled();
    expect(mocks.pinObjectURL).toHaveBeenCalledTimes(2);
  });

  it('releases freshly created pins when the setter throws', () => {
    setMediaMetadata(makeMetadata([{src: 'blob:test/first'}]));
    const unpinFirst = unpins.get('blob:test/first');

    setMetadata.mockImplementationOnce(() => {
      throw new Error('metadata rejected');
    });
    expect(() => {
      setMediaMetadata(makeMetadata([
        {src: 'blob:test/first'},
        {src: 'blob:test/second'}
      ]));
    }).toThrow('metadata rejected');

    // the staged pin is released, the previously committed one survives
    expect(unpins.get('blob:test/second')).toHaveBeenCalledOnce();
    expect(unpinFirst).not.toHaveBeenCalled();

    // the failed update did not corrupt the committed set
    setMediaMetadata(null);
    expect(unpinFirst).toHaveBeenCalledOnce();
  });

  it('unpins everything when the metadata is cleared', () => {
    setMediaMetadata(makeMetadata([
      {src: 'blob:test/first'},
      {src: 'blob:test/second'}
    ]));

    setMediaMetadata(null);

    expect(setMetadata).toHaveBeenLastCalledWith(null);
    expect(unpins.get('blob:test/first')).toHaveBeenCalledOnce();
    expect(unpins.get('blob:test/second')).toHaveBeenCalledOnce();

    setMediaMetadata(makeMetadata([{src: 'blob:test/first'}]));
    expect(mocks.pinObjectURL).toHaveBeenCalledTimes(3);
  });
});
