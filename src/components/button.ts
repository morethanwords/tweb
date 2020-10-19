import { ripple } from "./ripple";

const Button = (className: string, options: Partial<{noRipple: true, onlyMobile: true, icon: string}> = {}) => {
  const button = document.createElement('button');
  button.className = className + (options.icon ? ' tgico-' + options.icon : '');
  if(!options.noRipple) ripple(button);
  if(options.onlyMobile) button.classList.add('only-handhelds');
  return button;
};

export default Button;