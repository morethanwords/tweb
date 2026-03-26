import {createRoot, createSignal} from 'solid-js';
import {useBubble} from '@components/chat/bubbles/context';
import {Message, FactCheck, TextWithEntities} from '@layer';
import WebPageBox from '@components/wrappers/webPage';
import {i18n} from '@lib/langPack';
import I18n from '@lib/langPack';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import wrapTextWithEntities from '@lib/richTextProcessor/wrapTextWithEntities';
import showTooltip from '@components/tooltip';

/**
 * Bubble.FactCheck — renders the fact check box.
 * Self-contained: reads from BubbleContext.
 */
export default function FactCheckComponent() {
  const ctx = useBubble();
  const message = ctx.message();

  if(message._ !== 'message' || !message.factcheck) {
    return ctx.register('factCheck', undefined);
  }

  const factCheck = message.factcheck;

  return ctx.register('factCheck', (() => {
    let ref: HTMLDivElement;

    createRoot((dispose) => {
      ctx.middleware.onDestroy(dispose);

      const getCountry = () => I18n.countriesList.find((country) => country.iso2 === factCheck.country);
      const getCountryName = () => {
        const country = getCountry();
        return country?.name || country?.default_name || '';
      };

      const [textWithEntities, setTextWithEntities] = createSignal<TextWithEntities>();

      const onFactCheck = (fc: FactCheck) => {
        setTextWithEntities(fc.text);
      };

      if(!factCheck.text) {
        ctx.bubbles.managers.appMessagesManager.getFactCheck(message.peerId, message.mid)
        .then((fc: FactCheck) => {
          ctx.bubbles.modifyBubble(() => {
            onFactCheck(fc);
          });
        });
      } else {
        onFactCheck(factCheck);
      }

      WebPageBox({
        footer: {
          content: i18n('FactCheckFooter', [getCountryName()]),
          text: true
        },
        name: {
          content: i18n('FactCheck'),
          tip: {
            content: i18n('FactCheckWhat'),
            onClick: (e) => {
              showTooltip({
                element: e.target as HTMLElement,
                container: ctx.bubbles.container,
                vertical: 'top',
                textElement: i18n('FactCheckToast', [getCountryName()])
              });
            }
          }
        },
        get text() {
          if(!textWithEntities()) {
            return i18n('Loading');
          }

          const {text, entities} = wrapTextWithEntities(textWithEntities());
          return wrapRichText(text, {entities});
        },
        ref: (box) => {
          ref.replaceWith(box);
        },
        minContent: true
      });
    });

    return <div ref={ref!} />;
  })());
}
