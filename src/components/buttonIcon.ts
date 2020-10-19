import Button from "./button";

const ButtonIcon = (className: string, options: Partial<{noRipple: true, onlyMobile: true}> = {}) => {
  const button = Button('btn-icon', {icon: className, ...options});
  return button;
};

export default ButtonIcon;