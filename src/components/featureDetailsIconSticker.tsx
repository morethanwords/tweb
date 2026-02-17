import styles from './featureDetailsIconSticker.module.scss';
import Icon from './icon';

export default function createFeatureDetailsIconSticker(icon: Icon) {
  const div = document.createElement('div');
  div.className = styles.Container;
  div.appendChild(Icon(icon, styles.Icon));
  return div;
}
