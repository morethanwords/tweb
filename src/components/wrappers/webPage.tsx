import {Accessor, For, JSX, Ref, Show} from 'solid-js';
import {getDirection} from '@helpers/dom/setInnerHTML';
import classNames from '@helpers/string/classNames';
import {IconTsx} from '@components/iconTsx';
import {Ripple} from '@components/rippleTsx';
import A11yButton from '@components/a11yButton';
import {Dynamic} from 'solid-js/web';

const className = 'webpage';

// * The footer's button split into buttons of their own, each with its own action (a shared
// * contact's MESSAGE | ADD) — where the caption stands for the whole box (INSTANT VIEW), these do not
export type WebPageFooterButton = {
  content: JSX.Element,
  ref?: (el: HTMLElement) => void,
  visible?: Accessor<boolean>
};

function WebPageFooter(props: {
  content?: JSX.Element,
  buttons?: WebPageFooterButton[],
  link?: boolean,
  text?: boolean,
  ref?: (el: HTMLElement) => void
}) {
  return (props?.content || props?.buttons) && (
    <div
      dir={getDirection()}
      class={classNames(
        `${className}-footer`,
        props.link && 'is-link',
        props.text && 'is-text',
        !props.text && 'is-button',
        props.buttons && 'is-split'
      )}
      ref={props.ref}
    >
      {props.buttons ? (
        <For each={props.buttons}>
          {(button) => (
            <Show when={button.visible?.() ?? true}>
              <A11yButton ripple class={`${className}-footer-button`} ref={button.ref}>
                {button.content}
              </A11yButton>
            </Show>
          )}
        </For>
      ) : props.content}
      {props.link && <IconTsx icon="arrow_next" class={`${className}-footer-icon`} />}
    </div>
  );
}

function WebPageName(props: {
  content: JSX.Element,
  tip?: {
    content: JSX.Element,
    onClick: (e: MouseEvent) => void
  }
}) {
  return props?.content && (
    <div dir={getDirection()} class={`${className}-name`}>
      <strong>
        {props.content}
      </strong>
      {props.tip && (
        <span class={`${className}-name-tip`} onClick={props.tip.onClick}>
          {props.tip.content}
        </span>
      )}
    </div>
  );
}

function WebPageTitle(text: JSX.Element) {
  return text && (
    <div dir={getDirection()} class={`${className}-title`}>
      <strong>
        {text}
      </strong>
    </div>
  );
}

function WebPageText(props: {
  children: JSX.Element
}) {
  return (
    <div dir={getDirection()} class={`${className}-text`}>
      {props.children}
    </div>
  );
}

function WebPageMedia(props: {
  ref?: Ref<HTMLDivElement>,
  content?: HTMLElement,
  position: 'top' | 'bottom',
  hasDocument?: boolean,
  photoSize?: 'vertical' | 'square'
}) {
  if(!props) {
    return;
  }

  const _className = `${className}-preview`;
  const withDocument = props.hasDocument && `${_className}-with-document`;
  if(props.content) {
    props.content.classList.add(...[_className, withDocument].filter(Boolean));
  }

  return (
    <div class={`${className}-preview-resizer`}>
      {props.content || <div ref={props.ref} class={classNames(_className, withDocument)}></div>}
    </div>
  );
}

export default function WebPageBox(props: {
  footer?: Parameters<typeof WebPageFooter>[0],
  name?: Parameters<typeof WebPageName>[0],
  title?: Parameters<typeof WebPageTitle>[0],
  text?: Parameters<typeof WebPageText>[0]['children'],
  media?: Parameters<typeof WebPageMedia>[0],
  // * a round picture at the inline start, with the name, title and text beside it (a contact's avatar)
  thumb?: JSX.Element,
  ref?: (el: HTMLAnchorElement) => void,
  class?: string,
  minContent?: boolean,
  clickable?: boolean
}) {
  const viewButton = WebPageFooter(props.footer);
  const siteName = WebPageName(props.name);
  const titleDiv = WebPageTitle(props.title);
  const previewResizer = WebPageMedia(props.media);
  const texts = (
    <>
      {siteName}
      {titleDiv}
      {props.text && <WebPageText>{props.text}</WebPageText>}
    </>
  );

  const contentDiv = (
    <div class={classNames(`${className}-content`, props.media?.hasDocument && 'has-document', props.minContent && 'min-content')}>
      {props.media?.position === 'top' && previewResizer}
      {props.thumb ? (
        <div class={`${className}-with-thumb`}>
          <div class={`${className}-thumb`}>{props.thumb}</div>
          <div class={`${className}-with-thumb-texts`}>{texts}</div>
        </div>
      ) : texts}
      {props.media?.position === 'bottom' && previewResizer}
      {viewButton}
    </div>
  );

  const quote = (
    <div
      class={classNames(
        `${className}-quote`,
        'quote-like-border'
      )}
    >
      {contentDiv}
    </div>
  );

  const ret = (
    <Dynamic
      // * a link may hold no other controls, so a box with buttons of its own is a plain element
      component={props.clickable && !props.footer?.buttons ? 'a' : 'div'}
      ref={props.ref}
      class={classNames(
        className,
        props.class,
        'quote-like',
        props.clickable && 'quote-like-hoverable',
        props.media?.photoSize && `has-${props.media.photoSize}-photo`
      )}
    >
      {quote}
    </Dynamic>
  );

  if(!props.clickable) {
    return ret;
  }

  return (
    <Ripple>{ret}</Ripple>
  );
}
