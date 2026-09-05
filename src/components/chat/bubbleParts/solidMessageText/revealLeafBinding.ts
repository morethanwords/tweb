import {Accessor, createMemo, onCleanup, onMount} from 'solid-js';
import {TextWithEntities} from '@layer';
import type {
  MessageTextRevealCoordinator,
  MessageTextRevealLeaf
} from '@components/chat/bubbleParts/solidMessageText';

export type MessageTextRevealLeafBinding = {
  leaf: MessageTextRevealLeaf,
  ready: Accessor<boolean>
};

/**
 * Registers one reveal leaf and exposes whether its latest local update has
 * had visibility applied by the body coordinator. The acknowledgement signal
 * changes only for this leaf, so unchanged leaves do not wake up for every
 * global source revision.
 */
export default function createMessageTextRevealLeafBinding(options: {
  coordinator?: MessageTextRevealCoordinator,
  value: Accessor<TextWithEntities>,
  element?: Accessor<HTMLElement | undefined>
}): MessageTextRevealLeafBinding | undefined {
  const coordinator = options.coordinator;
  if(!coordinator) return;

  const leaf = coordinator.registerLeaf();
  const updateGeneration = createMemo(() => (
    leaf.update(options.value())
  ));

  const ready = createMemo(() => {
    return leaf.appliedGeneration() >= updateGeneration();
  });

  onMount(() => leaf.setElement(options.element?.()));
  onCleanup(() => leaf.dispose());
  return {leaf, ready};
}
