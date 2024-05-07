/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {JSX, ParentComponent, Ref, splitProps} from 'solid-js';
import {LangPackKey, FormatterArguments, i18n} from '../lib/langPack';
import {generateDelimiter} from './generateDelimiter';
import classNames from '../helpers/string/classNames';

export type SectionOptions = {
  name?: LangPackKey | HTMLElement | DocumentFragment,
  nameArgs?: FormatterArguments,
  nameRight?: JSX.Element,
  caption?: LangPackKey,
  captionArgs?: FormatterArguments,
  captionOld?: boolean,
  noDelimiter?: boolean,
  fakeGradientDelimiter?: boolean,
  noShadow?: boolean,
  class?: JSX.HTMLAttributes<HTMLDivElement>['class']
};

const className = 'sidebar-left-section';
const SectionContent: ParentComponent<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  return (
    <div class={classNames(className + '-content', props.class)}>
      {props.children}
    </div>
  );
};
const SectionCaption = (props: Pick<SectionOptions, 'caption' | 'captionArgs'>) => {
  return (
    <SectionContent class={className + '-caption'}>
      {i18n(props.caption, props.captionArgs)}
    </SectionContent>
  );
};
const Section: ParentComponent<SectionOptions & {ref?: Ref<HTMLDivElement>} & JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [, rest] = splitProps(props, ['name', 'nameArgs', 'nameRight', 'caption', 'captionArgs', 'captionOld', 'noDelimiter', 'fakeGradientDelimiter', 'noShadow', 'class']);
  return (
    <div
      class={classNames(className + '-container', props.class)}
      ref={props.ref}
      {...rest}
    >
      <div
        class={classNames(
          className,
          props.noShadow && 'no-shadow',
          props.fakeGradientDelimiter ? 'with-fake-delimiter' : props.noDelimiter && 'no-delimiter'
        )}
      >
        {props.fakeGradientDelimiter ? generateDelimiter() : (!props.noDelimiter && <hr />)}
        <SectionContent>
          {props.name && (
            <div class={classNames('sidebar-left-h2', className + '-name')}>
              {typeof(props.name) === 'string' ? i18n(props.name, props.nameArgs) : props.name}
              {props.nameRight && <div class={className + '-name-right'}>{props.nameRight}</div>}
            </div>
          )}
          {props.children}
        </SectionContent>
        {props.caption && props.captionOld && <SectionCaption {...props} />}
      </div>
      {props.caption && !props.captionOld && <SectionCaption {...props} />}
    </div>
  );
}

export default Section;
