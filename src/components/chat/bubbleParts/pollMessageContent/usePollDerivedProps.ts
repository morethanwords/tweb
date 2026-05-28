import {useCreatePollLimits} from '@components/popups/createPoll/useCreatePollLimits';
import compareUint8Arrays from '@helpers/bytes/compareUint8Arrays';
import {Document, InputMedia, Message, MessageMedia, Photo, PollAnswer} from '@layer';
import getPeerId from '@lib/appManagers/utils/peers/getPeerId';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {Accessor, createMemo, createResource} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {PollMessageContentProps} from './PollMessageContent';
import {getRoundedPercentsFromResults} from './roundPercents';
import {shouldShufflePollOptions} from './shuffle';
import {PollOptionResult} from './utils';


type UsePollDerivedPropsArgs = {
  props: PollMessageContentProps;
  pollOptions: PollAnswer.pollAnswer[];
  chosenIndexes: Accessor<number[]>;
  newOptionText: Accessor<string>;
};

const getPhoto = (media: MessageMedia | InputMedia | undefined): Photo.photo | undefined => {
  return media?._ === 'messageMediaPhoto' && media.photo?._ === 'photo' ? unwrap(media.photo) : undefined;
};

const getVideoDocument = (media: MessageMedia | InputMedia | undefined): Document.document | undefined => {
  return media?._ === 'messageMediaDocument' &&
    media.document?._ === 'document' && ['video', 'gif'].includes(media.document.type) ?
      unwrap(media.document) :
      undefined;
};

export type GetStickerMediaResult = {
  media: MessageMedia.messageMediaDocument | undefined;
  document: Document.document | undefined;
};

const getStickerMedia = (media: MessageMedia | InputMedia | undefined): GetStickerMediaResult => {
  if(media?._ === 'messageMediaDocument' && media.document?._ === 'document' && media.document.sticker) {
    return {media: unwrap(media), document: unwrap(media.document)};
  }
};

const getDocument = (media: MessageMedia | InputMedia | undefined): Document.document | undefined => {
  return media?._ === 'messageMediaDocument' && media.document?._ === 'document' ? unwrap(media.document) : undefined;
};


const getGeo = (media: MessageMedia | InputMedia | undefined): MessageMedia.messageMediaGeo | undefined => {
  // Intentionally only handles plain `messageMediaGeo`. Venues and live
  // locations are ignored here per the poll-option rendering requirements.
  return media?._ === 'messageMediaGeo' ? unwrap(media) : undefined;
};

/**
 * Returns the various memos derived from the poll props plus helper
 * functions (`getOverridenMessage`, `getResultForOption`, ...).
 */
export function usePollDerivedProps({props, pollOptions, chosenIndexes, newOptionText}: UsePollDerivedPropsArgs) {
  const {rootScope} = useHotReloadGuard();
  const {maxOptions} = useCreatePollLimits();

  const [timeOffset] = createResource(() => rootScope.managers.timeManager.getServerTimeOffset());

  const question = () => props.poll.question;
  const descriptionText = () => props.message.message;
  const descriptionEntities = () => props.message.entities;

  const allowAddingOptions = createMemo(() => !!props.poll.pFlags.open_answers);
  const allowMultipleAnswers = createMemo(() => !!props.poll.pFlags.multiple_choice);
  const hasCorrectAnswer = createMemo(() => !!props.poll.pFlags.quiz);
  const shuffleOptions = createMemo(() => shouldShufflePollOptions(props.poll));
  const showWhoVoted = createMemo(() => !!props.poll.pFlags.public_voters);
  const closed = createMemo(() => !!props.poll.pFlags.closed);
  const hideResults = createMemo(() => !!props.poll.pFlags.hide_results_until_close && !closed() && !props.poll.pFlags.creator);
  const closesAtTimestamp = createMemo(() => timeOffset.state === 'ready' ? props.poll.close_date - timeOffset() : 0);

  const votersCount = createMemo(() => props.results?.total_voters ?? 0);
  const recentVoters = createMemo(() => props.results?.recent_voters?.map(peer => getPeerId(peer)) ?? []);

  const roundedPercents = createMemo(() => getRoundedPercentsFromResults(props.results));

  const hasMediaInOptions = createMemo(() =>
    props.poll.answers.some(a => !!getPhoto(a.media) || !!getStickerMedia(a.media) || !!getGeo(a.media) || !!getVideoDocument(a.media))
  );

  const isShowingResult = createMemo(() => !!props.poll.chosenIndexes?.length || props.poll.pFlags.closed);
  const hasExplanation = createMemo(() => isShowingResult() && (!!props.results.solution || !!props.results.solution_media));
  const hasSelectedSomething = createMemo(() => chosenIndexes().length > 0);
  const hasTypedNewOption = createMemo(() => newOptionText().length > 0);
  const canShowAddOption = createMemo(() => allowAddingOptions() && !isShowingResult() && pollOptions.length < maxOptions());
  const canShowCloseTimer = createMemo(() =>
    !props.poll.pFlags.closed && !!closesAtTimestamp() && closesAtTimestamp() > new Date().getTime() / 1000
  );
  const canShowViewResults = createMemo(() => showWhoVoted() && !!props.results.results?.some(r => !!r.voters) && isShowingResult());

  // The footer will have the clickable classname added/removed only after the out animation has finished
  const willFooterBeClickable = createMemo(() => canShowViewResults() || hasSelectedSomething() || hasTypedNewOption());

  const getOverridenMessage = (): Message.message => ({
    ...unwrap(props.message),
    media: {
      _: 'messageMediaPoll',
      ...unwrap(props.media),
      // On poll_update, only the poll and results are updated, not the message itself
      poll: unwrap(props.poll),
      results: unwrap(props.results)
    }
  });

  const explanationPhoto = createMemo(() => getPhoto(props.results.solution_media));
  const explanationVideo = createMemo(() => getVideoDocument(props.results.solution_media));
  const explanationDocument = createMemo(() => !getVideoDocument(props.results.solution_media) ? getDocument(props.results.solution_media) : undefined);
  const explanationGeo = createMemo(() => getGeo(props.results.solution_media));

  const descriptionPhoto = createMemo(() => getPhoto(props.media.attached_media));
  const descriptionVideo = createMemo(() => getVideoDocument(props.media.attached_media));
  const descriptionDocument = createMemo(() => !getVideoDocument(props.media.attached_media) ? getDocument(props.media.attached_media) : undefined);
  const descriptionGeo = createMemo(() => getGeo(props.media.attached_media));


  const initialIdxFromShuffledIdx = (idx: number) => {
    const shuffledOption = pollOptions[idx]?.option;

    return props.poll.answers.findIndex(
      other => other._ === 'pollAnswer' &&
        other.option &&
        shuffledOption &&
        compareUint8Arrays(other.option, shuffledOption)
    );
  };

  const getResultForOption = (initialIdx: number): PollOptionResult => {
    if(!isShowingResult()) return undefined;
    const result = props.results?.results?.[initialIdx];
    return {
      correct: props.poll.correctIndexes?.includes(initialIdx) ?? false,
      chosen: props.poll.chosenIndexes?.includes(initialIdx) ?? false,
      percent: roundedPercents()[initialIdx],
      voters: result?.voters ?? 0,
      peerIds: result?.recent_voters?.map(peer => getPeerId(peer)) ?? []
    };
  };

  const getPhotoForOption = (initialIdx: number) =>
    getPhoto(props.poll.answers[initialIdx]?.media);

  const getVideoForOption = (initialIdx: number) =>
    getVideoDocument(props.poll.answers[initialIdx]?.media);

  const getStickerForOption = (initialIdx: number) =>
    getStickerMedia(props.poll.answers[initialIdx]?.media);

  const getGeoForOption = (initialIdx: number) =>
    getGeo(props.poll.answers[initialIdx]?.media);

  return {
    question,
    descriptionText,
    descriptionEntities,
    allowAddingOptions,
    allowMultipleAnswers,
    hasCorrectAnswer,
    shuffleOptions,
    showWhoVoted,
    closed,
    hideResults,
    closesAtTimestamp,
    votersCount,
    recentVoters,
    roundedPercents,
    hasMediaInOptions,
    hasExplanation,
    hasSelectedSomething,
    isShowingResult,
    hasTypedNewOption,
    canShowAddOption,
    canShowCloseTimer,
    canShowViewResults,
    willFooterBeClickable,
    explanationPhoto,
    explanationVideo,
    explanationDocument,
    explanationGeo,
    descriptionPhoto,
    descriptionVideo,
    descriptionDocument,
    descriptionGeo,
    getPhoto,
    getOverridenMessage,
    initialIdxFromShuffledIdx,
    getResultForOption,
    getPhotoForOption,
    getVideoForOption,
    getStickerForOption,
    getGeoForOption
  };
}
