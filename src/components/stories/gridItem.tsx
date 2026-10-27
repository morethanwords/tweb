import {createEffect} from 'solid-js';
import {StoryItem} from '@layer';
import {wrapStoryMedia} from '@components/stories/preview';
import I18n from '@lib/langPack';
import buttonKeyDown from '@helpers/solid/buttonKeyDown';
import Modes from '@config/modes';
import {formatFullSentTime} from '@helpers/date';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import Icon from '@components/icon';
import formatNumber from '@helpers/number/formatNumber';
import getStoryPrivacyType from '@appManagers/utils/stories/privacyType';
import {STORY_PRIVACY_ICONS, STORY_PRIVACY_TITLES} from '@components/stories/privacyIcons';

/**
 * A story in a grid of them — a profile's, a search's: its picture, which opens the story. Stories of different
 * peers say whose each one is (`withAuthor`); one's own say, as on iOS and Android, how many have seen them and
 * who can (`own`), and which are pinned to the top (`pinned`)
 */
export default function wrapStoryGridItem(props: {
  peerId: PeerId,
  storyItem: StoryItem.storyItem,
  onClick: () => void,
  withAuthor?: boolean,
  own?: () => boolean,
  pinned?: () => boolean
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

  // * whose it is and what its badges show are read out with it, since the glyphs are not
  let author: string, badges: string;
  const setLabel = () => {
    (wrapped.container as HTMLElement).setAttribute('aria-label', [author, label(), badges].filter(Boolean).join(', '));
  };

  if(props.withAuthor) {
    getPeerTitle({peerId: props.peerId, plainText: true}).then((title) => {
      author = title;
      setLabel();
    });
  }

  if(props.own || props.pinned) {
    attachStoryGridBadges(wrapped.div, props.storyItem, props.own, props.pinned, (text) => {
      badges = text;
      setLabel();
    });
  }

  return wrapped;
}

/**
 * The badges go on the tile itself: a video's own element is not on it until it plays. The corner says what sets a
 * story apart — being pinned to the top, or else who can see it; the bottom how many have seen it, in the pill a
 * video's duration has elsewhere. Only whoever posted a story is ever sent its views and its audience.
 */
function attachStoryGridBadges(
  tile: HTMLElement,
  story: StoryItem.storyItem,
  own: () => boolean = () => false,
  pinned: () => boolean = () => false,
  onLabel: (text: string) => void
) {
  let cornerIcon: HTMLElement, cornerIconName: Icon;
  let views: HTMLElement, viewsCount: HTMLElement;
  let text = '';
  createEffect(() => {
    let iconName: Icon, audience: string;
    if(pinned()) {
      iconName = 'pin2_filled';
    } else if(own() && story._ === 'storyItem') {
      const privacyType = getStoryPrivacyType(story);
      if(privacyType && privacyType !== 'public') {
        iconName = STORY_PRIVACY_ICONS[privacyType];
        audience = I18n.format(STORY_PRIVACY_TITLES[privacyType], true);
      }
    }

    if(cornerIconName !== iconName) {
      cornerIcon?.remove();
      cornerIcon = iconName && Icon(iconName, 'grid-item-corner-icon', ...(iconName === 'pin2_filled' ? ['is-pin'] : []));
      cornerIconName = iconName;
      if(cornerIcon) {
        tile.append(cornerIcon);
      }
    }

    const viewsNumber = own() && story.views?.views_count;
    if(viewsNumber) {
      if(!views) {
        views = document.createElement('span');
        views.classList.add('video-time', 'grid-item-views');
        views.setAttribute('aria-hidden', 'true');
        views.append(Icon('eye1_filled', 'grid-item-views-icon'), viewsCount = document.createElement('span'));
        tile.append(views);
      }

      viewsCount.textContent = formatNumber(viewsNumber, 1);
    } else if(views) {
      views.remove();
      views = undefined;
    }

    const newText = [viewsNumber && I18n.format('Views', true, [viewsNumber]), audience].filter(Boolean).join(', ');
    if(newText !== text) {
      onLabel(text = newText);
    }
  });
}
