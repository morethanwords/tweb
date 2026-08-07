import {JSX, ParentComponent, Ref, splitProps} from 'solid-js';
import {LangPackKey, FormatterArguments, i18n} from '@lib/langPack';
import classNames from '@helpers/string/classNames';

export type SectionOptions = {
  name?: LangPackKey | HTMLElement | DocumentFragment | JSX.Element,
  nameArgs?: FormatterArguments,
  nameRight?: JSX.Element,
  nameRef?: Ref<HTMLDivElement>,
  caption?: LangPackKey | JSX.Element,
  captionArgs?: FormatterArguments,
  captionOld?: boolean,
  captionTop?: boolean,
  captionRef?: Ref<HTMLDivElement>,
  noDelimiter?: boolean,
  noShadow?: boolean,
  noMarginBottom?: boolean,
  noContent?: boolean,
  class?: JSX.HTMLAttributes<HTMLDivElement>['class'],
  innerClass?: string,
  contentProps?: JSX.HTMLAttributes<HTMLDivElement>,
  ref?: Ref<HTMLDivElement>
};

const className = 'sidebar-left-section';
type SectionProps = SectionOptions & Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  keyof SectionOptions
>;
const SectionContent: ParentComponent<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, rest] = splitProps(props, ['ref', 'class', 'children']);
  return (
    <div
      {...rest}
      ref={local.ref}
      class={classNames(className + '-content', local.class)}
    >
      {local.children}
    </div>
  );
};
const SectionCaption = (props: Pick<SectionOptions, 'caption' | 'captionArgs' | 'captionRef'>) => {
  return (
    <SectionContent ref={props.captionRef} class={className + '-caption'}>
      {typeof props.caption === 'string' ?
        i18n(props.caption as LangPackKey, props.captionArgs) :
        props.caption}
    </SectionContent>
  );
};
const Section: ParentComponent<SectionProps> = (props) => {
  const [, rest] = splitProps(props, ['name', 'nameRef', 'nameArgs', 'nameRight', 'innerClass', 'caption', 'captionArgs', 'captionOld', 'captionTop', 'captionRef', 'noDelimiter', 'noShadow', 'noMarginBottom', 'noContent', 'class', 'contentProps', 'ref']);
  return (
    <div
      class={classNames(className + '-container', props.class)}
      ref={props.ref}
      {...rest}
    >
      {props.caption && props.captionTop && <SectionCaption {...props} />}
      {!props.noContent && (
        <div
          class={classNames(
            className,
            props.noShadow && 'no-shadow',
            props.noDelimiter && 'no-delimiter',
            props.innerClass,
            props.noMarginBottom && 'no-margin-bottom'
          )}
        >
          <SectionContent {...props.contentProps}>
            {props.name && (
              <div ref={props.nameRef} class={classNames('sidebar-left-h2', className + '-name')}>
                {typeof(props.name) === 'string' ? i18n(props.name as LangPackKey, props.nameArgs) : props.name}
                {props.nameRight && <div class={className + '-name-right'}>{props.nameRight}</div>}
              </div>
            )}
            {props.children}
          </SectionContent>
          {props.caption && !props.captionTop && props.captionOld && <SectionCaption {...props} />}
        </div>
      )}
      {props.caption && !props.captionTop && !props.captionOld && <SectionCaption {...props} />}
    </div>
  );
}

export default Section;
