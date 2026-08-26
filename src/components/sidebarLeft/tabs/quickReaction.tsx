import {createSignal, For, onMount} from 'solid-js';
import {AvailableReaction} from '@layer';
import RadioFieldTsx from '@components/radioFieldTsx';
import Row from '@components/rowTsx';
import Section from '@components/section';
import rootScope from '@lib/rootScope';
import ReactionStickerPreview from '@components/reactionStickerPreview';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';

const QuickReaction = () => {
  const [tab] = useSuperTab();
  const promiseCollector = usePromiseCollector();
  const [reactions, setReactions] = createSignal<AvailableReaction[]>([]);
  const [selectedReaction, setSelectedReaction] = createSignal<string>();

  onMount(() => {
    tab.container.classList.add('quick-reaction-container');
  });

  promiseCollector.collect((async() => {
    const [quickReaction, availableReactions] = await Promise.all([
      rootScope.managers.appReactionsManager.getQuickReaction(),
      rootScope.managers.appReactionsManager.getAvailableReactions()
    ]);

    setReactions(availableReactions.filter((reaction) => !reaction.pFlags.inactive));
    setSelectedReaction((quickReaction as AvailableReaction).reaction);
  })());

  return (
    <Section>
      <form>
        <For each={reactions()}>{(availableReaction) => {
          return (
            <Row havePadding>
              <Row.RadioField>
                <RadioFieldTsx
                  alignRight
                  class="disable-hover"
                  checked={selectedReaction() === availableReaction.reaction}
                  name="quick-reaction"
                  value={availableReaction.reaction}
                  onChange={(checked) => {
                    if(!checked) return;
                    setSelectedReaction(availableReaction.reaction);
                    rootScope.managers.appReactionsManager.setDefaultReaction({
                      _: 'reactionEmoji',
                      emoticon: availableReaction.reaction
                    });
                  }}
                />
              </Row.RadioField>
              <Row.Title class="quick-reaction-title">{availableReaction.title}</Row.Title>
              <ReactionStickerPreview sticker={availableReaction.static_icon} />
            </Row>
          );
        }}</For>
      </form>
    </Section>
  );
};

export default QuickReaction;
