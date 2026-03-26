import {createEffect, createResource, JSX, on, Show} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {Message, MessageEntity, ReplyMarkup} from '@layer';
import {generateTail} from '@components/chat/utils';
import {I18nTsx} from '@helpers/solid/i18n';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import rootScope from '@lib/rootScope';
import ReplyMarkupLayout from '@components/chat/bubbleParts/replyMarkupLayout';
import {useBubble} from '@components/chat/bubbles/context';
import Passthrough from '@helpers/solid/passthrough';

// ---------------------------------------------------------------------------
// Bubble.Layout — compound layout for the Solid bubble refactoring.
// ---------------------------------------------------------------------------

export function Layout(props: {
  children: JSX.Element
}) {
  const ctx = useBubble();
  const {store} = ctx;

  return (
    <Passthrough
      element={ctx.bubble}
      classList={{
        'bubble': true,
        'is-out': ctx.isOut(),
        'is-in': !ctx.isOut(),
        'just-media': ctx.isStandaloneMedia(),
        'can-have-tail': ctx.canHaveTail() && !ctx.isRound,
        'is-message-empty': ctx.isMessageEmpty(),
        'invert-media': ctx.invertMedia(),
        'emoji-big can-have-big-emoji': ctx.bigEmojis() > 0,
        'sticker': ctx.isSticker,
        'round': ctx.isRound,
        'is-sponsored': ctx.isSponsored,
        'with-reply-markup': !!store.replyMarkup,
        'channel-post': (ctx.message() as Message.message)?.views !== undefined,

        // name component
        'hidden-profile': ctx.state.isHiddenProfile,
        'forwarded': ctx.state.isForwarded,
        'hide-name': ctx.state.hideName !== false,

        [ctx.state.mediaClass || '']: true
      }}
    >
      {props.children}

      <div class="bubble-content-wrapper">
        <div class="bubble-content">
          {ctx.isStandaloneMedia() ? (
            <div class="name-with-reply floating-part">
              {store.name}
              {store.reply}
            </div>
          ) : (
            <>
              {store.name}
              {store.topicName}
              {store.reply}
            </>
          )}
          <Show
            when={ctx.invertMedia()}
            fallback={<>
              {store.attachment}
              {store.messageText}
            </>}
          >
            {store.messageText}
            {store.attachment}
          </Show>
          {store.factCheck}
          {store.time}
          {store.reactions}
          {store.tail}
          {store.besideButtons}
        </div>
        {store.replyMarkup}
      </div>
      {store.spoilerOverlay}
      {store.sendingStatus}
    </Passthrough>
  );
}

// ---------------------------------------------------------------------------
// BubbleLayout — legacy simple layout (used by webAppPreparedMessage.tsx)
// Kept for backward compatibility. Does NOT use BubbleContext.
// ---------------------------------------------------------------------------

function ViaUsername(props: {botId: BotId}) {
  const [resource, ctx] = createResource(async() => {
    const via = document.createElement('span');
    via.innerText = '@' + (await rootScope.managers.appPeersManager.getPeerUsername(props.botId.toPeerId()));
    via.classList.add('peer-title');
    return via
  })

  createEffect(on(() => props.botId, () => ctx.refetch()));

  return <>{resource()}</>;
}

export function BubbleLayout(props: {
  class?: string
  contentStyle?: Record<string, string>
  text?: string
  textEntities?: MessageEntity[]
  content?: JSX.Element
  tail?: boolean
  out?: boolean
  justMedia?: boolean
  group?: 'first' | 'last' | 'single'
  via?: BotId
  attachment?: JSX.Element
  replyMarkup?: ReplyMarkup.replyInlineMarkup
}) {
  const renderVia = () => (
    <span class="is-via">
      <I18nTsx key="ViaBot" />
      {' '}
      <ViaUsername botId={props.via.toPeerId()} />
    </span>
  )

  return (
    <div
      class={classNames(
        'bubble',
        props.tail && 'can-have-tail',
        props.out && 'is-out',
        (props.group === 'first' || props.group === 'single') && 'is-group-first',
        (props.group === 'last' || props.group === 'single') && 'is-group-last',
        props.via && 'must-have-name',
        props.justMedia && 'just-media',
        props.replyMarkup && 'with-reply-markup',
        props.class
      )}
    >
      <div class="bubble-content-wrapper">
        <div class="bubble-content" style={props.contentStyle}>
          {props.via && (props.justMedia ? (
            <div class="floating-part name-with-reply" dir="auto">
              <div class="name">
                {renderVia()}
              </div>
            </div>
          ) : (
            <div
              class={classNames(
                'name floating-part',
                !props.attachment && 'next-is-message'
              )}
              dir="auto"
            >
              {renderVia()}
            </div>
          ))}
          {props.attachment}
          {(props.text || props.content) && (
            <div class={classNames('message spoilers-container', props.attachment && 'mt-shorter')}>
              {props.content ?? wrapRichText(props.text, {entities: props.textEntities})}
            </div>
          )}
          {props.tail && generateTail()}
        </div>

        {props.replyMarkup && <ReplyMarkupLayout.Inline rows={props.replyMarkup.rows} />}
      </div>
    </div>
  )
}
