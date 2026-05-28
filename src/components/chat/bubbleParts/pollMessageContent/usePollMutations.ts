import {createDelayed} from '@helpers/solid/createDelayed';
import {createMutation} from '@helpers/solid/createMutation';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import {Message} from '@layer';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {Accessor} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {NewOptionValues} from './utils';

type UsePollMutationsArgs = {
  getOverridenMessage: Accessor<Message.message>;
  isShowingResult: Accessor<boolean>;
  initialIdxFromShuffledIdx: (idx: number) => number;
  newOption: NewOptionValues;
  onSuccess: () => void;
};

/**
 * Encapsulates the vote / add-option requests fired by the poll footer.
 */
export function usePollMutations({
  getOverridenMessage,
  isShowingResult,
  initialIdxFromShuffledIdx,
  newOption,
  onSuccess
}: UsePollMutationsArgs) {
  const {rootScope} = useHotReloadGuard();

  const sendVoteMutation = createMutation(async(indexes: number[]) => {
    if(isShowingResult() || !indexes.length) return;

    const optionIndexes = indexes.map(initialIdxFromShuffledIdx).filter(idx => idx !== -1);

    await rootScope.managers.appPollsManager.sendVote(getOverridenMessage(), optionIndexes);

    onSuccess();
  });

  const wrappedSendVote = wrapAsyncClickHandler(sendVoteMutation.mutateAsync);

  // In case the vote is sent immediately, we delay the pending state to avoid showing the spinner too soon
  const delayedSendVotePending = createDelayed(sendVoteMutation.isPending, false, value => value ? 100 : -1);

  const addOptionMutation = createMutation(async() => {
    const {text, entities, attachment} = unwrap(newOption);
    if(isShowingResult() || !text || attachment?.type === 'pending') return;

    await rootScope.managers.appPollsManager.addPollAnswer(
      getOverridenMessage(),
      {
        _: 'textWithEntities',
        text,
        entities
      },
      attachment
    );

    onSuccess();
  });

  const wrappedAddOption = wrapAsyncClickHandler(addOptionMutation.mutateAsync);

  return {
    sendVoteMutation,
    wrappedSendVote,
    delayedSendVotePending,
    addOptionMutation,
    wrappedAddOption
  };
}
