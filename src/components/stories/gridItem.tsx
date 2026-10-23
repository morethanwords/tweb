import {StoryItem} from '@layer';
import {wrapStoryMedia} from '@components/stories/preview';
import I18n from '@lib/langPack';
import buttonKeyDown from '@helpers/solid/buttonKeyDown';
import Modes from '@config/modes';
import {formatFullSentTime} from '@helpers/date';
import getPeerTitle from '@components/wrappers/getPeerTitle';

/**
 * A story in a grid of them — a profile's, a search's: its picture, which opens the story. Stories of different
 * peers say whose each one is (`withAuthor`)
 */
export default function wrapStoryGridItem(props: {
  peerId: PeerId,
  storyItem: StoryItem.storyItem,
  onClick: () => void,
  withAuthor?: boolean
}) {
  const label = () => `${I18n.format('OpenStory', true)}, ${formatFullSentTime(props.storyItem.date).textContent}`;
  const wrapped = wrapStoryMedia({
    peerId: props.peerId,
    storyItem: props.storyItem,
    forPreview: true,
    noAspecter: true,
    containerProps: {
      // @ts-ignore
      'data-mid': props.storyItem.id,
      'data-peer-id': props.peerId,
      'data-timestamp': props.storyItem.date,
      'class': 'grid-item search-super-item',
      'role': 'button',
      'tabindex': Modes.a11y ? 0 : undefined,
      'aria-label': label(),
      'onKeyDown': buttonKeyDown,
      'onClick': props.onClick
    },
    childrenClassName: 'grid-item-media',
    noPlayButton: true
  });

  if(props.withAuthor) {
    getPeerTitle({peerId: props.peerId, plainText: true}).then((title) => {
      (wrapped.container as HTMLElement).setAttribute('aria-label', `${title}, ${label()}`);
    });
  }

  return wrapped;
}
