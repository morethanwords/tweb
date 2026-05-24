import Button from '@components/button';

const ButtonCorner = (options: Partial<{className: string, icon: Icon, noRipple: true, onlyMobile: true, asDiv: boolean}> = {}) => {
  const button = Button('btn-circle btn-corner z-depth-1' + (options.className ? ' ' + options.className : ''), options);
  button.tabIndex = -1;
  return button;
};

export default ButtonCorner;
