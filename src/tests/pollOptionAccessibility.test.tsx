import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createSignal, For} from 'solid-js';
import {render} from 'solid-js/web';

vi.mock('@components/ripple', () => ({default: vi.fn()}));
vi.mock('@components/stickerPreview', () => ({StickerPreview: (): null => null}));
vi.mock('@components/wrappers/photoTsx', () => ({default: (): null => null}));
vi.mock('@components/wrappers/videoTsx', () => ({default: (): null => null}));
vi.mock('@helpers/solid/i18n', () => ({I18nTsx: (props: {key: string}) => <span>{props.key}</span>}));
vi.mock('@components/chat/bubbleParts/pollMessageContent/parts', () => ({AvatarGroup: (): null => null, GeoPreview: (): null => null}));
vi.mock('@components/chat/bubbleParts/pollMessageContent/PathDot', () => ({default: (): null => null}));
vi.mock('@components/chat/bubbleParts/pollMessageContent/PollWebPageMedia', () => ({PollWebPageMedia: (): null => null}));
vi.mock('@components/chat/bubbleParts/pollMessageContent/utils', () => ({dataPollViewerIdx: () => {}, spinnerThickness: 2}));

import Modes from '@config/modes';
import {SolidJSHotReloadGuardContext} from '@lib/solidjs/hotReloadGuard';
import {PollMessageContentPropsContext} from '@components/chat/bubbleParts/pollMessageContent/context';
import {PollOption} from '@components/chat/bubbleParts/pollMessageContent/PollOption';
import {getAnswers, moveFocusBetweenAnswers} from '@components/chat/bubbleParts/pollMessageContent/answerFocus';
import '@/tests/helpers/a11yLayer';
import pressKey from '@/tests/helpers/pressKey';

type OptionProps = Partial<Parameters<typeof PollOption>[0]>;

const disposers: (() => void)[] = [];

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
  document.documentElement.dir = '';
  Modes.a11y = true;
});

function renderAnswers(initial: OptionProps[], multiple = false) {
  const onToggle = vi.fn();
  const [answers, setAnswers] = createSignal(initial);
  const group = document.createElement('div');
  group.setAttribute('role', multiple ? 'group' : 'radiogroup');
  group.addEventListener('keydown', moveFocusBetweenAnswers);
  document.body.append(group);
  disposers.push(render(() => (
    <SolidJSHotReloadGuardContext.Provider value={{TranslatableMessageTsx: (props: any) => <span>{props.textWithEntities.text}</span>} as any}>
      <PollMessageContentPropsContext.Provider value={{peerId: 1, isOutgoing: false} as any}>
        <For each={answers()}>{(answer, index) => (
          <PollOption
            text={{text: `Answer ${initial.indexOf(answer) + 1}`, entities: []}}
            checked={false}
            tabStop={multiple || index() === 0}
            onToggle={() => onToggle(initial.indexOf(answer))}
            onFocus={() => {}}
            allowMultipleAnswers={multiple}
            hasCorrectAnswer={false}
            votePending={false}
            {...answer}
          />
        )}</For>
      </PollMessageContentPropsContext.Provider>
    </SolidJSHotReloadGuardContext.Provider>
  ), group));

  const options = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"], [role="checkbox"]'));
  return {group, options, onToggle, setAnswers};
}

describe('poll answers without the a11y layer', () => {
  beforeEach(() => Modes.a11y = false);

  it('are named radios with no tab stop, and no key votes or moves the focus', () => {
    const {options, onToggle} = renderAnswers([{}, {}]);

    expect(options).toHaveLength(2);
    expect(options[0].getAttribute('aria-checked')).toBe('false');
    expect(document.getElementById(options[0].getAttribute('aria-labelledby')).textContent).toBe('Answer 1');
    options.forEach((option) => expect(option.hasAttribute('tabindex')).toBe(false));

    for(const key of ['Enter', ' ', 'ArrowDown', 'ArrowUp']) {
      expect(pressKey(options[0], key).defaultPrevented).toBe(false);
    }
    expect(onToggle).not.toHaveBeenCalled();

    options[1].click();
    expect(onToggle).toHaveBeenCalledExactlyOnceWith(1);
  });
});

describe('poll answers with the a11y layer', () => {
  it('a radio group is one tab stop, and Enter and Space vote', () => {
    const {options, onToggle} = renderAnswers([{}, {}, {}]);

    expect(options.map((option) => option.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);

    pressKey(options[0], 'Enter');
    expect(onToggle).toHaveBeenLastCalledWith(0);
    pressKey(options[2], ' ');
    expect(onToggle).toHaveBeenLastCalledWith(2);
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('every answer of a checkbox group is a tab stop', () => {
    const {options} = renderAnswers([{checked: true}, {}], true);

    expect(options.map((option) => option.getAttribute('role'))).toEqual(['checkbox', 'checkbox']);
    expect(options.map((option) => option.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(options.map((option) => option.getAttribute('tabindex'))).toEqual(['0', '0']);
  });

  it('a pending vote takes neither keys nor clicks', () => {
    const {options, onToggle} = renderAnswers([{votePending: true}]);

    expect(options[0].getAttribute('aria-disabled')).toBe('true');
    pressKey(options[0], 'Enter');
    options[0].click();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('a voted answer stays focusable out of the tab order and says what it got', () => {
    const result = {voters: 3, percent: 75, peerIds: [] as PeerId[], chosen: true, correct: false};
    const {group, options, onToggle} = renderAnswers([{result}]);

    // * the count said in the description is hidden where it is shown, the voters' avatars beside it are not
    const count = Array.from(group.querySelectorAll('[aria-hidden="true"]')).find((element) => element.textContent === '3');
    expect(count).toBeTruthy();
    expect(count.parentElement.hasAttribute('aria-hidden')).toBe(false);
    expect(options[0].getAttribute('tabindex')).toBe('-1');
    expect(options[0].getAttribute('aria-disabled')).toBe('true');
    expect(options[0].getAttribute('aria-checked')).toBe('true');
    expect(document.getElementById(options[0].getAttribute('aria-describedby')).textContent).toBe('Chat.Poll.MembersVoted · 75%');
    pressKey(options[0], 'Enter');
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('arrows move the focus between the answers without voting, along the line in either direction', () => {
    const {options, onToggle} = renderAnswers([{}, {}, {}]);

    options[0].focus();
    expect(pressKey(options[0], 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(options[1]);
    pressKey(options[1], 'ArrowRight');
    expect(document.activeElement).toBe(options[2]);
    pressKey(options[2], 'ArrowDown');
    expect(document.activeElement).toBe(options[0]);
    pressKey(options[0], 'ArrowUp');
    expect(document.activeElement).toBe(options[2]);

    document.documentElement.dir = 'rtl';
    pressKey(options[2], 'ArrowLeft');
    expect(document.activeElement).toBe(options[0]);
    pressKey(options[0], 'ArrowRight');
    expect(document.activeElement).toBe(options[2]);

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('a deleted answer that holds the focus hands it to the next one, the last one to the one before', () => {
    const {options, setAnswers} = renderAnswers([{}, {}, {}]);

    options[1].focus();
    setAnswers((answers) => answers.filter((_, index) => index !== 1));
    expect(document.activeElement).toBe(options[2]);

    setAnswers((answers) => answers.slice(0, -1));
    expect(document.activeElement).toBe(options[0]);
  });

  it('an answer on its way out is out of the keyboard\'s way: neither the arrows nor a handed focus land on it', () => {
    const {group, options, setAnswers} = renderAnswers([{}, {}, {}, {}]);
    // * a deleted answer fading out is still in the list: one that has gone but stays, as a transition keeps it
    options[2].inert = true;
    expect(getAnswers(group)).toEqual([options[0], options[1], options[3]]);

    options[1].focus();
    pressKey(options[1], 'ArrowDown');
    expect(document.activeElement).toBe(options[3]);

    setAnswers((answers) => answers.slice(0, -1));
    expect(document.activeElement).toBe(options[1]);
  });

  it('arrows leave a checkbox group alone', () => {
    const {options} = renderAnswers([{}, {}], true);

    options[0].focus();
    expect(pressKey(options[0], 'ArrowDown').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(options[0]);
  });
});
