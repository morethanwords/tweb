import {afterEach, describe, expect, test, vi} from 'vitest';
import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {MyDocument} from '@appManagers/appDocsManager';
import ReactionStickerPreview from '@components/reactionStickerPreview';
import Row from '@components/rowTsx';

vi.mock('@components/rippleElement', () => ({
  default: (props: any) => (
    <div classList={props.classList}>
      {props.children}
    </div>
  )
}));

vi.mock('@helpers/dom/createContextMenu', () => ({
  default: () => ({open: () => {}})
}));

vi.mock('@components/wrappers/sticker', () => ({
  StickerTsx: (props: {sticker: MyDocument}) => (
    <div data-sticker-id={String(props.sticker.id)} />
  )
}));

let dispose: VoidFunction;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

describe('ReactionStickerPreview', () => {
  test('keeps one declarative media node during rapid sticker updates', async() => {
    const mount = document.createElement('div');
    const [sticker, setSticker] = createSignal<MyDocument>();
    document.body.append(mount);

    dispose = render(() => (
      <Row>
        <Row.Title>Quick reaction</Row.Title>
        <ReactionStickerPreview sticker={sticker()} />
      </Row>
    ), mount);

    expect(mount.querySelectorAll('.row-media')).toHaveLength(1);
    expect(mount.querySelector('[data-sticker-id]')).toBe(null);

    setSticker({id: 1} as MyDocument);
    setSticker({id: 2} as MyDocument);
    setSticker({id: 3} as MyDocument);
    await Promise.resolve();

    expect(mount.querySelectorAll('.row-media')).toHaveLength(1);
    expect(mount.querySelectorAll('[data-sticker-id]')).toHaveLength(1);
    expect(mount.querySelector('[data-sticker-id]')?.getAttribute('data-sticker-id')).toBe('3');
  });
});
