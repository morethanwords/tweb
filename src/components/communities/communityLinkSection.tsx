import {createMemo, Ref, Show} from 'solid-js';
import type {Chat} from '@layer';
import Button from '@components/buttonTsx';
import {
  CommunityDialogList
} from '@components/communities/communityPeerDialogList';
import Row from '@components/rowTsx';
import Section from '@components/section';
import type {Middleware} from '@helpers/middleware';
import {i18n, LangPackKey} from '@lib/langPack';

export default function CommunityLinkSection(props: {
  ref?: Ref<HTMLDivElement>,
  linkedCommunityId?: ChatId,
  communities: ReadonlyArray<Chat.community | Chat.communityForbidden>,
  middleware: Middleware,
  caption: LangPackKey,
  hideCaptionWhenLinked?: boolean,
  hideWhenLinkedCommunityMissing?: boolean,
  addIcon: Icon,
  addText: LangPackKey,
  removeText: LangPackKey,
  onAdd: () => void,
  onOpenCommunity: (communityId: ChatId) => void,
  onRemove: (communityId: ChatId) => Promise<void>
}) {
  const community = createMemo(() => {
    return props.communities.find((community) => {
      return community.id.toChatId() === props.linkedCommunityId;
    });
  });
  const hide = () => !!(
    props.hideWhenLinkedCommunityMissing &&
    props.linkedCommunityId &&
    !community()
  );

  return (
    <Section
      ref={props.ref}
      classList={{hide: hide()}}
      caption={
        props.hideCaptionWhenLinked && props.linkedCommunityId ?
          undefined :
          props.caption
      }
    >
      <Show
        when={props.linkedCommunityId}
        fallback={(
          <Row
            clickable={props.onAdd}
            role="button"
            tabIndex={0}
          >
            <Row.Icon icon={props.addIcon} />
            <Row.Title>{i18n(props.addText)}</Row.Title>
          </Row>
        )}
      >
        {(linkedCommunityId) => (
          <>
            <Show when={community()}>
              {(linkedCommunity) => (
                <CommunityDialogList
                  communities={[linkedCommunity()]}
                  middleware={props.middleware}
                  onClick={() => {
                    props.onOpenCommunity(linkedCommunityId());
                  }}
                />
              )}
            </Show>
            <Button
              class="btn-primary btn-transparent danger"
              icon="delete"
              text={props.removeText}
              onClick={() => props.onRemove(linkedCommunityId())}
            />
          </>
        )}
      </Show>
    </Section>
  );
}
