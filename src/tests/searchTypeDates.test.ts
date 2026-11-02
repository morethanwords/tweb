import '@helpers/peerIdPolyfill';
import getSearchType from '@appManagers/utils/messages/getSearchType';
import {MessagesFilter} from '@layer';

// A chat's shared media is kept between searches: the photos of the chat are one list, filled as it is
// scrolled. A search limited to some dates (the date chip of the search) holds only what falls in them, so it
// is not that list and is not kept as it: asked for anew, like a search for words.

const peerId = (42 as UserId).toPeerId(false);
const inputFilter: MessagesFilter = {_: 'inputMessagesFilterPhotoVideo'};

describe('the kind of a search in a chat', () => {
  test('its shared media is kept', () => {
    expect(getSearchType({peerId, inputFilter})).toBe('cached');
  });

  test.each([
    ['from a date', {minDate: 1e12}],
    ['up to a date', {maxDate: 1e12}],
    ['between dates', {minDate: 1e12, maxDate: 2e12}]
  ])('limited %s, is asked for anew', (_name, dates) => {
    expect(getSearchType({peerId, inputFilter, ...dates})).toBe('uncached');
  });
});
