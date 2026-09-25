import {
  createRichMediaPreviewUrl,
  getRichMediaPreviewPoster,
  getRichMediaPreviewSideFill,
  getRichMediaPreviewSource,
  setRichMediaPreviewPoster,
  setRichMediaPreviewSideFill,
  setRichMediaPreviewSource,
  retainRichMediaPreviewUrl
} from '@components/chat/inputEditor/mediaPreviewUrl';
import {hasLoadedURL, markLoadedURL} from '@helpers/dom/loadedUrlCache';
import {ObjectURLScope} from '@helpers/objectUrlScope';

describe('rich media preview URL leases', () => {
  test('revokes a preview only after the upload task and every mounted view release it', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:leased-preview');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => {});
    const preview = createRichMediaPreviewUrl(new Blob(['photo']));
    const releaseFirstView = retainRichMediaPreviewUrl(preview.url);
    const releaseSecondView = retainRichMediaPreviewUrl(preview.url);

    preview.release();
    releaseFirstView();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    releaseSecondView();
    releaseSecondView();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:leased-preview');

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  test('keeps the lease registry across a module reload', async() => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:hmr-preview');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => {});
    const preview = createRichMediaPreviewUrl(new Blob(['video']));

    vi.resetModules();
    const reloadedModule = await import(
      '@components/chat/inputEditor/mediaPreviewUrl'
    );
    const releaseReloadedView = reloadedModule.retainRichMediaPreviewUrl(preview.url);
    preview.release();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    releaseReloadedView();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:hmr-preview');

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  test('retains transferred poster ownership until the final preview lease is released', () => {
    const create = vi.spyOn(URL, 'createObjectURL')
    .mockReturnValueOnce('blob:poster-owner')
    .mockReturnValueOnce('blob:scoped-poster');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const preview = createRichMediaPreviewUrl(new Blob(['photo']));
    const releaseView = retainRichMediaPreviewUrl(preview.url);
    const scope = new ObjectURLScope();
    const posterUrl = scope.create(new Blob(['poster']));
    const releasePoster = vi.fn(() => scope.dispose());
    markLoadedURL(posterUrl);
    expect(setRichMediaPreviewPoster(preview.url, new Image(), posterUrl, releasePoster)).toBe(true);

    preview.release();
    expect(releasePoster).not.toHaveBeenCalled();
    releaseView();
    releaseView();
    expect(releasePoster).toHaveBeenCalledOnce();
    expect(revoke.mock.calls).toEqual([[posterUrl], [preview.url]]);
    expect(hasLoadedURL(posterUrl)).toBe(false);
    create.mockRestore();
    revoke.mockRestore();
  });

  test('keeps a decoded media source until its final preview lease is released', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:decoded-preview');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => {});
    const preview = createRichMediaPreviewUrl(new Blob(['photo']));
    const image = new Image();
    image.src = preview.url;
    const poster = new Image();
    const posterUrl = 'blob:decoded-poster';
    poster.src = posterUrl;
    const sideFill = new Image();
    sideFill.src = preview.url;

    expect(setRichMediaPreviewSource(preview.url, image)).toBe(true);
    expect(setRichMediaPreviewPoster(preview.url, poster, posterUrl)).toBe(true);
    expect(setRichMediaPreviewSideFill(preview.url, sideFill)).toBe(true);
    expect(getRichMediaPreviewSource(preview.url)).toBe(image);
    expect(getRichMediaPreviewPoster(preview.url)).toBe(poster);
    expect(getRichMediaPreviewSideFill(preview.url)).toBe(sideFill);
    markLoadedURL(preview.url);
    markLoadedURL(posterUrl);

    preview.release();
    expect(hasLoadedURL(preview.url)).toBe(false);
    expect(hasLoadedURL(posterUrl)).toBe(false);
    expect(getRichMediaPreviewSource(preview.url)).toBeUndefined();
    expect(getRichMediaPreviewPoster(preview.url)).toBeUndefined();
    expect(getRichMediaPreviewSideFill(preview.url)).toBeUndefined();
    expect(image.hasAttribute('src')).toBe(false);
    expect(poster.hasAttribute('src')).toBe(false);
    expect(sideFill.hasAttribute('src')).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith(preview.url);
    expect(revokeObjectURL).toHaveBeenCalledWith(posterUrl);

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
});
