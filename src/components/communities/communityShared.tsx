import {createEffect, JSX, onCleanup} from 'solid-js';
import {i18n, LangPackKey} from '@lib/langPack';
import Row from '@components/rowTsx';
import RadioField from '@components/radioField';
import styles from '@components/communities/communityShared.module.scss';

export function CommunityRadioOption<T extends string>(props: {
  name: string,
  value: T,
  selected: T,
  title: LangPackKey,
  subtitle: LangPackKey,
  onSelect: (value: T) => void
}) {
  const radio = new RadioField({
    langKey: props.title,
    name: props.name,
    value: props.value
  });

  const onChange = () => {
    if(radio.checked) {
      props.onSelect(props.value);
    }
  };
  radio.input.addEventListener('change', onChange);
  createEffect(() => {
    radio.setValueSilently(props.selected === props.value);
  });
  onCleanup(() => {
    radio.input.removeEventListener('change', onChange);
  });

  return (
    <Row>
      <Row.RadioField>{radio.label}</Row.RadioField>
      <Row.Subtitle>{i18n(props.subtitle)}</Row.Subtitle>
    </Row>
  );
}

export function CommunityManagementRow(props: {
  icon: Icon,
  title: LangPackKey,
  subtitle?: JSX.Element,
  right?: JSX.Element,
  rightSecondary?: boolean,
  onClick: () => void
}) {
  const onKeyDown = (event: KeyboardEvent) => {
    if(event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      (event.currentTarget as HTMLElement).click();
    }
  };

  return (
    <Row
      clickable={props.onClick}
      role="button"
      tabIndex={0}
      on:keydown={onKeyDown}
    >
      <Row.Icon icon={props.icon} />
      <Row.Title
        titleRight={props.right}
        titleRightSecondary={props.rightSecondary}
      >
        {i18n(props.title)}
      </Row.Title>
      {props.subtitle !== undefined && (
        <Row.Subtitle>{props.subtitle}</Row.Subtitle>
      )}
    </Row>
  );
}

export function CommunityPendingRequestsRow(props: {
  count: number,
  onClick: () => void
}) {
  return (
    <CommunityManagementRow
      icon="adduser"
      title="Community.PendingRequests"
      right={
        <span class={`${styles.pendingCount} text-bold`}>
          {props.count}
        </span>
      }
      onClick={props.onClick}
    />
  );
}

export {styles as communitySharedStyles};
