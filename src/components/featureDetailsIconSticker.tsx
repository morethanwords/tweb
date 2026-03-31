import classNames from '@helpers/string/classNames';
import styles from './featureDetailsIconSticker.module.scss';
import Icon from './icon';

export default function createFeatureDetailsIconSticker(icon: Icon, className?: string) {
  const div = document.createElement('div');
  div.className = classNames(styles.Container, className);
  div.appendChild(Icon(icon, styles.Icon));
  return div;
}
