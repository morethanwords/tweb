import {EmoticonsDropdown} from '@components/emoticonsDropdown';
import StickersTab from '@components/emoticonsDropdown/tabs/stickers';
import rootScope from '@lib/rootScope';
import findUpTag from '@helpers/dom/findUpTag';
import cloneDOMRect from '@helpers/dom/cloneDOMRect';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {createEffect, createRoot, createSignal, onCleanup} from 'solid-js';
import {getOverlayRoot} from '@helpers/appWindow';

import styles from '@components/emojiDropdownButton.module.scss';

type StickerClickPayload = {
  docId: DocId,
  target: HTMLElement
};

const createStickersDropdown = ({
  pivot,
  onStickerClick,
  onEmoticonsDropdown,
  ...rest
}: {
  pivot: HTMLElement,
  onStickerClick: (payload: StickerClickPayload) => void,
  onEmoticonsDropdown?: (emoticonsDropdown: EmoticonsDropdown) => void
} & Pick<ConstructorParameters<typeof EmoticonsDropdown>[0], 'customParentElement' | 'animationGroup'>) => createRoot((dispose) => {
  const stickersTab = new StickersTab(rootScope.managers);

  const emoticonsDropdown = new EmoticonsDropdown({
    tabsToRender: [stickersTab],
    customParentElement: getOverlayRoot,
    getOpenPosition: () => {
      const rect = pivot.getBoundingClientRect();
      const cloned = cloneDOMRect(rect);
      cloned.top = rect.bottom + 8;
      return cloned;
    },
    ...rest
  });

  // Override the default media click handler from StickersTab so callers
  // receive the picked sticker instead of it being sent through chatInput.
  emoticonsDropdown.onMediaClick = async(e) => {
    const target = findUpTag(e.target as HTMLElement, 'DIV');
    if(!target) return false;

    const docId = target.dataset.docId;
    if(!docId) return false;

    onStickerClick({docId, target});
    emoticonsDropdown.toggle(false);
    return true;
  };

  emoticonsDropdown.getElement().classList.add(styles.EmoticonsDropdown);
  emoticonsDropdown.setTextColor('primary-text-color');

  onEmoticonsDropdown?.(emoticonsDropdown);

  // Open immediately when the dropdown is created.
  emoticonsDropdown.toggle(true);

  onCleanup(() => {
    emoticonsDropdown?.hideAndDestroy();
  });

  return {emoticonsDropdown, dispose};
});

export type UseStickersDropdownOptions = {
  onStickerClick: (payload: StickerClickPayload) => void
} & Pick<ConstructorParameters<typeof EmoticonsDropdown>[0], 'customParentElement' | 'animationGroup'>;

/**
 * Returns a setter that opens a stickers dropdown anchored to the supplied pivot element.
 * Pass `null` (or any falsy value) to close the dropdown. The dropdown is automatically
 * disposed when the owning reactive scope is cleaned up or when the pivot changes.
 */
export const useStickersDropdown = ({onStickerClick, ...rest}: UseStickersDropdownOptions) => {
  const [pivot, setPivot] = createSignal<HTMLElement | null>(null);

  createEffect(() => {
    const pivotEl = pivot();
    if(!pivotEl) return;

    const {emoticonsDropdown, dispose} = createStickersDropdown({
      pivot: pivotEl,
      onStickerClick,
      ...rest
    });

    subscribeOn(emoticonsDropdown)('close', () => {
      setPivot(null);
    });

    onCleanup(dispose);
  });

  return setPivot;
};

export default createStickersDropdown;
