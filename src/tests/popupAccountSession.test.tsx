/*
 * A popup asked for by an account session that is over, or on its way out (a switch from it is under way),
 * is not shown over the next account: it goes before it ever showed. One that never showed held no overlay,
 * so it gives none back - the count of open overlays (what keeps the chat's shortcuts away from a modal)
 * stays right for the popups after it.
 */
import {afterEach, describe, expect, test, vi} from 'vitest';

vi.mock('@components/animationIntersector', () => ({
  default: {checkAnimations2: vi.fn()}
}));

import {getAccountSession, setAccountSwitchingTo, setCurrentAccount} from '@lib/accounts/getCurrentAccount';
import overlayCounter from '@helpers/overlayCounter';
import PopupElement, {createPopup} from '@components/popups/indexTsx';

const settle = async() => {
  // * doubleRaf for the show, the close transition after it
  await vi.advanceTimersByTimeAsync(100);
  await vi.advanceTimersByTimeAsync(300);
};

const openPopup = () => createPopup(() => (
  <PopupElement>
    <PopupElement.Body>body</PopupElement.Body>
  </PopupElement>
));

describe('a popup and the account session it was asked in', () => {
  afterEach(() => {
    setAccountSwitchingTo(undefined);
    PopupElement.POPUPS.slice().forEach((popup) => popup.destroy());
    vi.useRealTimers();
  });

  test('one asked for while a switch away runs is not shown, and holds no overlay', async() => {
    vi.useFakeTimers();
    setCurrentAccount(1);
    const overlays = overlayCounter.overlaysActive;

    setAccountSwitchingTo(2);
    openPopup();
    await settle();
    expect(document.querySelector('.popup.active')).toBeNull();
    expect(PopupElement.POPUPS).toHaveLength(0);
    expect(overlayCounter.overlaysActive).toBe(overlays);

    // * the next account's popup is shown, and counted
    setCurrentAccount(2);
    expect(getAccountSession().accountNumber).toBe(2);
    openPopup();
    await settle();
    expect(document.querySelector('.popup.active')).not.toBeNull();
    expect(overlayCounter.overlaysActive).toBe(overlays + 1);
  });
});
