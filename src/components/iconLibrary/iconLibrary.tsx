import {Component, createSignal, JSX} from 'solid-js';

import Icons from '@/icons';

import Scrollable from '@components/scrollable2';
import {IconTsx} from '@components/iconTsx';
import Modes from '@config/modes';

import styles from '@components/iconLibrary/iconLibrary.module.scss';


const icons = Object.keys(Icons) as Icon[];

const IconLibrary: Component<{}> = () => {
  const [selected, setSelected] = createSignal('');
  const [copied, setCopied] = createSignal(false);

  let timeout = 0;

  const onMouseEnter = (icon: Icon) => {
    setSelected(icon);
    setCopied(false);
    self.clearTimeout(timeout);
  };

  const onClick = (icon: Icon) => {
    navigator.clipboard.writeText(icon).then(() => {
      setCopied(true);

      self.clearTimeout(timeout);
      timeout = self.setTimeout(() => {
        setCopied(false);
      }, 2000);
    });
  };

  return (
    <div class={/* @once */ styles.Popup}>
      <div class={/* @once */ styles.Name}>
        {selected() || 'none'}
        {copied() && ' - Copied!'}
      </div>

      <Scrollable class={/* @once */ styles.Scrollable}>
        <div class={/* @once */ styles.Grid}>
          {/* @once */ icons.map(icon => <IconItem icon={/* @once */ icon} onMouseEnter={/* @once */ [onMouseEnter, icon]} onClick={/* @once */ [onClick, icon]} />)}
        </div>
      </Scrollable>
    </div>
  );
};

const IconItem: Component<{
  icon: Icon;
  onMouseEnter: JSX.EventHandlerUnion<HTMLElement, MouseEvent>;
  onClick: JSX.EventHandlerUnion<HTMLElement, MouseEvent>;
}> = (props) => {
  if(!Modes.a11y) {
    return <IconTsx class={/* @once */ styles.Icon} icon={/* @once */ props.icon} onMouseEnter={/* @once */ props.onMouseEnter} onClick={/* @once */ props.onClick} />;
  }

  return (
    <button
      type="button"
      class={/* @once */ styles.Icon}
      aria-label={/* @once */ props.icon}
      onMouseEnter={/* @once */ props.onMouseEnter}
      onClick={/* @once */ props.onClick}
    >
      <IconTsx icon={/* @once */ props.icon} />
    </button>
  );
};

export default IconLibrary;
