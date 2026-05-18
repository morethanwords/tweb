/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * Solid replacement for the imperative `PinnedContainer`.
 *
 * Composable namespace component (shape mirrors `tabs.tsx`):
 *
 *   <TopbarPlate modifier="message" hidden={hidden()}>
 *     <TopbarPlate.Body onClick={onFollow}>
 *       <TopbarPlate.Content>
 *         <TopbarPlate.Title>{title}</TopbarPlate.Title>
 *         <TopbarPlate.Subtitle>{subtitle}</TopbarPlate.Subtitle>
 *       </TopbarPlate.Content>
 *       <TopbarPlate.CloseButton onClick={onClose} />
 *     </TopbarPlate.Body>
 *   </TopbarPlate>
 *
 * Class names match the existing `pinned-${modifier}` SCSS so legacy
 * stylesheets (`_chatPinned.scss`) keep working. Anything single-use lives
 * in the consuming plate, not here.
 *
 * `createTopbarPlate(...)` is a bridge for class-based callers (currently
 * `topbar.ts`) that need an imperative controller with `.container` /
 * `.height` / `.isVisible()`. Once the topbar itself is rewritten to TSX
 * the bridge can be dropped — drop `<TopbarPlate>` straight into the JSX.
 */

import {Accessor, createContext, createSignal, JSX, onCleanup, Ref, useContext} from 'solid-js';
import {render} from 'solid-js/web';
import classNames from '@helpers/string/classNames';
import ripple from '@components/ripple';
import Button from '@components/buttonTsx';
import RippleElement from '@components/rippleElement';

const BASE = 'pinned-container';

type PlateContextValue = {
  modifier: string
};

const PlateContext = createContext<PlateContextValue>();

const useModifier = () => useContext(PlateContext)!.modifier;
const baseCls = (suffix: string) => `${BASE}-${suffix}`;
const modCls = (modifier: string, suffix: string) => `pinned-${modifier}-${suffix}`;

const TopbarPlate = (props: {
  /** Modifier identifier (e.g. `message`, `audio`, `translation`, `live`) — drives `pinned-${modifier}-*` classes. */
  modifier: string,
  /** Controlled hidden state. When true, applies `hide` class. */
  hidden?: boolean,
  class?: string,
  ref?: Ref<HTMLDivElement>,
  children: JSX.Element
}) => {
  return (
    <PlateContext.Provider value={{modifier: props.modifier}}>
      <div
        ref={props.ref}
        class={classNames(
          BASE,
          `pinned-${props.modifier}`,
          props.hidden && 'hide',
          props.class
        )}
      >
        {props.children}
      </div>
    </PlateContext.Provider>
  );
};

TopbarPlate.Body = (props: {
  ref?: Ref<HTMLDivElement>,
  noRipple?: boolean,
  class?: string,
  onClick?: (e: MouseEvent) => void,
  children: JSX.Element
}) => {
  const modifier = useModifier();
  return (
    <RippleElement
      component="div"
      noRipple={props.noRipple}
      class={classNames(baseCls('wrapper'), modCls(modifier, 'wrapper'), props.class)}
      onClick={props.onClick}
    >
      {props.children}
    </RippleElement>
  );
};

TopbarPlate.Content = (props: {
  class?: string,
  children: JSX.Element,
  ripple?: boolean
}) => {
  const modifier = useModifier();
  return (
    <RippleElement
      component="div"
      noRipple={!props.ripple}
      class={classNames(baseCls('content'), modCls(modifier, 'content'), props.class)}
    >
      {props.children}
    </RippleElement>
  );
};

TopbarPlate.Title = (props: {
  class?: string,
  children: JSX.Element
}) => {
  const modifier = useModifier();
  return (
    <div class={classNames(baseCls('title'), modCls(modifier, 'title'), props.class)}>
      {props.children}
    </div>
  );
};

TopbarPlate.Subtitle = (props: {
  class?: string,
  children: JSX.Element
}) => {
  const modifier = useModifier();
  return (
    <div class={classNames(baseCls('subtitle'), modCls(modifier, 'subtitle'), props.class)}>
      {props.children}
    </div>
  );
};

TopbarPlate.CloseButton = (props: {
  onClick?: (e: MouseEvent) => void,
  class?: string,
  ref?: Ref<HTMLElement>
}) => {
  const modifier = useModifier();
  return (
    <Button.Icon
      ref={props.ref}
      icon="close"
      class={classNames(baseCls('close'), modCls(modifier, 'close'), props.class)}
      onClick={props.onClick}
      noRipple
    />
  );
};

TopbarPlate.ActionButton = (props: {
  /** Set true while the previous button cross-fades out. Adds `is-leaving`. */
  leaving?: boolean,
  as?: 'button' | 'a',
  class?: string,
  onClick?: (e: MouseEvent) => void,
  ref?: Ref<HTMLElement>,
  children: JSX.Element
}) => {
  const modifier = useModifier();
  const className = () => classNames(
    baseCls('action-button'),
    modCls(modifier, 'action-button'),
    'text-overflow-no-wrap',
    props.leaving && 'is-leaving',
    props.class
  );
  return props.as === 'a' ?
    <a
      ref={props.ref as Ref<HTMLAnchorElement>}
      class={className()}
      onClick={props.onClick}
    >
      {props.children}
    </a> :
    <button
      ref={props.ref as Ref<HTMLButtonElement>}
      class={className()}
      onClick={props.onClick}
    >
      {props.children}
    </button>;
};

TopbarPlate.PrimaryButton = (props: {
  onClick: () => void,
  children: JSX.Element,
  class?: string,
  ref?: Ref<HTMLElement>
}) => {
  const modifier = useModifier();
  return (
    <Button
      ref={props.ref}
      class={classNames(baseCls('primary-button'), modCls(modifier, 'primary-button'), props.class)}
      primaryTransparent
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
};

export default TopbarPlate;

// =============================================================================
// Imperative controller — bridge for class-based callers (topbar.ts).
// =============================================================================

export type TopbarPlateController = {
  /** The plate's root DOM element. Append it wherever needed. */
  container: HTMLElement,
  /** Height read by `topbar.setFloating()`. `'auto'` = measured at runtime. */
  height: number | 'auto',
  /** Reactive hidden state — useful for outer effects that depend on visibility. */
  hidden: Accessor<boolean>,
  setHidden: (hidden: boolean) => void,
  /** Convenience for legacy `pinnedContainer.isVisible()` callers. */
  isVisible: () => boolean,
  destroy: () => void
};

export type CreateTopbarPlateOptions = {
  modifier: string,
  height: number | 'auto',
  /** Defaults to `true` — plate stays hidden until first content is ready. */
  initiallyHidden?: boolean,
  /**
   * Reactive class accessor applied to the plate root in addition to the
   * built-in `pinned-container` / `pinned-${modifier}` / `hide` classes.
   * Use this instead of mutating `controller.container.classList` from
   * imperative callers so class state stays in the Solid reactive system.
   */
  class?: Accessor<string>,
  /** Called every time `hidden` flips — typically wires `topbar.setFloating`. */
  onVisibilityChange?: (visible: boolean) => void,
  /**
   * Render fn for the plate body. Receives the live `hidden` accessor and
   * its setter so consumers can drive visibility from inside (e.g. via
   * `createEffect(() => setHidden(!shouldShow()))`).
   */
  render: (api: {
    hidden: Accessor<boolean>,
    setHidden: (hidden: boolean) => void
  }) => JSX.Element
};

/**
 * Mount a `<TopbarPlate>` detached from any parent and return an imperative
 * controller. The consumer takes ownership of `.container` and places it
 * into its own layout.
 */
export const createTopbarPlate = (options: CreateTopbarPlateOptions): TopbarPlateController => {
  const [hidden, setHiddenSignal] = createSignal(options.initiallyHidden ?? true);
  const setHidden = (next: boolean) => {
    if(hidden() === next) return;
    setHiddenSignal(next);
    options.onVisibilityChange?.(!next);
  };

  let plateEl: HTMLDivElement;
  const host = document.createElement('div');

  const dispose = render(() => (
    <TopbarPlate
      modifier={options.modifier}
      hidden={hidden()}
      class={options.class?.()}
      ref={(el) => (plateEl = el)}
    >
      {options.render({hidden, setHidden})}
    </TopbarPlate>
  ), host);

  return {
    container: plateEl!,
    height: options.height,
    hidden,
    setHidden,
    isVisible: () => !hidden(),
    destroy: () => {
      dispose();
      plateEl?.remove();
    }
  };
};
