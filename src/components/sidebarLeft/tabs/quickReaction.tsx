import {onMount} from 'solid-js';
import {AvailableReaction} from '@layer';
import RadioField from '@components/radioField';
import Row, {RadioFormFromRows} from '@components/row';
import Section from '@components/section';
import rootScope from '@lib/rootScope';
import wrapStickerToRow from '@components/wrappers/stickerToRow';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';

const QuickReaction = () => {
  const [tab] = useSuperTab();
  const promiseCollector = usePromiseCollector();

  let containerEl!: HTMLDivElement;

  onMount(() => {
    tab.container.classList.add('quick-reaction-container');
  });

  promiseCollector.collect((async() => {
    const [quickReaction, availableReactions] = await Promise.all([
      rootScope.managers.appReactionsManager.getQuickReaction(),
      rootScope.managers.appReactionsManager.getAvailableReactions()
    ]);

    const reactions = availableReactions.filter((reaction) => !reaction.pFlags.inactive);

    const name = 'quick-reaction';
    const rows = reactions.map((availableReaction) => {
      const radioField = new RadioField({
        name,
        text: availableReaction.title,
        value: availableReaction.reaction,
        alignRight: true
      });

      const row = new Row({
        radioField,
        havePadding: true
      });

      radioField.main.classList.add('quick-reaction-title');

      wrapStickerToRow({
        row,
        doc: availableReaction.static_icon,
        size: 'small'
      });

      if(availableReaction.reaction === (quickReaction as AvailableReaction).reaction) {
        radioField.setValueSilently(true);
      }

      return row;
    });

    const form = RadioFormFromRows(rows, (value) => {
      rootScope.managers.appReactionsManager.setDefaultReaction({_: 'reactionEmoji', emoticon: value});
    });

    containerEl.replaceChildren(form);
  })());

  return (
    <Section>
      <div ref={containerEl} />
    </Section>
  );
};

export default QuickReaction;
