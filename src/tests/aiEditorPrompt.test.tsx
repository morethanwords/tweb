import {render} from 'solid-js/web';
import {createEffect, createSignal, JSX, onMount, Show} from 'solid-js';
import {afterEach, describe, expect, test, vi} from 'vitest';
import {AiEditorPopupContext, AiEditorPopupContextValue} from '@components/popups/aiEditorPopup/context';
import {CreateWithAiPopupBody} from '@components/popups/aiEditorPopup/createWithAiPopup';
import {StyleTab} from '@components/popups/aiEditorPopup/styleTab';
import type {RichMessage} from '@layer';

const mocks = vi.hoisted(() => ({
  composedArgs: undefined as Record<string, unknown>
}));

vi.mock('@lib/solidjs/hotReloadGuard', () => ({
  useHotReloadGuard: () => ({
    rootScope: {
      managers: {
        aiTonesManager: {
          getTones: vi.fn(async() => [])
        }
      },
      myId: 1
    },
    I18n: {langCodeNormalized: () => 'en'},
    pickLanguage: vi.fn(async() => 'de'),
    useAppConfig: () => ({aicompose_tone_prompt_length_max: 12})
  })
}));

vi.mock('@components/buttonTsx', () => ({
  default: (props: {
    children: JSX.Element,
    disabled?: boolean,
    onClick?: () => void
  }) => (
    <button disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  )
}));

vi.mock('@components/ripple', () => ({default: vi.fn()}));

vi.mock('@components/popups/indexTsx', () => ({
  usePopupContext: () => ({element: document.body, hide: vi.fn()})
}));

vi.mock('@components/popups/previewCard', () => ({
  previewStyles: {
    resultLanguage: 'result-language',
    resultTitle: 'result-title'
  }
}));

vi.mock('@components/autoHeight', () => ({
  AutoHeight: (props: {children: JSX.Element, outerClass?: string}) => (
    <div data-ai-composer-section data-outer-class={props.outerClass}>
      {props.children}
    </div>
  )
}));

vi.mock('@components/iconTsx', () => ({
  IconTsx: () => <span />
}));

vi.mock('@components/inputFieldTsx', () => ({
  InputFieldTsx: (props: {
    instanceRef?: (value: {input: HTMLTextAreaElement}) => void,
    onRawInput?: (value: string) => void,
    value?: string
  }) => {
    let input!: HTMLTextAreaElement;
    onMount(() => props.instanceRef?.({input}));
    createEffect(() => {
      input.value = props.value || '';
    });
    return (
      <textarea
        data-ai-prompt-input
        ref={input}
        onInput={(event) => props.onRawInput?.(event.currentTarget.value)}
      />
    );
  }
}));

vi.mock('@components/scrollable2', () => ({
  default: (props: {children: JSX.Element, ref?: (element: HTMLDivElement) => void}) => (
    <div ref={props.ref}>{props.children}</div>
  )
}));

vi.mock('@components/skeleton', () => ({
  Skeleton: {Div: () => <div />}
}));

vi.mock('@components/space', () => ({
  default: (): null => null
}));

vi.mock('@components/section', () => ({
  default: (props: {children: JSX.Element, innerClass?: string}) => (
    <section data-ai-section data-inner-class={props.innerClass}>
      {props.children}
    </section>
  )
}));

vi.mock('@helpers/solid/heightTransition', () => ({
  HeightTransition: (props: {children: JSX.Element}) => <>{props.children}</>
}));

vi.mock('@helpers/solid/animations', () => ({
  GrowHeightReveal: (props: {children: JSX.Element, when: unknown}) => (
    <Show when={props.when}>
      <div data-grow-height>{props.children}</div>
    </Show>
  )
}));

vi.mock('@helpers/solid/i18n', () => ({
  I18nTsx: (props: {key: string}) => <>{props.key}</>
}));

vi.mock('@helpers/solid/useEdgeAutoScroll', () => ({
  useEdgeAutoScroll: vi.fn()
}));

vi.mock('@helpers/schedulers', () => ({
  doubleRaf: () => Promise.resolve()
}));

vi.mock('@hooks/useElementSize', () => ({
  default: () => ({height: 0, width: 0})
}));

vi.mock('@hooks/useScrollPosition', () => ({
  useScrollPosition: () => () => 0
}));

vi.mock('@helpers/solid/track', () => ({
  default: <T, >(callback: () => T) => callback()
}));

vi.mock('@environment/touchSupport', () => ({default: true}));

vi.mock('solid-transition-group', () => ({
  TransitionGroup: (props: {children: JSX.Element}) => <>{props.children}</>
}));

vi.mock('@components/popups/aiEditorPopup/limits', () => ({
  useMaxSavedTones: () => () => 4
}));

vi.mock('@components/popups/aiEditorPopup/createTonePopup', () => ({
  default: vi.fn()
}));

vi.mock('@components/popups/aiEditorPopup/creatorLink', () => ({
  CreatorLink: (): null => null
}));

vi.mock('@components/popups/aiEditorPopup/parts', () => ({
  cachedComposedMessages: new Map(),
  CreateTone: (): null => null,
  Divider: () => <hr />,
  Original: () => <div data-ai-original />,
  Result: (props: {composeMessageWithAiArgs: Record<string, unknown>}) => {
    createEffect((): void => {
      mocks.composedArgs = props.composeMessageWithAiArgs;
    });
    return <div data-ai-result />;
  },
  Tone: (props: {name: JSX.Element, onClick: () => void, selected?: boolean}) => (
    <button
      aria-pressed={props.selected}
      data-ai-tone
      onClick={props.onClick}
    >
      {props.name}
    </button>
  )
}));

const disposers: Array<() => void> = [];

afterEach(() => {
  while(disposers.length) disposers.pop()!();
  document.body.replaceChildren();
  mocks.composedArgs = undefined;
});

function createContext(): AiEditorPopupContextValue {
  return {
    peerId: 1 as PeerId,
    text: {_: 'textWithEntities', text: 'Original', entities: []},
    initialTones: [],
    onApply: vi.fn(),
    actionPending: () => false,
    promptTextSignal: createSignal(''),
    primaryActionSignal: createSignal(),
    resultTextSignal: createSignal(),
    resultRichMessageSignal: createSignal()
  };
}

function mountStyleTab(context: AiEditorPopupContextValue) {
  const container = document.createElement('div');
  document.body.append(container);
  const dispose = render(() => (
    <AiEditorPopupContext.Provider value={context}>
      <StyleTab />
    </AiEditorPopupContext.Provider>
  ), container);
  disposers.push(dispose);
  return container;
}

function mountCreateWithAi(context: AiEditorPopupContextValue) {
  const container = document.createElement('div');
  document.body.append(container);
  const dispose = render(() => (
    <AiEditorPopupContext.Provider value={context}>
      <CreateWithAiPopupBody />
    </AiEditorPopupContext.Provider>
  ), container);
  disposers.push(dispose);
  return container;
}

function inputPrompt(container: HTMLElement, value: string) {
  const input = container.querySelector<HTMLTextAreaElement>('[data-ai-prompt-input]')!;
  input.value = value;
  input.dispatchEvent(new InputEvent('input', {bubbles: true}));
  return input;
}

describe('AI editor custom prompt', () => {
  test('generates a non-cached single-use prompt through the primary action', async() => {
    const context = createContext();
    const container = mountStyleTab(context);

    const promptTone = container.querySelector<HTMLButtonElement>('[data-ai-tone]')!;
    promptTone.click();
    inputPrompt(container, 'Be concise');

    const action = context.primaryActionSignal[0]();
    expect(action.langKey).toBe('AiEditor.Generate');
    expect(action.disabled()).toBe(false);
    action.onClick();
    await Promise.resolve();

    expect(mocks.composedArgs).toMatchObject({
      customPrompt: 'Be concise',
      emojify: false,
      text: context.text
    });
  });

  test('creates a rich message and applies it through the shared composer section', async() => {
    const context = createContext();
    const onApplyRichMessage = vi.fn();
    context.onApplyRichMessage = onApplyRichMessage;
    const container = mountCreateWithAi(context);
    const button = container.querySelector<HTMLButtonElement>('button')!;

    expect(container.querySelectorAll('[data-ai-section]')).toHaveLength(1);
    expect(container.querySelector('[data-grow-height]')).toBeNull();
    expect(button.disabled).toBe(true);
    inputPrompt(container, 'Create plan');
    expect(button.disabled).toBe(false);
    button.click();
    await Promise.resolve();

    expect(container.querySelectorAll('[data-ai-section]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-ai-composer-section]')).toHaveLength(1);
    expect(container.querySelector('[data-grow-height]')).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>('[data-ai-composer-section]')!.dataset.outerClass
    ).toContain('createResult');
    expect(mocks.composedArgs).toMatchObject({
      createRichMessage: true,
      customPrompt: 'Create plan',
      emojify: false,
      text: {_: 'textWithEntities', text: '', entities: []},
      translateTo: 'en'
    });

    const result: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockParagraph',
        text: {_: 'textPlain', text: 'Generated plan'}
      }],
      photos: [],
      documents: []
    };
    context.resultRichMessageSignal[1](result);
    button.click();

    expect(onApplyRichMessage).toHaveBeenCalledWith(result);
  });

  test('keeps prompt text until the popup context is destroyed', () => {
    const context = createContext();
    let container = mountStyleTab(context);
    container.querySelector<HTMLButtonElement>('[data-ai-tone]')!.click();
    inputPrompt(container, 'Keep this');

    disposers.pop()!();
    container.remove();
    container = mountStyleTab(context);

    expect(container.querySelector('[data-ai-prompt-input]')).toBeNull();
    container.querySelector<HTMLButtonElement>('[data-ai-tone]')!.click();
    expect(container.querySelector<HTMLTextAreaElement>('[data-ai-prompt-input]')!.value)
    .toBe('Keep this');
  });

  test('disables Generate for blank and over-limit prompts', () => {
    const context = createContext();
    const container = mountStyleTab(context);
    container.querySelector<HTMLButtonElement>('[data-ai-tone]')!.click();

    inputPrompt(container, '   ');
    expect(context.primaryActionSignal[0]().disabled()).toBe(true);

    inputPrompt(container, '1234567890123');
    expect(context.primaryActionSignal[0]().disabled()).toBe(true);

    inputPrompt(container, 'Within limit');
    expect(context.primaryActionSignal[0]().disabled()).toBe(false);
  });
});
