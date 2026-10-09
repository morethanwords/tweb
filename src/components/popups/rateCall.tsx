import {createSignal, createUniqueId, For, Show} from 'solid-js';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import InputField from '@components/inputField';
import Row from '@components/rowTsx';
import {SectionName} from '@components/section';
import createArray from '@helpers/array/createArray';
import classNames from '@helpers/string/classNames';
import {InputPhoneCall} from '@layer';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import styles from '@components/popups/rateCall.module.scss';

export const CALL_RATING_MAX = 5;

/**
 * A rating below this asks what went wrong; one at or above it is sent as it is, with no comment —
 * Android `VoIPHelper.showRateAlert`, iOS `CallRatingController`, macOS
 * `CallRatingModalViewController` all draw the line at 4 stars.
 */
export const CALL_RATING_FEEDBACK_BELOW = 4;

/** tdesktop `RateCallBox`: `kRateCallCommentLengthMax`. */
const COMMENT_MAX_LENGTH = 200;

export type CallRatingProblem =
  'distorted_video' |
  'pixelated_video' |
  'echo' |
  'noise' |
  'interruptions' |
  'distorted_speech' |
  'silent_local' |
  'silent_remote' |
  'dropped';

/**
 * What went wrong, in the official clients' order. The tag is what reaches the server: each ticked
 * problem goes into the comment as `#tag` (Android `showRateAlert`, iOS `CallFeedbackReason.hashtag`).
 * The two video problems are only asked about a video call.
 */
const PROBLEMS: Array<{tag: CallRatingProblem, langKey: LangPackKey, video?: true}> = [
  {tag: 'distorted_video', langKey: 'RateCallVideoDistorted', video: true},
  {tag: 'pixelated_video', langKey: 'RateCallVideoPixelated', video: true},
  {tag: 'echo', langKey: 'RateCallEcho'},
  {tag: 'noise', langKey: 'RateCallNoise'},
  {tag: 'interruptions', langKey: 'RateCallInterruptions'},
  {tag: 'distorted_speech', langKey: 'RateCallDistorted'},
  {tag: 'silent_local', langKey: 'RateCallSilentLocal'},
  {tag: 'silent_remote', langKey: 'RateCallSilentRemote'},
  {tag: 'dropped', langKey: 'RateCallDropped'}
];

const STARS = createArray(CALL_RATING_MAX, 0, (_: number, index: number) => index + 1);

export function getCallRatingProblems(isVideo: boolean) {
  return PROBLEMS.filter((problem) => isVideo || !problem.video);
}

/**
 * The `comment` of `phone.setCallRating`: what the user typed, then the ticked problems as hashtags
 * on a line of their own (iOS `CallFeedbackController`). A good rating carries neither — the clients
 * only ask for them below `CALL_RATING_FEEDBACK_BELOW`.
 */
export function composeCallRatingComment(rating: number, problems: CallRatingProblem[], comment = '') {
  if(rating >= CALL_RATING_FEEDBACK_BELOW) {
    return '';
  }

  const hashtags = PROBLEMS
  .filter((problem) => problems.includes(problem.tag))
  .map((problem) => '#' + problem.tag)
  .join(' ');

  return [comment.trim(), hashtags].filter(Boolean).join('\n');
}

export type RateCallPopupOptions = {
  /** The call being rated. Its access hash is gone from `phoneCallDiscarded`, so it comes from the instance. */
  call: InputPhoneCall,
  /** Asks about the picture too. */
  isVideo?: boolean,
  /** Rated from the user's own action rather than the server's `need_rating`. */
  userInitiative?: boolean,
  /** Stars to start with — the sandbox opens the "what went wrong" state with it. */
  rating?: number
};

/**
 * "Please rate the quality of your Telegram call" — five stars, and below four a list of what went
 * wrong plus an optional comment. Send rates the call; closing the popup any other way sends nothing.
 *
 * tdesktop and Android keep the choice and the sending apart (a Send button), unlike iOS and macOS,
 * which send on the tap of a star: with the stars a radio group, arrow keys move the choice, and a
 * choice that sent itself could not be walked through.
 */
export default function showRateCallPopup(options: RateCallPopupOptions) {
  const isVideo = !!options.isVideo;
  const problems = getCallRatingProblems(isVideo);

  createPopup(() => {
    const [rating, setRating] = createSignal(options.rating ?? 0);
    const [hoveredRating, setHoveredRating] = createSignal(0);
    const [checkedProblems, setCheckedProblems] = createSignal<CallRatingProblem[]>([]);
    const needsFeedback = () => rating() > 0 && rating() < CALL_RATING_FEEDBACK_BELOW;

    const groupName = createUniqueId();
    const labelId = groupName + '-label';
    const problemsLabelId = groupName + '-problems';

    // Built once, so text typed under a low rating survives a detour through a higher one.
    const commentField = new InputField({
      label: 'VoipFeedbackCommentHint',
      plainText: true,
      maxLength: COMMENT_MAX_LENGTH
    });
    commentField.container.classList.add(styles.comment);

    // The popup opens on the stars — on the chosen one if there is one, as Tab into a radio group does.
    const starInputs: HTMLInputElement[] = [];

    const toggleProblem = (tag: CallRatingProblem, checked: boolean) => {
      setCheckedProblems((tags) => checked ? [...tags, tag] : tags.filter((_tag) => _tag !== tag));
    };

    const send = () => {
      const value = rating();
      const comment = composeCallRatingComment(value, checkedProblems(), commentField.value);
      // tdesktop closes its box whether the request goes through or not: there is nothing the user
      // could do about a failed rating.
      rootScope.managers.appCallsManager.setCallRating(options.call, value, comment, options.userInitiative)
      .catch((err) => {
        console.error('phone.setCallRating failed', err);
      });
    };

    return (
      <PopupElement
        class={styles.popup}
        closable
        initialFocus={() => starInputs[Math.max(rating(), 1) - 1]}
      >
        <PopupElement.Header>
          <PopupElement.Title title="CallMessageReportProblem" />
        </PopupElement.Header>
        <PopupElement.Scrollable>
          <PopupElement.Body class={styles.body}>
            <p id={labelId} class={styles.text}>{i18n('VoipRateCallAlert')}</p>
            <div
              role="radiogroup"
              aria-labelledby={labelId}
              class={styles.stars}
              onPointerLeave={() => setHoveredRating(0)}
            >
              <For each={STARS}>{(value) => (
                <label
                  class={classNames(styles.star, value <= (hoveredRating() || rating()) && styles.isFilled)}
                  // a preview for the mouse only: a touch has no hover to take back
                  onPointerEnter={(event) => event.pointerType === 'mouse' && setHoveredRating(value)}
                >
                  <input
                    ref={(element) => starInputs[value - 1] = element}
                    type="radio"
                    class={styles.starInput}
                    name={groupName}
                    value={value}
                    checked={rating() === value}
                    aria-label={I18n.format('AccDescr.CallRatingStars', true, [value])}
                    onChange={(event) => event.currentTarget.checked && setRating(value)}
                  />
                  <svg class={styles.starIcon} viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2.75l2.86 5.8 6.4.93-4.63 4.51 1.09 6.37L12 17.35l-5.72 3.01 1.09-6.37-4.63-4.51 6.4-.93z" />
                  </svg>
                </label>
              )}</For>
            </div>
            <Show when={needsFeedback()}>
              <div role="group" aria-labelledby={problemsLabelId} class={styles.problems}>
                <SectionName ref={(element) => element.id = problemsLabelId}>{i18n('CallReportHint')}</SectionName>
                <For each={problems}>{(problem) => (
                  <Row>
                    <Row.CheckboxField>
                      <CheckboxFieldTsx
                        checked={checkedProblems().includes(problem.tag)}
                        onChange={(checked) => toggleProblem(problem.tag, checked)}
                      />
                    </Row.CheckboxField>
                    <Row.Title>{i18n(problem.langKey)}</Row.Title>
                  </Row>
                )}</For>
              </div>
              {commentField.container}
            </Show>
          </PopupElement.Body>
        </PopupElement.Scrollable>
        <PopupElement.Buttons>
          <PopupElement.Button langKey="Send" confirm disabled={!rating()} callback={send} />
          <PopupElement.Button langKey="Cancel" cancel />
        </PopupElement.Buttons>
      </PopupElement>
    );
  });
}
