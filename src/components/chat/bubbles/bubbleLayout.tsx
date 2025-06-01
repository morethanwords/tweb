import {createEffect, createResource, For, JSX, on} from 'solid-js';
import classNames from '../../../helpers/string/classNames';
import {MessageEntity, ReplyMarkup} from '../../../layer';
import {generateTail} from '../bubbles';
import {I18nTsx} from '../../../helpers/solid/i18n';
import wrapRichText from '../../../lib/richTextProcessor/wrapRichText';
import rootScope from '../../../lib/rootScope';
import wrapKeyboardButton from '../../wrappers/keyboardButton';
import ripple from '../../ripple';

function ViaUsername(props: { botId: BotId }) {
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
          {props.justMedia ? (
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
          )}
          {props.attachment}
          {(props.text || props.content) && (
            <div class={classNames('message spoilers-container', props.attachment && 'mt-shorter')}>
              {props.content ?? wrapRichText(props.text, {entities: props.textEntities})}
            </div>
          )}
          {props.tail && generateTail()}
        </div>

        {props.replyMarkup && (
          <div class="reply-markup">
            <For each={props.replyMarkup.rows}>
              {(row, rowIdx) => {
                return (
                  <div class="reply-markup-row">
                    <For each={row.buttons}>
                      {(button, btnIdx) => {
                        const element = () => {
                          const {buttonEl, text, buttonIcon} = wrapKeyboardButton({
                            button,
                            chat: {} as any
                          });

                          if(rowIdx() === props.replyMarkup.rows.length - 1) {
                            if(btnIdx() === 0) buttonEl.classList.add('is-first');
                            if(btnIdx() === row.buttons.length - 1) buttonEl.classList.add('is-last');
                          }

                          buttonEl.classList.add('reply-markup-button', 'rp');

                          const t = document.createElement('span');
                          t.classList.add('reply-markup-button-text');
                          t.append(text);

                          ripple(buttonEl);
                          buttonEl.append(...[buttonIcon, t]);

                          return buttonEl
                        }

                        return <>{element()}</>;
                      }}
                    </For>
                  </div>
                );
              }}
            </For>
          </div>
        )}
      </div>
    </div>
  )
}
