import {JSX, Ref} from 'solid-js';
import {IconTsx} from '@components/iconTsx';
import Row from '@components/rowTsx';

const CLASS_NAME = 'usernames';

export default function UsernameRow(props: {
  ref?: (container: HTMLElement) => void,
  active?: boolean,
  sortable?: boolean,
  sortingEnabled?: boolean,
  dragging?: boolean,
  sortHandlePointerDown?: JSX.EventHandler<HTMLSpanElement, PointerEvent>,
  clickable?: boolean | JSX.HTMLAttributes<HTMLElement>['onClick'],
  isLink?: boolean,
  icon?: Icon,
  color?: string,
  style?: JSX.CSSProperties,
  title?: JSX.Element,
  subtitle?: JSX.Element,
  titleRight?: JSX.Element,
  subtitleRight?: JSX.Element,
  titleRef?: Ref<HTMLDivElement>,
  subtitleRef?: Ref<HTMLDivElement>,
  mediaRef?: Ref<HTMLDivElement>
}) {
  const icon = () => props.icon || 'limit_link';
  return (
    <Row
      ref={props.ref}
      class={`${CLASS_NAME}-username`}
      style={props.style}
      classList={{
        'active': !!props.active,
        'is-link': !!props.isLink,
        'is-paid': !!props.isLink && icon() === 'link_paid',
        'row-sortable': !!props.sortable,
        'cant-sort': !!props.sortable && !props.sortingEnabled,
        'is-dragging': !!props.dragging
      }}
      clickable={props.clickable ?? true}
    >
      <Row.Title
        ref={props.titleRef}
        class={props.isLink ? 'text-bold' : undefined}
        titleRight={props.titleRight}
      >
        {props.title}
      </Row.Title>
      <Row.Subtitle
        ref={props.subtitleRef}
        class={`${CLASS_NAME}-username-status`}
        subtitleRight={props.subtitleRight}
      >
        {props.subtitle}
      </Row.Subtitle>
      <Row.Media
        ref={props.mediaRef}
        size="abitbigger"
        class={`${CLASS_NAME}-username-icon avatar-gradient`}
        data-color={props.color}
      >
        <IconTsx icon={icon()} />
      </Row.Media>
      {props.sortable && (
        <IconTsx
          icon="menu"
          class="row-sortable-icon row-sortable-handle"
          on:click={(event) => event.stopPropagation()}
          onPointerDown={props.sortHandlePointerDown}
        />
      )}
    </Row>
  );
}
