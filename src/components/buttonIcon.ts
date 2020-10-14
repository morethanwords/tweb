import { ripple } from "./ripple";

const ButtonIcon = (className: string, options: Partial<{noRipple: true, onlyMobile: true}> = {}) => {
  const button = document.createElement('button');
  button.className = `btn-icon tgico-${className}`;
  if(!options.noRipple) ripple(button);
  if(options.onlyMobile) button.classList.add('only-handhelds');
  return button;
};

export default ButtonIcon;