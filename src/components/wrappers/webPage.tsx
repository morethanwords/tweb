/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {JSX, Ref} from 'solid-js';
import {getDirection} from '../../helpers/dom/setInnerHTML';
import classNames from '../../helpers/string/classNames';
import {IconTsx} from '../iconTsx';
import {Ripple} from '../rippleTsx';
import {Dynamic} from 'solid-js/web';

const className = 'webpage';

function WebPageFooter(props: {
  content: JSX.Element,
  link?: boolean,
  text?: boolean,
  ref?: (el: HTMLElement) => void
}) {
  return props?.content && (
    <div
      dir={getDirection()}
      class={classNames(`${className}-footer`, props.link && 'is-link', props.text && 'is-text', !props.text && 'is-button')}
      ref={props.ref}
    >
      {props.content}
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
  ref?: (el: HTMLAnchorElement) => void,
  minContent?: boolean,
  clickable?: boolean
}) {
  const viewButton = WebPageFooter(props.footer);
  const siteName = WebPageName(props.name);
  const titleDiv = WebPageTitle(props.title);
  const previewResizer = WebPageMedia(props.media);

  const contentDiv = (
    <div class={classNames(`${className}-content`, props.media?.hasDocument && 'has-document', props.minContent && 'min-content')}>
      {props.media?.position === 'top' && previewResizer}
      {siteName}
      {titleDiv}
      {props.text && <WebPageText>{props.text}</WebPageText>}
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
      component={props.clickable ? 'a' : 'div'}
      ref={props.ref}
      class={classNames(
        className,
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
