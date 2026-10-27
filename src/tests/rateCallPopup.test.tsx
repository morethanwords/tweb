/*
 * The call rating popup. Its rules come from the official clients, not from this code: five
 * stars; below four (Android `VoIPHelper.showRateAlert`, iOS `CallRatingController`, macOS
 * `CallRatingModalViewController`) it asks what went wrong — the video problems only for a video
 * call — and those problems reach the server as hashtags in the comment, under what the user typed
 * (iOS `CallFeedbackController`). A rating of four or five goes without a comment. Only Send rates;
 * every other way out sends nothing.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';

const mocks = vi.hoisted(() => ({
  popupFactory: undefined as (() => any) | undefined,
  popupProps: undefined as any,
  hidden: 0,
  setCallRating: vi.fn()
}));

vi.mock('@lib/langPack', () => {
  const format = (key: string, _plain?: boolean, args?: unknown[]) => args?.length ? `${key}:${args.join('|')}` : key;
  return {
    default: {format},
    i18n: (key: string, args?: unknown[]) => {
      const element = document.createElement('span');
      element.textContent = format(key, true, args);
      return element;
    }
  };
});

vi.mock('@lib/rootScope', () => ({
  default: {
    managers: {
      appCallsManager: {setCallRating: mocks.setCallRating}
    }
  }
}));

vi.mock('@components/checkboxFieldTsx', () => ({
  default: (props: any) => (
    <input
      type="checkbox"
      checked={props.checked}
      onChange={(event) => props.onChange?.(event.currentTarget.checked)}
    />
  )
}));

vi.mock('@components/inputField', () => ({
  default: class InputField {
    public container = document.createElement('div');
    public input = document.createElement('input');

    constructor(public options: {label?: string}) {
      this.input.setAttribute('aria-label', options.label);
      this.container.append(this.input);
    }

    public get value() {
      return this.input.value;
    }
  }
}));

vi.mock('@components/rowTsx', () => {
  const Row = (props: any) => <label data-testid="problem">{props.children}</label>;
  Row.CheckboxField = (props: any) => props.children;
  Row.Title = (props: any) => <span>{props.children}</span>;
  return {default: Row};
});

vi.mock('@components/section', () => ({
  SectionName: (props: any) => <div ref={props.ref}>{props.children}</div>
}));

vi.mock('@components/popups/indexTsx', () => {
  const PopupElement = (props: any) => {
    mocks.popupProps = props;
    return <div>{props.children}</div>;
  };
  PopupElement.Header = (props: any) => <div>{props.children}</div>;
  PopupElement.Title = (props: any) => <h2 data-testid="title">{props.title}</h2>;
  PopupElement.Scrollable = (props: any) => <div>{props.children}</div>;
  PopupElement.Body = (props: any) => <div>{props.children}</div>;
  PopupElement.Buttons = (props: any) => <div>{props.children}</div>;
  // like the real one: a callback that does not return false closes the popup
  PopupElement.Button = (props: any) => (
    <button
      data-lang-key={props.langKey}
      disabled={props.disabled}
      onClick={(event) => {
        if(props.callback?.(event) !== false) {
          ++mocks.hidden;
        }
      }}
    >
      {props.langKey}
    </button>
  );

  return {
    default: PopupElement,
    createPopup: (factory: () => any) => {
      mocks.popupFactory = factory;
    }
  };
});

import showRateCallPopup, {
  composeCallRatingComment,
  getCallRatingProblems,
  RateCallPopupOptions
} from '@components/popups/rateCall';

const CALL = {_: 'inputPhoneCall' as const, id: '1', access_hash: '2'};

let container: HTMLElement;
let dispose: () => void;

function open(options: Partial<RateCallPopupOptions> = {}) {
  showRateCallPopup({call: CALL, ...options});
  container = document.createElement('div');
  document.body.append(container);
  dispose = render(() => mocks.popupFactory!(), container);
}

const stars = () => [...container.querySelectorAll<HTMLInputElement>('[role="radiogroup"] input[type="radio"]')];
const problems = () => [...container.querySelectorAll<HTMLElement>('[data-testid="problem"]')];
const button = (langKey: string) => container.querySelector<HTMLButtonElement>(`button[data-lang-key="${langKey}"]`);
const comment = () => container.querySelector<HTMLInputElement>('input[aria-label="VoipFeedbackCommentHint"]');

function pickStars(value: number) {
  const star = stars()[value - 1];
  star.checked = true;
  star.dispatchEvent(new Event('change', {bubbles: true}));
}

function tickProblem(text: string) {
  const row = problems().find((row) => row.textContent === text);
  const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event('change', {bubbles: true}));
}

beforeEach(() => {
  mocks.popupFactory = undefined;
  mocks.popupProps = undefined;
  mocks.hidden = 0;
  mocks.setCallRating.mockReset();
  mocks.setCallRating.mockResolvedValue(undefined);
});

afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});

describe('call rating comment', () => {
  it('lists the problems as hashtags under the comment, in the clients’ order', () => {
    expect(composeCallRatingComment(2, ['dropped', 'echo'], '  It was choppy  ')).toBe('It was choppy\n#echo #dropped');
    expect(composeCallRatingComment(1, ['silent_remote'])).toBe('#silent_remote');
    expect(composeCallRatingComment(3, [], 'Bad')).toBe('Bad');
    expect(composeCallRatingComment(3, [], '   ')).toBe('');
  });

  it('sends a good rating bare', () => {
    expect(composeCallRatingComment(4, ['echo'], 'fine')).toBe('');
    expect(composeCallRatingComment(5, ['noise'], 'great')).toBe('');
  });

  it('asks about the picture only for a video call', () => {
    const tags = (isVideo: boolean) => getCallRatingProblems(isVideo).map((problem) => problem.tag);
    expect(tags(false)).toEqual([
      'echo', 'noise', 'interruptions', 'distorted_speech', 'silent_local', 'silent_remote', 'dropped'
    ]);
    expect(tags(true)).toEqual([
      'distorted_video', 'pixelated_video',
      'echo', 'noise', 'interruptions', 'distorted_speech', 'silent_local', 'silent_remote', 'dropped'
    ]);
  });
});

describe('call rating popup', () => {
  it('offers five named stars as a radio group, and nothing to send yet', () => {
    open();

    expect(container.querySelector('[data-testid="title"]').textContent).toBe('CallMessageReportProblem');
    const group = container.querySelector('[role="radiogroup"]');
    expect(document.getElementById(group.getAttribute('aria-labelledby')).textContent).toBe('VoipRateCallAlert');
    expect(stars().map((star) => star.getAttribute('aria-label'))).toEqual([1, 2, 3, 4, 5].map((value) => `AccDescr.CallRatingStars:${value}`));
    expect(new Set(stars().map((star) => star.name)).size).toBe(1);
    expect(stars().some((star) => star.checked)).toBe(false);
    // the popup opens on the stars
    expect(mocks.popupProps.initialFocus()).toBe(stars()[0]);

    expect(button('Send').disabled).toBe(true);
    expect(problems()).toHaveLength(0);
    expect(comment()).toBeNull();
  });

  it('sends a good rating at once, with no comment', () => {
    open();
    pickStars(5);

    expect(problems()).toHaveLength(0);
    expect(button('Send').disabled).toBe(false);
    button('Send').click();

    expect(mocks.setCallRating).toHaveBeenCalledTimes(1);
    expect(mocks.setCallRating).toHaveBeenCalledWith(CALL, 5, '', undefined);
    expect(mocks.hidden).toBe(1);
  });

  it('asks what went wrong below four stars and sends it with the comment', () => {
    open();
    pickStars(2);

    expect(problems().map((row) => row.textContent)).toEqual([
      'RateCallEcho', 'RateCallNoise', 'RateCallInterruptions', 'RateCallDistorted',
      'RateCallSilentLocal', 'RateCallSilentRemote', 'RateCallDropped'
    ]);
    const group = container.querySelector('[role="group"]');
    expect(document.getElementById(group.getAttribute('aria-labelledby')).textContent).toBe('CallReportHint');

    tickProblem('RateCallDropped');
    tickProblem('RateCallEcho');
    comment().value = 'Lost them twice';
    button('Send').click();

    expect(mocks.setCallRating).toHaveBeenCalledWith(CALL, 2, 'Lost them twice\n#echo #dropped', undefined);
  });

  it('lists the video problems for a video call', () => {
    open({isVideo: true, rating: 2});

    expect(stars().map((star) => star.checked)).toEqual([false, true, false, false, false]);
    // opened on the chosen star, as Tab into the group would land
    expect(mocks.popupProps.initialFocus()).toBe(stars()[1]);
    expect(problems().map((row) => row.textContent).slice(0, 2)).toEqual(['RateCallVideoDistorted', 'RateCallVideoPixelated']);
    expect(problems()).toHaveLength(9);
  });

  it('drops the problems when the rating goes back up, and keeps them for when it comes down', () => {
    open();
    pickStars(3);
    tickProblem('RateCallNoise');
    comment().value = 'Hiss';

    pickStars(4);
    expect(problems()).toHaveLength(0);
    pickStars(3);
    expect(comment().value).toBe('Hiss');

    pickStars(4);
    button('Send').click();
    expect(mocks.setCallRating).toHaveBeenCalledWith(CALL, 4, '', undefined);
  });

  it('sends nothing when dismissed', () => {
    open();
    pickStars(1);
    tickProblem('RateCallDropped');

    button('Cancel').click();
    mocks.popupProps.onClose?.();

    expect(mocks.hidden).toBe(1);
    expect(mocks.setCallRating).not.toHaveBeenCalled();
  });

  it('closes even when the server turns the rating down', async() => {
    const error = new Error('CALL_PEER_INVALID');
    mocks.setCallRating.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    open({userInitiative: true});
    pickStars(5);

    button('Send').click();
    expect(mocks.hidden).toBe(1);
    expect(mocks.setCallRating).toHaveBeenCalledWith(CALL, 5, '', true);
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('phone.setCallRating failed', error));
    consoleError.mockRestore();
  });
});
