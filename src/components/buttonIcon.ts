/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Button from './button';

const ButtonIcon = (className?: string, options: Partial<{noRipple: true, onlyMobile: true, asDiv: boolean}> = {}) => {
  const button = Button('btn-icon', {
    icon: className || undefined,
    ...options
  });

  return button;
};

export default ButtonIcon;
