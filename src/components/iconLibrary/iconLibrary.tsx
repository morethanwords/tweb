import {Component, createSignal, JSX} from 'solid-js';

import Icons from '../../icons';

import Scrollable from '../scrollable2';
import {IconTsx} from '../iconTsx';

import styles from './iconLibrary.module.scss';


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
  onMouseEnter: JSX.EventHandlerUnion<HTMLSpanElement, MouseEvent>;
  onClick: JSX.EventHandlerUnion<HTMLSpanElement, MouseEvent>;
}> = (props) => {
  return <IconTsx class={/* @once */ styles.Icon} icon={/* @once */ props.icon} onMouseEnter={/* @once */ props.onMouseEnter} onClick={/* @once */ props.onClick} />;
};

export default IconLibrary;
