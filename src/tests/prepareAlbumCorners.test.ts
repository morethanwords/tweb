import prepareAlbum from '@components/prepareAlbum';

describe('prepareAlbum corners', () => {
  it('drops the radius of a corner that is no longer outer', () => {
    const container = document.createElement('div');
    const cell = document.createElement('div');
    container.append(cell);
    cell.style.borderStartStartRadius = '10px';
    cell.style.borderEndEndRadius = '10px';
    cell.style.borderEndStartRadius = '10px';
    cell.style.borderStartEndRadius = '10px';

    prepareAlbum({container, items: [{w: 100, h: 100}, {w: 100, h: 100}], maxWidth: 200, minWidth: 50, maxHeight: 200, spacing: 2} as any);

    expect(cell.style.borderStartEndRadius).toBe('');
    expect(cell.style.borderEndEndRadius).toBe('');
    expect(cell.style.borderStartStartRadius).not.toBe('');
  });
});
