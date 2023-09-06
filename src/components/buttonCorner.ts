/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Button from './button';

const ButtonCorner = (options: Partial<{className: string, icon: Icon, noRipple: true, onlyMobile: true, asDiv: boolean}> = {}) => {
  const button = Button('btn-circle btn-corner z-depth-1' + (options.className ? ' ' + options.className : ''), options);
  button.tabIndex = -1;
  return button;
};

export default ButtonCorner;
