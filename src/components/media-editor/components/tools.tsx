import eraserIcon from '../svg/eraser.svg';
import blurIcon from '../svg/blur.svg';

export const Pen = (props: { color:  string }) => <svg style={{color: props.color}} width="120" height="20" viewBox="0 0 120 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g clip-path="url(#clip0_3104_416)">
    <g filter="url(#filter0_iiii_3104_416)">
      <path d="M0 1H80L110.2 8.44653C112.048 8.90213 112.971 9.12994 113.185 9.49307C113.369 9.80597 113.369 10.194 113.185 10.5069C112.971 10.8701 112.048 11.0979 110.2 11.5535L80 19H0V1Z" fill="#3E3F3F"/>
    </g>
    <path d="M112.564 10.9709L103.474 13.2132C103.21 13.2782 102.944 13.121 102.883 12.8566C102.736 12.2146 102.5 11.0296 102.5 10C102.5 8.9705 102.736 7.78549 102.883 7.14344C102.944 6.87906 103.21 6.72187 103.474 6.78685L112.564 9.02913C113.578 9.27925 113.578 10.7208 112.564 10.9709Z" fill="currentcolor"/>
    <rect x="76" y="1" width="4" height="18" rx="0.5" fill="currentcolor"/>
  </g>
  <defs>
    <filter id="filter0_iiii_3104_416" x="0" y="-4" width="116.323" height="28" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dx="1" dy="5"/>
      <feGaussianBlur stdDeviation="3"/>
      <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.137255 0 0 0 0 0.145098 0 0 0 0 0.14902 0 0 0 1 0"/>
      <feBlend mode="normal" in2="shape" result="effect1_innerShadow_3104_416"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dx="3" dy="-5"/>
      <feGaussianBlur stdDeviation="3"/>
      <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.137255 0 0 0 0 0.145098 0 0 0 0 0.14902 0 0 0 1 0"/>
      <feBlend mode="normal" in2="effect1_innerShadow_3104_416" result="effect2_innerShadow_3104_416"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dx="1" dy="-1"/>
      <feGaussianBlur stdDeviation="0.5"/>
      <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.242217 0 0 0 0 0.247242 0 0 0 0 0.247101 0 0 0 1 0"/>
      <feBlend mode="normal" in2="effect2_innerShadow_3104_416" result="effect3_innerShadow_3104_416"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dx="1" dy="1"/>
      <feGaussianBlur stdDeviation="0.5"/>
      <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.242217 0 0 0 0 0.247242 0 0 0 0 0.247101 0 0 0 1 0"/>
      <feBlend mode="normal" in2="effect3_innerShadow_3104_416" result="effect4_innerShadow_3104_416"/>
    </filter>
    <clipPath id="clip0_3104_416">
      <rect width="20" height="120" fill="currentcolor" transform="matrix(0 1 -1 0 120 0)"/>
    </clipPath>
  </defs>
</svg>

export const Arrow = (props: { color:  string }) => <svg style={{color: props.color}} width="120" height="20" viewBox="0 0 120 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g clip-path="url(#clip0_1_231)">
    <path d="M94 10H110M110 10L104 4M110 10L104 16" stroke="url(#paint0_linear_1_231)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <g filter="url(#filter0_iiii_1_231)">
      <path d="M0 1H92C94.2091 1 96 2.79086 96 5V15C96 17.2091 94.2091 19 92 19H0V1Z" fill="#3E3F3F"/>
    </g>
    <path d="M92 1C94.2091 1 96 2.79086 96 5V15C96 17.2091 94.2091 19 92 19V1Z" fill="currentcolor"/>
  </g>
  <defs>
    <filter id="filter0_iiii_1_231" x="0" y="-4" width="99" height="28" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dx="1" dy="5"/>
      <feGaussianBlur stdDeviation="3"/>
      <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.137255 0 0 0 0 0.145098 0 0 0 0 0.14902 0 0 0 1 0"/>
      <feBlend mode="normal" in2="shape" result="effect1_innerShadow_1_231"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dx="3" dy="-5"/>
      <feGaussianBlur stdDeviation="3"/>
      <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.137255 0 0 0 0 0.145098 0 0 0 0 0.14902 0 0 0 1 0"/>
      <feBlend mode="normal" in2="effect1_innerShadow_1_231" result="effect2_innerShadow_1_231"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dx="1" dy="-1"/>
      <feGaussianBlur stdDeviation="0.5"/>
      <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.242217 0 0 0 0 0.247242 0 0 0 0 0.247101 0 0 0 1 0"/>
      <feBlend mode="normal" in2="effect2_innerShadow_1_231" result="effect3_innerShadow_1_231"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dx="1" dy="1"/>
      <feGaussianBlur stdDeviation="0.5"/>
      <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.242217 0 0 0 0 0.247242 0 0 0 0 0.247101 0 0 0 1 0"/>
      <feBlend mode="normal" in2="effect3_innerShadow_1_231" result="effect4_innerShadow_1_231"/>
    </filter>
    <linearGradient id="paint0_linear_1_231" x1="110" y1="10" x2="94" y2="10" gradientUnits="userSpaceOnUse">
      <stop offset="0.755" stop-color="currentcolor"/>
      <stop offset="1" stop-color="currentcolor" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="clip0_1_231">
      <rect width="20" height="120" fill="currentcolor" transform="matrix(0 1 -1 0 120 0)"/>
    </clipPath>
  </defs>
</svg>

export const Brush = (props: { color:  string }) => <svg style={{color: props.color}} width="120" height="20" viewBox="0 0 120 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g clip-path="url(#clip0_1_265)">
    <g filter="url(#filter0_iiii_1_265)">
      <path d="M0 1H82.3579C83.4414 1 84.5135 1.22006 85.5093 1.64684L91 4H101C101.552 4 102 4.44772 102 5V15C102 15.5523 101.552 16 101 16H91L85.5093 18.3532C84.5135 18.7799 83.4414 19 82.3579 19H0V1Z" fill="#3E3F3F"/>
    </g>
    <rect x="76" y="1" width="4" height="18" rx="0.5" fill="currentcolor"/>
    <path d="M102 5H106.434C106.785 5 107.111 5.1843 107.291 5.4855L112.091 13.4855C112.491 14.152 112.011 15 111.234 15H102V5Z" fill="currentcolor"/>
  </g>
  <defs>
    <filter id="filter0_iiii_1_265" x="0" y="-4" width="105" height="28" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dx="1" dy="5"/>
      <feGaussianBlur stdDeviation="3"/>
      <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.137255 0 0 0 0 0.145098 0 0 0 0 0.14902 0 0 0 1 0"/>
      <feBlend mode="normal" in2="shape" result="effect1_innerShadow_1_265"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dx="3" dy="-5"/>
      <feGaussianBlur stdDeviation="3"/>
      <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.137255 0 0 0 0 0.145098 0 0 0 0 0.14902 0 0 0 1 0"/>
      <feBlend mode="normal" in2="effect1_innerShadow_1_265" result="effect2_innerShadow_1_265"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dx="1" dy="-1"/>
      <feGaussianBlur stdDeviation="0.5"/>
      <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.242217 0 0 0 0 0.247242 0 0 0 0 0.247101 0 0 0 1 0"/>
      <feBlend mode="normal" in2="effect2_innerShadow_1_265" result="effect3_innerShadow_1_265"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dx="1" dy="1"/>
      <feGaussianBlur stdDeviation="0.5"/>
      <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.242217 0 0 0 0 0.247242 0 0 0 0 0.247101 0 0 0 1 0"/>
      <feBlend mode="normal" in2="effect3_innerShadow_1_265" result="effect4_innerShadow_1_265"/>
    </filter>
    <clipPath id="clip0_1_265">
      <rect width="20" height="120" fill="currentcolor" transform="matrix(0 1 -1 0 120 0)"/>
    </clipPath>
  </defs>
</svg>

export const Neon = (props: { color:  string }) => <svg style={{color: props.color}} width="120" height="20" viewBox="0 0 120 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g clip-path="url(#clip0_1_271)">
    <g filter="url(#filter0_f_1_271)">
      <path d="M102 5H107.146C108.282 5 109.323 5.64872 109.601 6.75061C109.813 7.59297 110 8.70303 110 10C110 11.297 109.813 12.407 109.601 13.2494C109.323 14.3513 108.282 15 107.146 15H102V5Z" fill="currentcolor"/>
    </g>
    <g filter="url(#filter1_f_1_271)">
      <path d="M102 5H107.146C108.282 5 109.323 5.64872 109.601 6.75061C109.813 7.59297 110 8.70303 110 10C110 11.297 109.813 12.407 109.601 13.2494C109.323 14.3513 108.282 15 107.146 15H102V5Z" fill="currentcolor"/>
    </g>
    <g filter="url(#filter2_f_1_271)">
      <path d="M102 5H107.146C108.282 5 109.323 5.64872 109.601 6.75061C109.813 7.59297 110 8.70303 110 10C110 11.297 109.813 12.407 109.601 13.2494C109.323 14.3513 108.282 15 107.146 15H102V5Z" fill="currentcolor"/>
    </g>
    <g filter="url(#filter3_iiii_1_271)">
      <path d="M0 1H82.3579C83.4414 1 84.5135 1.22006 85.5093 1.64684L91 4H101C101.552 4 102 4.44772 102 5V15C102 15.5523 101.552 16 101 16H91L85.5093 18.3532C84.5135 18.7799 83.4414 19 82.3579 19H0V1Z" fill="#3E3F3F"/>
    </g>
    <rect x="76" y="1" width="4" height="18" rx="0.5" fill="currentcolor"/>
    <path d="M102 5H107.146C108.282 5 109.323 5.64872 109.601 6.75061C109.813 7.59297 110 8.70303 110 10C110 11.297 109.813 12.407 109.601 13.2494C109.323 14.3513 108.282 15 107.146 15H102V5Z" fill="currentcolor"/>
  </g>
  <defs>
    <filter id="filter0_f_1_271" x="96" y="-1" width="20" height="22" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
      <feGaussianBlur stdDeviation="3" result="effect1_foregroundBlur_1_271"/>
    </filter>
    <filter id="filter1_f_1_271" x="96" y="-1" width="20" height="22" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
      <feGaussianBlur stdDeviation="3" result="effect1_foregroundBlur_1_271"/>
    </filter>
    <filter id="filter2_f_1_271" x="96" y="-1" width="20" height="22" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
      <feGaussianBlur stdDeviation="3" result="effect1_foregroundBlur_1_271"/>
    </filter>
    <filter id="filter3_iiii_1_271" x="0" y="-4" width="105" height="28" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dx="1" dy="5"/>
      <feGaussianBlur stdDeviation="3"/>
      <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.137255 0 0 0 0 0.145098 0 0 0 0 0.14902 0 0 0 1 0"/>
      <feBlend mode="normal" in2="shape" result="effect1_innerShadow_1_271"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dx="3" dy="-5"/>
      <feGaussianBlur stdDeviation="3"/>
      <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.137255 0 0 0 0 0.145098 0 0 0 0 0.14902 0 0 0 1 0"/>
      <feBlend mode="normal" in2="effect1_innerShadow_1_271" result="effect2_innerShadow_1_271"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dx="1" dy="-1"/>
      <feGaussianBlur stdDeviation="0.5"/>
      <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.242217 0 0 0 0 0.247242 0 0 0 0 0.247101 0 0 0 1 0"/>
      <feBlend mode="normal" in2="effect2_innerShadow_1_271" result="effect3_innerShadow_1_271"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dx="1" dy="1"/>
      <feGaussianBlur stdDeviation="0.5"/>
      <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.242217 0 0 0 0 0.247242 0 0 0 0 0.247101 0 0 0 1 0"/>
      <feBlend mode="normal" in2="effect3_innerShadow_1_271" result="effect4_innerShadow_1_271"/>
    </filter>
    <clipPath id="clip0_1_271">
      <rect width="20" height="120" fill="currentcolor" transform="matrix(0 1 -1 0 120 0)"/>
    </clipPath>
  </defs>
</svg>

export const Eraser = () => <img src={eraserIcon} alt='Eraser'/>

export const Blur = () => <img src={blurIcon} alt='Blur' />
