import {JSX} from 'solid-js';
import classNames from '@helpers/string/classNames';
import currencyStarIcon from '@components/currencyStarIcon';
import useStars from '@stores/stars';
import {i18n} from '@lib/langPack';
import {formatNanoton} from '@helpers/nanoton';
import {IconTsx} from '@components/iconTsx';

export function StarsStrokeStar(props: {stroke?: boolean, style?: JSX.HTMLAttributes<HTMLDivElement>['style']}) {
  return (
    <svg class={classNames('stars-star-icon', props.stroke && 'stars-star-icon-stroke')} width="26" height="25" viewBox="0 0 26 25" fill="none" xmlns="http://www.w3.org/2000/svg" style={props.style}>
      {props.stroke && <path d="M1.55275 9.54149L2.08783 9.9899L1.55275 9.54149C0.839803 10.3922 0.951509 11.6599 1.80225 12.3728L3.70157 13.9645C4.85897 14.9344 6.38486 15.3453 7.87281 15.0877L10.9718 14.5512L8.2359 15.8647C6.9783 16.4685 6.05307 17.5988 5.70955 18.9509L4.94315 21.9674C4.80966 22.4929 4.89409 23.0499 5.17728 23.5122C5.75711 24.4587 6.99445 24.7559 7.94094 24.1761L12.8919 21.1432C12.9484 21.1085 13.0197 21.1085 13.0762 21.1432L18.0678 24.201C18.5226 24.4796 19.0695 24.5661 19.5881 24.4412C20.6672 24.1815 21.3315 23.096 21.0717 22.0169L19.7036 16.3336C19.6881 16.269 19.7101 16.2012 19.7607 16.1581L24.2107 12.3643L23.616 11.6668L24.2107 12.3643C24.617 12.0179 24.8688 11.524 24.9105 10.9917C24.9971 9.8851 24.1702 8.91782 23.0636 8.83122L17.2288 8.37458C17.1626 8.3694 17.1049 8.32752 17.0795 8.26619L16.2326 8.61702L17.0795 8.26619L14.8408 2.86217C14.6368 2.36977 14.2456 1.97856 13.7532 1.77457C12.7278 1.34976 11.5521 1.83669 11.1273 2.86216L8.88858 8.26619C8.86318 8.32752 8.8055 8.3694 8.73932 8.37458L2.93635 8.82872C2.39814 8.87084 1.8995 9.12772 1.55275 9.54149Z" stroke="var(--star-background-color)" stroke-width="1.83333"/>}
      <path fill-rule="evenodd" clip-rule="evenodd" d="M12.413 20.3615L7.4621 23.3945C6.9473 23.7098 6.27431 23.5482 5.95894 23.0333C5.80491 22.7819 5.75899 22.4789 5.8316 22.1931L6.598 19.1766C6.87465 18.0876 7.61981 17.1774 8.63265 16.6911L14.0338 14.0979C14.2857 13.977 14.3918 13.6749 14.2709 13.4231C14.173 13.2191 13.9516 13.105 13.7287 13.1436L7.71644 14.1845C6.49429 14.3961 5.24099 14.0586 4.29035 13.2619L2.39103 11.6702C1.92831 11.2825 1.86756 10.593 2.25533 10.1303C2.44393 9.90522 2.71514 9.7655 3.00787 9.74259L8.81084 9.28846C9.2208 9.25637 9.57808 8.99693 9.73546 8.61702L11.9741 3.21299C12.2052 2.65524 12.8447 2.39039 13.4024 2.62145C13.6702 2.7324 13.883 2.94518 13.9939 3.21299L16.2326 8.61702C16.39 8.99693 16.7473 9.25637 17.1572 9.28846L22.9921 9.74509C23.594 9.79219 24.0437 10.3183 23.9966 10.9202C23.974 11.2097 23.837 11.4783 23.616 11.6668L19.166 15.4605C18.8527 15.7275 18.7161 16.148 18.8124 16.5482L20.1805 22.2314C20.3218 22.8184 19.9605 23.4087 19.3735 23.55C19.0915 23.6179 18.794 23.5709 18.5467 23.4194L13.5551 20.3615C13.2046 20.1468 12.7634 20.1468 12.413 20.3615Z" fill="url(#paint0_linear_4300_30119)" stroke="url(#paint1_linear_4300_30119)" stroke-width="1.22222"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M12.413 20.3615L7.4621 23.3945C6.9473 23.7098 6.27431 23.5482 5.95894 23.0334C5.80491 22.7819 5.75899 22.4789 5.8316 22.1931L6.598 19.1766C6.87465 18.0876 7.61981 17.1774 8.63265 16.6911L14.0338 14.0979C14.2857 13.977 14.3918 13.6749 14.2709 13.4231C14.173 13.2191 13.9516 13.105 13.7287 13.1436L7.71644 14.1845C6.49429 14.3961 5.24099 14.0586 4.29035 13.2619L2.39103 11.6702C1.92831 11.2825 1.86756 10.593 2.25533 10.1303C2.44393 9.90522 2.71514 9.7655 3.00787 9.74259L8.81084 9.28846C9.2208 9.25637 9.57808 8.99693 9.73546 8.61702L11.9741 3.21299C12.2052 2.65524 12.8447 2.39039 13.4024 2.62145C13.6702 2.7324 13.883 2.94518 13.9939 3.21299L16.2326 8.61702C16.39 8.99693 16.7473 9.25637 17.1572 9.28846L22.9921 9.74509C23.594 9.79219 24.0437 10.3183 23.9966 10.9202C23.974 11.2097 23.837 11.4783 23.616 11.6668L19.166 15.4605C18.8527 15.7275 18.7161 16.148 18.8124 16.5482L20.1805 22.2314C20.3218 22.8184 19.9605 23.4087 19.3735 23.55C19.0915 23.6179 18.794 23.5709 18.5467 23.4194L13.5551 20.3615C13.2046 20.1468 12.7634 20.1468 12.413 20.3615Z" stroke="url(#paint2_linear_4300_30119)" stroke-width="2.44444" style="mix-blend-mode:soft-light"/>
      <defs>
        <linearGradient id="paint0_linear_4300_30119" x1="0.0870915" y1="28.1529" x2="41.4" y2="-18.3997" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FDEB32"/>
          <stop offset="0.439058" stop-color="#FEBD04"/>
          <stop offset="1" stop-color="#D75902"/>
        </linearGradient>
        <linearGradient id="paint1_linear_4300_30119" x1="27.0556" y1="3.61111" x2="9.33333" y2="15.8333" gradientUnits="userSpaceOnUse">
          <stop stop-color="#DB5A00"/>
          <stop offset="1" stop-color="#FF9145"/>
        </linearGradient>
        <linearGradient id="paint2_linear_4300_30119" x1="29.5" y1="3.00001" x2="13" y2="13.0592" gradientUnits="userSpaceOnUse">
          <stop stop-color="var(--star-background-color)" stop-opacity="0"/>
          <stop offset="0.395833" stop-color="var(--star-background-color)" stop-opacity="0.85"/>
          <stop offset="0.520833" stop-color="var(--star-background-color)"/>
          <stop offset="0.645833" stop-color="var(--star-background-color)" stop-opacity="0.85"/>
          <stop offset="1" stop-color="var(--star-background-color)" stop-opacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export function StarsStackedStars(props: {stars: number, size: number}) {
  let icons = 1;
  if(props.stars >= 2500) icons = 6;
  else if(props.stars >= 1000) icons = 5;
  else if(props.stars >= 500) icons = 4;
  else if(props.stars >= 250) icons = 3;
  else if(props.stars >= 50) icons = 2;
  let iconsElements: JSX.Element;
  const m = props.size + (props.size === 18 ? 4 : 6);
  if(icons > 1) {
    iconsElements = [];
    for(let i = 0; i < icons; ++i) iconsElements.push((
      <StarsStrokeStar
        stroke={i !== (icons - 1)}
        style={{
          'margin-right': (Math.min(i, 1) * -m) + 'px'
        }}
      />
    ));
  } else {
    iconsElements = <StarsStrokeStar />;
  }

  // * a picture of a pile, drawn with physical offsets (`margin-right`, the 90deg background that
  // * hides the next star's leg) — it stays the same picture in a right-to-left layout
  iconsElements = (
    <div
      class="stars-stacked"
      dir="ltr"
      style={{
        'width': `${props.size + (icons - 1) * 6}px`,
        '--size': props.size + 'px'
      }}
    >
      {iconsElements}
    </div>
  );
  return iconsElements;
}

export function StarsStar() {
  return currencyStarIcon();
}

export function StarsBalance(props: {ton?: boolean} = {}) {
  const stars = useStars(props.ton);
  return (
    <div class="stars-balance">
      <div class="stars-balance-title">{i18n('StarsBalance')}</div>
      <div class="stars-balance-subtitle">{props.ton ? <IconTsx icon="ton" /> : <StarsStar />}{props.ton ? formatNanoton(stars() ?? 0, 9) : '' + (stars() ?? 0)}</div>
    </div>
  );
}

export function StarsAmount(props: {stars: Long}) {
  return (
    <div class={classNames('popup-stars-pay-amount', 'popup-stars-pay-amount-plain')}>
      <StarsStar />
      {props.stars}
    </div>
  );
}

export function StarsChange(props: {
  stars: Long,
  isRefund?: boolean,
  noSign?: boolean,
  reverse?: boolean,
  inline?: boolean,
  ton?: boolean
}) {
  return (
    <div class={classNames('popup-stars-pay-amount', +props.stars >= 0 ? 'green' : 'danger', props.reverse && 'reverse', props.inline && 'inline')}>
      {/* a signed number reads left to right whatever the layout */}
      <span dir="ltr">{`${+props.stars > 0 && !props.noSign ? '+' : ''}${props.stars}`}</span>
      {props.ton ? <IconTsx icon="ton" /> : <StarsStar />}
      {props.isRefund && <span class="popup-stars-pay-amount-status">{i18n('StarsRefunded')}</span>}
    </div>
  );
}
