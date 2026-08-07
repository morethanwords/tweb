import {
  createEffect,
  createResource,
  JSX,
  onCleanup,
  Show
} from 'solid-js';
import Button from '@components/button';
import CommunityAvatar from '@components/communities/communityAvatar';
import {
  getCommunityServiceTitle
} from '@components/wrappers/getCommunityServiceMessageKey';
import wrapMessageActionTextNew from '@components/wrappers/messageActionTextNew';
import type {WrapMessageActionTextOptions} from '@components/wrappers/messageActionTextNew';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import type {Chat, Message} from '@layer';
import {useCommunity} from '@stores/communities';

import styles from '@components/chat/bubbles/communityChanged.module.scss';

export function CommunityChangedBubble(props: {
  community: Chat.community | Chat.communityForbidden,
  text: JSX.Element,
  onViewClick: () => void
}) {
  const viewButton = Button('bubble-service-button', {
    noRipple: true,
    text: 'Community.CommunityAdded.View'
  });
  onCleanup(attachClickEvent(viewButton, props.onViewClick));

  return (
    <div class={styles.Content}>
      <CommunityAvatar
        class={styles.Avatar}
        community={props.community}
        size={80}
        decorationFill="white"
      />
      <span class={styles.Text}>{props.text}</span>
      {viewButton}
    </div>
  );
}

export function CommunityChangedServiceBubble(props: {
  communityId: ChatId,
  initialCommunity?: Chat.community | Chat.communityForbidden,
  initialText: HTMLElement,
  message: Message.messageService,
  onViewClick: () => void,
  serviceContainer: HTMLElement,
  wrapOptions?: Omit<
    WrapMessageActionTextOptions,
    'message' | 'noLinks'
  >
}) {
  const storedCommunity = useCommunity(() => props.communityId);
  const community = () => storedCommunity() || props.initialCommunity;
  const title = () => getCommunityServiceTitle(community());
  const [text] = createResource(
    () => `${community()?._ || ''}:${title() || ''}`,
    () => wrapMessageActionTextNew({
      message: props.message,
      ...props.wrapOptions,
      noLinks: !!title()
    }),
    {initialValue: props.initialText}
  );

  createEffect(() => {
    props.serviceContainer.classList.toggle(
      'bubble-community-changed',
      !!title()
    );
  });
  onCleanup(() => {
    props.serviceContainer.classList.remove('bubble-community-changed');
  });

  return (
    <Show
      when={title() && community()}
      fallback={text()}
    >
      {(community) => (
        <CommunityChangedBubble
          community={community()}
          text={text()}
          onViewClick={props.onViewClick}
        />
      )}
    </Show>
  );
}
