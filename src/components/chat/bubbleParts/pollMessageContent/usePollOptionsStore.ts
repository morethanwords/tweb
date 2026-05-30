import {createComputed, untrack} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';
import compareUint8Arrays from '@helpers/bytes/compareUint8Arrays';
import {PollAnswer} from '@layer';
import {PollMessageContentProps} from './PollMessageContent';
import {shouldShufflePollOptions, shufflePollOptions} from './shuffle';

type UsePollOptionsStoreArgs = {
  props: PollMessageContentProps;
  userId: PeerId;
};

/**
 * Stores poll options in a reactive store, applying shuffling on init
 * and reconciling new/removed options as the poll updates.
 */
export function usePollOptionsStore({props, userId}: UsePollOptionsStoreArgs) {
  let initialOptions = props.poll.answers.filter(answer => answer._ === 'pollAnswer');

  if(shouldShufflePollOptions(props.poll)) {
    initialOptions = shufflePollOptions({
      options: initialOptions,
      userId,
      pollId: props.poll.id
    });
  }

  const [pollOptions, setPollOptions] = createStore<PollAnswer.pollAnswer[]>(initialOptions);

  createComputed(() => {
    const filteredOptions = props.poll.answers.filter(answer => answer._ === 'pollAnswer');

    // Keep the order after intial shuffle and append new options at the end when the poll was already rendered
    filteredOptions.forEach((option) => {
      const idx = untrack(() => pollOptions.findIndex(other => compareUint8Arrays(other.option, option.option)));
      if(idx === -1) setPollOptions(untrack(() => pollOptions.length), option);
      else setPollOptions(idx, reconcile(option));
    });

    // Remove options that are no longer in the poll
    setPollOptions(prev =>
      prev.filter(option => filteredOptions.some(other => compareUint8Arrays(option.option, other.option)))
    );
  });

  return [pollOptions, setPollOptions] as const;
}
