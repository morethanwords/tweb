/*
 * The rating a call asks for once it is over, when the server marks it `need_rating`.
 *
 * The call it rates is made up: a rating only goes out on Send, through `appCallsManager.setCallRating`,
 * which the sandbox answers itself — and live, holds back as a write.
 *
 * Popup modules are imported inside `open()` — see the note in `confirmations.ts`.
 */

import {defineStories} from '../registry';

defineStories('Calls', [
  {
    id: 'call/rate',
    fixtureOnly: true,
    title: 'Rate a call',
    open: async() => {
      const {default: showRateCallPopup} = await import('@components/popups/rateCall');
      showRateCallPopup({call: {_: 'inputPhoneCall', id: 'sandbox-call', access_hash: 'sandbox-call'}});
    }
  },
  {
    // Two stars on a video call: what went wrong, the picture included, and the comment.
    id: 'call/rateVideoLow',
    fixtureOnly: true,
    title: 'Rate a video call — what went wrong',
    open: async() => {
      const {default: showRateCallPopup} = await import('@components/popups/rateCall');
      showRateCallPopup({
        call: {_: 'inputPhoneCall', id: 'sandbox-call', access_hash: 'sandbox-call'},
        isVideo: true,
        rating: 2
      });
    }
  }
]);
