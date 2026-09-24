import Button from '@components/button';
import {LangPackKey} from '@lib/langPack';

const ButtonCorner = (options: Partial<{className: string, icon: Icon, noRipple: true, onlyMobile: true, asDiv: boolean, ariaLabel: LangPackKey}> = {}) => {
  return Button('btn-circle btn-corner z-depth-1' + (options.className ? ' ' + options.className : ''), options);
};

export default ButtonCorner;
