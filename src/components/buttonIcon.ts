import Button from '@components/button';

const ButtonIcon = (className?: (string & {}) | Icon, options: Partial<{noRipple: true, onlyMobile: true, asDiv: boolean}> = {}) => {
  const splitted = className?.split(' ');
  const button = Button('btn-icon' + (splitted?.length > 1 ? ' ' + splitted.slice(1).join(' ') : ''), {
    icon: splitted?.[0] as Icon || undefined,
    ...options
  });

  return button;
};

export default ButtonIcon;
