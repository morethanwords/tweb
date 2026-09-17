import {JSX, ParentComponent, Ref, splitProps} from 'solid-js';
import {LangPackKey, FormatterArguments, i18n} from '@lib/langPack';
import classNames from '@helpers/string/classNames';
import {generateDelimiter} from '@components/generateDelimiter';

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
  /** A gradient band above the section instead of the hairline — what separates it from a list above it. */
  fakeGradientDelimiter?: boolean,
  noShadow?: boolean,
  noMarginBottom?: boolean,
  noContent?: boolean,
  class?: JSX.HTMLAttributes<HTMLDivElement>['class'],
  innerClass?: string,
  contentProps?: JSX.HTMLAttributes<HTMLDivElement>,
  ref?: Ref<HTMLDivElement>
};

const className = 'sidebar-left-section';

/**
 * The pieces of a rendered `<Section>` that imperative code still reaches for. Collect them with
 * `ref` / `contentProps.ref` / `nameRef` / `captionRef` and hand this around instead of an element.
 */
export type SectionParts = {
  container: HTMLElement,
  content: HTMLElement,
  title?: HTMLElement,
  caption?: HTMLElement
};
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
  const [, rest] = splitProps(props, ['name', 'nameRef', 'nameArgs', 'nameRight', 'innerClass', 'caption', 'captionArgs', 'captionOld', 'captionTop', 'captionRef', 'noDelimiter', 'fakeGradientDelimiter', 'noShadow', 'noMarginBottom', 'noContent', 'class', 'contentProps', 'ref']);
  return (
    <div
      class={classNames(className + '-container', props.noMarginBottom && 'no-margin-bottom', props.class)}
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
            props.innerClass
          )}
        >
          {props.fakeGradientDelimiter && generateDelimiter()}
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

/**
 * A `<Section>` renders one content element. Some panels stack several inside the same
 * section (a button, then a list that is reordered by index), which needs its own element —
 * this appends one next to the existing content, like the old SettingSection's
 * `generateContentElement()` did.
 */
export function appendSectionContent(section: HTMLElement) {
  const content = document.createElement('div');
  content.classList.add(className + '-content');
  section.querySelector('.' + className).append(content);
  return content;
}

export default Section;
