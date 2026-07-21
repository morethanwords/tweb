import {createDelayed} from '@helpers/solid/createDelayed';
import {createMutation} from '@helpers/solid/createMutation';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import {Message} from '@layer';
import {parsePollVoteRestrictionError, PollVoteRestriction} from '@appManagers/utils/polls/pollVoteRestriction';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {Accessor} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {NewOptionValues} from './utils';

type UsePollMutationsArgs = {
  getOverridenMessage: Accessor<Message.message>;
  isShowingResult: Accessor<boolean>;
  initialIdxFromShuffledIdx: (idx: number) => number;
  newOption: NewOptionValues;
  activeVoteRestriction: Accessor<PollVoteRestriction | undefined>;
  onVoteRestriction: (restriction?: PollVoteRestriction) => void;
  showVoteRestriction: (restriction: PollVoteRestriction) => void;
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
  activeVoteRestriction,
  onVoteRestriction,
  showVoteRestriction,
  onSuccess
}: UsePollMutationsArgs) {
  const {rootScope} = useHotReloadGuard();

  const sendVoteMutation = createMutation(async(indexes: number[]) => {
    if(isShowingResult() || !indexes.length) return;

    const message = getOverridenMessage();
    if(message.media?._ !== 'messageMediaPoll') return;

    const restriction = activeVoteRestriction();
    if(restriction) {
      showVoteRestriction(restriction);
      return;
    }

    const optionIndexes = indexes.map(initialIdxFromShuffledIdx).filter(idx => idx !== -1);

    try {
      await rootScope.managers.appPollsManager.sendVote(message, optionIndexes);
    } catch(error) {
      const restriction = parsePollVoteRestrictionError((error as ApiError)?.type);
      if(!restriction) throw error;

      onVoteRestriction(restriction);
      const activeRestriction = activeVoteRestriction();
      if(activeRestriction) showVoteRestriction(activeRestriction);
      return;
    }

    onVoteRestriction();
    onSuccess();
  });

  const wrappedSendVote = wrapAsyncClickHandler(sendVoteMutation.mutateAsync);

  // In case the vote is sent immediately, we delay the pending state to avoid showing the spinner too soon
  const delayedSendVotePending = createDelayed(sendVoteMutation.isPending, false, value => value ? 100 : -1);

  const addOptionMutation = createMutation(async() => {
    const {text, entities, attachment} = unwrap(newOption);
    if(isShowingResult() || !text || attachment?.type === 'pending') return;

    const restriction = activeVoteRestriction();
    if(restriction) {
      showVoteRestriction(restriction);
      return;
    }

    try {
      await rootScope.managers.appPollsManager.addPollAnswer(
        getOverridenMessage(),
        {
          _: 'textWithEntities',
          text,
          entities
        },
        attachment
      );
    } catch(error) {
      const restriction = parsePollVoteRestrictionError((error as ApiError)?.type);
      if(!restriction) throw error;

      onVoteRestriction(restriction);
      const activeRestriction = activeVoteRestriction();
      if(activeRestriction) showVoteRestriction(activeRestriction);
      return;
    }

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
