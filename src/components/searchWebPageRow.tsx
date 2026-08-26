import {JSX} from 'solid-js';
import RowTsx from '@components/rowTsx';
import type {Middleware} from '@helpers/middleware';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';
import setBlankToAnchor from '@richTextProcessor/setBlankToAnchor';

type SearchWebPageRowLink = {
  href: string,
  onClick?: string,
  targetBlank?: boolean
};

type SearchWebPageRowProps = {
  title: JSX.Element,
  titleRight: JSX.Element,
  subtitle: JSX.Element,
  media: HTMLElement,
  link?: SearchWebPageRowLink
};

function SearchWebPageRow(props: SearchWebPageRowProps) {
  const setRef = (element: HTMLElement) => {
    if(!props.link) return;

    const anchor = element as HTMLAnchorElement;
    anchor.href = props.link.href;
    if(props.link.onClick) {
      anchor.setAttribute('onclick', props.link.onClick);
    }

    if(props.link.targetBlank) {
      setBlankToAnchor(anchor);
    }
  };

  return (
    <RowTsx
      ref={setRef}
      as={props.link ? 'a' : undefined}
      clickable
      havePadding
      noRipple
    >
      <RowTsx.Title titleRight={props.titleRight}>{props.title}</RowTsx.Title>
      <RowTsx.Subtitle>{props.subtitle}</RowTsx.Subtitle>
      <RowTsx.Media element={props.media} size="big" />
    </RowTsx>
  );
}

export function renderSearchWebPageRow(
  props: SearchWebPageRowProps & {middleware: Middleware}
) {
  return wrapSolidComponent(() => (
    <SearchWebPageRow
      title={props.title}
      titleRight={props.titleRight}
      subtitle={props.subtitle}
      media={props.media}
      link={props.link}
    />
  ), props.middleware);
}
