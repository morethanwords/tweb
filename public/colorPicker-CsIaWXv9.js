import{_ as e,et as t,v as n}from"./apiManagerProxy-fZ7kKCtg.js";import{E as r,M as i,N as a,S as o}from"./state-CXdSLAQc.js";import{t as s}from"./clamp-D7k6Oux1.js";import{t as c}from"./resizeObserver-DNwiwdaz.js";import{ro as l}from"./appDialogsManager-CSFWSZEe.js";var u,d=380,f=198,p=d/f,m=d,h=24,g=class u{constructor({buildLayout:r=u.defaultBuildLayout,pickerBoxWidth:i=d,pickerBoxHeight:o=f,sliderWidth:s=m,thickSlider:c=!1}={}){this.hue=0,this.saturation=100,this.lightness=50,this.alpha=1,this.elements={},this.onGrabStart=()=>{document.documentElement.style.cursor=this.elements.boxDragger.style.cursor=`grabbing`},this.onGrabEnd=()=>{document.documentElement.style.cursor=this.elements.boxDragger.style.cursor=``};let l=u.idSeed++,p=t(`
      <svg class="${u.BASE_CLASS+`-box`}" viewBox="0 0 ${i} ${o}" style="width: ${i}px; height: ${o}px;">
        <defs>
          <linearGradient id="color-picker-saturation-${l}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#fff"></stop>
            <stop offset="100%" stop-color="hsl(0,100%,50%)"></stop>
          </linearGradient>
          <linearGradient id="color-picker-brightness-${l}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="rgba(0,0,0,0)"></stop>
            <stop offset="100%" stop-color="#000"></stop>
          </linearGradient>
          <pattern id="color-picker-pattern-${l}" width="100%" height="100%">
            <rect x="0" y="0" width="100%" height="100%" fill="url(#color-picker-saturation-${l})"></rect>
            <rect x="0" y="0" width="100%" height="100%" fill="url(#color-picker-brightness-${l})"></rect>
          </pattern>
        </defs>
        <rect id="color-picker-box-rect-${l}" rx="10" ry="10" x="0" y="0" width="${i}" height="${o}" fill="url(#color-picker-pattern-${l})"></rect>
        <svg class="${u.BASE_CLASS+`-dragger`} ${u.BASE_CLASS+`-box-dragger`}" x="0" y="0">
          <circle r="11" fill="inherit" stroke="#fff" stroke-width="2"></circle>
        </svg>
      </svg>
    `),g=t(`
      <div class="${u.BASE_CLASS+`-sliders`}" style="width: ${s}px; height: ${h}px">
        <svg class="${u.BASE_CLASS+`-color-slider`}" viewBox="0 0 ${s} ${h}">
          <defs>
            <linearGradient id="hue-${l}" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stop-color="#f00"></stop>
              <stop offset="16.666%" stop-color="#f0f"></stop>
              <stop offset="33.333%" stop-color="#00f"></stop>
              <stop offset="50%" stop-color="#0ff"></stop>
              <stop offset="66.666%" stop-color="#0f0"></stop>
              <stop offset="83.333%" stop-color="#ff0"></stop>
              <stop offset="100%" stop-color="#f00"></stop>
            </linearGradient>
          </defs>
          <rect id="color-picker-hue-rect-${l}" rx="${c?10:4}" x="0" y="${c?3:9}" width="${s}" height="${c?20:8}" fill="url(#hue-${l})"></rect>
          <svg class="${u.BASE_CLASS+`-dragger`} ${u.BASE_CLASS+`-color-slider-dragger`}" x="0" y="13">
            <circle r="11" fill="inherit" stroke="#fff" stroke-width="2"></circle>
          </svg>
        </svg>
      </div>
    `);this.elements.box=p,this.elements.boxDragger=p.lastElementChild,this.elements.saturation=p.querySelector(`#color-picker-saturation-${l}`),this.elements.boxRect=p.querySelector(`#color-picker-box-rect-${l}`),this.elements.sliders=g,this.elements.hue=g.firstElementChild,this.elements.hueDragger=this.elements.hue.lastElementChild,this.elements.hueRect=g.querySelector(`#color-picker-hue-rect-${l}`),this.hexInputField=new e({plainText:!0,label:`Appearance.Color.Hex`}),this.rgbInputField=new e({plainText:!0,label:`Appearance.Color.RGB`}),this.container=r({pickerBox:p,slider:g,hexInput:this.hexInputField.container,rgbInput:this.rgbInputField.container}),this.hexInputField.input.addEventListener(`input`,()=>{let e=this.hexInputField.value.replace(/#/g,``).slice(0,6),t=e.match(/([a-fA-F\d]+)/),r=t&&t[0].length===e.length&&[6].includes(e.length);this.hexInputField.setState(r?n.Neutral:n.Error),e=`#`+e,this.hexInputField.setValueSilently(e),r&&this.setColor(e,!1,!0)});let _=/^(?:rgb)?\(?([01]?\d\d?|2[0-4]\d|25[0-5])(?:\W+)([01]?\d\d?|2[0-4]\d|25[0-5])\W+(?:([01]?\d\d?|2[0-4]\d|25[0-5])\)?)$/;this.rgbInputField.input.addEventListener(`input`,()=>{let e=this.rgbInputField.value.match(_);this.rgbInputField.setState(e?n.Neutral:n.Error),e&&this.setColor(a(+e[1],+e[2],+e[3]),!0,!1)}),this.attachBoxListeners(),this.attachHueListeners()}static defaultBuildLayout(e){let t=document.createElement(`div`);t.classList.add(u.BASE_CLASS);let n=document.createElement(`div`);return n.className=u.BASE_CLASS+`-inputs`,n.append(e.hexInput,e.rgbInput),t.append(e.pickerBox,e.slider,n),t}adjustSize({pickerBoxWidth:e,pickerBoxHeight:t,sliderWidth:n}){this.elements.box.setAttribute(`viewBox`,`0 0 ${e} ${t}`),this.elements.box.style.width=`${e}px`,this.elements.box.style.height=`${t}px`,this.elements.boxRect.setAttribute(`width`,`${e}`),this.elements.boxRect.setAttribute(`height`,`${t}`),this.elements.sliders.style.width=`${n}px`,this.elements.sliders.style.height=`${h}px`,this.elements.hue.setAttribute(`viewBox`,`0 0 ${n} ${h}`),this.elements.hueRect.setAttribute(`width`,`${n}`)}attachAutoResize(){return c(this.container,e=>{let t=e.contentRect.width;this.adjustSize({pickerBoxWidth:t,pickerBoxHeight:t/p,sliderWidth:t})})}attachBoxListeners(){l(this.elements.box,()=>{this.onGrabStart(),this.boxRect=this.elements.box.getBoundingClientRect()},e=>{this.saturationHandler(e.x,e.y)},()=>{this.onGrabEnd()})}attachHueListeners(){l(this.elements.hue,()=>{this.onGrabStart(),this.hueRect=this.elements.hue.getBoundingClientRect()},e=>{this.hueHandler(e.x)},()=>{this.onGrabEnd()})}setColor(e,t=!0,n=!0){if(e===void 0)e={h:0,s:100,l:50,a:1};else if(typeof e==`string`){if(e[0]===`#`)e=o(e);else{let t=e.match(/[.?\d]+/g);e=a(+t[0],+t[1],+t[2],t[3]===void 0?1:+t[3])}}this.boxRect=this.elements.box.getBoundingClientRect();let r=this.boxRect.width/100*e.s,i=100-e.l/(100-e.s/2)*100,s=this.boxRect.height/100*i;this.saturationHandler(this.boxRect.left+r,this.boxRect.top+s,!1),this.hueRect=this.elements.hue.getBoundingClientRect();let c=e.h/360,l=this.hueRect.left+this.hueRect.width*c;this.hueHandler(l,!1),this.hue=e.h,this.saturation=e.s,this.lightness=e.l,this.alpha=e.a,this.updatePicker(t,n)}getCurrentColor(){let e=r(this.hue,this.saturation,this.lightness,this.alpha),t=i(e),n=t.slice(0,-2);return{hsl:`hsl(${this.hue}, ${this.saturation}%, ${this.lightness}%)`,rgb:`rgb(${e[0]}, ${e[1]}, ${e[2]})`,hex:n,hsla:`hsla(${this.hue}, ${this.saturation}%, ${this.lightness}%, ${this.alpha})`,rgba:`rgba(${e[0]}, ${e[1]}, ${e[2]}, ${e[3]})`,hexa:t,rgbaArray:e}}updatePicker(e=!0,t=!0){let r=this.getCurrentColor();this.elements.boxDragger.setAttributeNS(null,`fill`,r.hex),e&&(this.hexInputField.setValueSilently(r.hex),this.hexInputField.setState(n.Neutral)),t&&(this.rgbInputField.setValueSilently(r.rgbaArray.slice(0,-1).join(`, `)),this.rgbInputField.setState(n.Neutral)),this.onChange&&this.onChange(r)}hueHandler(e,t=!0){let n=s(e-this.hueRect.left,0,this.hueRect.width)/this.hueRect.width;this.hue=Math.round(360*n);let r=`hsla(${this.hue}, 100%, 50%, ${this.alpha})`;this.elements.hueDragger.setAttributeNS(null,`x`,n*100+`%`),this.elements.hueDragger.setAttributeNS(null,`fill`,r),this.elements.saturation.lastElementChild.setAttributeNS(null,`stop-color`,r),t&&this.updatePicker()}saturationHandler(e,t,n=!0){let r=this.boxRect.width,i=this.boxRect.height,a=s(e-this.boxRect.left,0,r),o=s(t-this.boxRect.top,0,i),c=a/r*100,l=o/i*100,u=this.elements.boxDragger;u.setAttributeNS(null,`x`,c+`%`),u.setAttributeNS(null,`y`,l+`%`);let d=s(c,0,100),f=100-d/2,p=100-s(l,0,100),m=s(p/100*f,0,100);this.saturation=d,this.lightness=m,n&&this.updatePicker()}};u=g,u.BASE_CLASS=`color-picker`,u.idSeed=0;export{g as t};
//# sourceMappingURL=colorPicker-CsIaWXv9.js.map