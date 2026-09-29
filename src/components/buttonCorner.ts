import Button from '@components/button';
import Modes from '@config/modes';
import {LangPackKey} from '@lib/langPack';

const ButtonCorner = (options: Partial<{className: string, icon: Icon, noRipple: true, onlyMobile: true, asDiv: boolean, ariaLabel: LangPackKey}> = {}) => {
  const button = Button('btn-circle btn-corner z-depth-1' + (options.className ? ' ' + options.className : ''), options);
  if(!Modes.a11y) button.tabIndex = -1;
  return button;
};

export default ButtonCorner;
