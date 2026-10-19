//# allFunctionsCalledOnLoad
import{_ as e,v as t}from"./apiManagerProxy-BqQAdM0a.js";import{u as n}from"./langPack-oPcGr-D3.js";import{I as r,L as i,O as a,w as o}from"./state-j8CUuBYp.js";import{t as s}from"./clamp-CCzIhYEL.js";import{t as c}from"./resizeObserver-C22lFvPa.js";import{ct as l,ut as u}from"./applyDeviceToActiveCall-BcIC46g0.js";var d,f=380,p=198,m=f/p,h=f,g=24,_=class d{constructor({buildLayout:n=d.defaultBuildLayout,pickerBoxWidth:r=f,pickerBoxHeight:a=p,sliderWidth:o=h,thickSlider:s=!1}={}){this.hue=0,this.saturation=100,this.lightness=50,this.alpha=1,this.elements={},this.onGrabStart=()=>{document.documentElement.style.cursor=this.elements.boxDragger.style.cursor=`grabbing`},this.onGrabEnd=()=>{document.documentElement.style.cursor=this.elements.boxDragger.style.cursor=``};let c=d.idSeed++,u=l(`
      <svg class="${d.BASE_CLASS+`-box`}" viewBox="0 0 ${r} ${a}" style="width: ${r}px; height: ${a}px;">
        <defs>
          <linearGradient id="color-picker-saturation-${c}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#fff"></stop>
            <stop offset="100%" stop-color="hsl(0,100%,50%)"></stop>
          </linearGradient>
          <linearGradient id="color-picker-brightness-${c}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="rgba(0,0,0,0)"></stop>
            <stop offset="100%" stop-color="#000"></stop>
          </linearGradient>
          <pattern id="color-picker-pattern-${c}" width="100%" height="100%">
            <rect x="0" y="0" width="100%" height="100%" fill="url(#color-picker-saturation-${c})"></rect>
            <rect x="0" y="0" width="100%" height="100%" fill="url(#color-picker-brightness-${c})"></rect>
          </pattern>
        </defs>
        <rect id="color-picker-box-rect-${c}" rx="10" ry="10" x="0" y="0" width="${r}" height="${a}" fill="url(#color-picker-pattern-${c})"></rect>
        <svg class="${d.BASE_CLASS+`-dragger`} ${d.BASE_CLASS+`-box-dragger`}" x="0" y="0">
          <circle r="11" fill="inherit" stroke="#fff" stroke-width="2"></circle>
        </svg>
      </svg>
    `),m=l(`
      <div class="${d.BASE_CLASS+`-sliders`}" style="width: ${o}px; height: ${g}px">
        <svg class="${d.BASE_CLASS+`-color-slider`}" viewBox="0 0 ${o} ${g}">
          <defs>
            <linearGradient id="hue-${c}" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stop-color="#f00"></stop>
              <stop offset="16.666%" stop-color="#f0f"></stop>
              <stop offset="33.333%" stop-color="#00f"></stop>
              <stop offset="50%" stop-color="#0ff"></stop>
              <stop offset="66.666%" stop-color="#0f0"></stop>
              <stop offset="83.333%" stop-color="#ff0"></stop>
              <stop offset="100%" stop-color="#f00"></stop>
            </linearGradient>
          </defs>
          <rect id="color-picker-hue-rect-${c}" rx="${s?10:4}" x="0" y="${s?3:9}" width="${o}" height="${s?20:8}" fill="url(#hue-${c})"></rect>
          <svg class="${d.BASE_CLASS+`-dragger`} ${d.BASE_CLASS+`-color-slider-dragger`}" x="0" y="13">
            <circle r="11" fill="inherit" stroke="#fff" stroke-width="2"></circle>
          </svg>
        </svg>
      </div>
    `);this.elements.box=u,this.elements.boxDragger=u.lastElementChild,this.elements.saturation=u.querySelector(`#color-picker-saturation-${c}`),this.elements.boxRect=u.querySelector(`#color-picker-box-rect-${c}`),this.elements.sliders=m,this.elements.hue=m.firstElementChild,this.elements.hueDragger=this.elements.hue.lastElementChild,this.elements.hueRect=m.querySelector(`#color-picker-hue-rect-${c}`),this.hexInputField=new e({plainText:!0,label:`Appearance.Color.Hex`}),this.rgbInputField=new e({plainText:!0,label:`Appearance.Color.RGB`}),this.container=n({pickerBox:u,slider:m,hexInput:this.hexInputField.container,rgbInput:this.rgbInputField.container}),this.hexInputField.input.addEventListener(`input`,()=>{let e=this.hexInputField.value.replace(/#/g,``).slice(0,6),n=e.match(/([a-fA-F\d]+)/),r=n&&n[0].length===e.length&&[6].includes(e.length);this.hexInputField.setState(r?t.Neutral:t.Error),e=`#`+e,this.hexInputField.setValueSilently(e),r&&this.setColor(e,!1,!0)});let _=/^(?:rgb)?\(?([01]?\d\d?|2[0-4]\d|25[0-5])(?:\W+)([01]?\d\d?|2[0-4]\d|25[0-5])\W+(?:([01]?\d\d?|2[0-4]\d|25[0-5])\)?)$/;this.rgbInputField.input.addEventListener(`input`,()=>{let e=this.rgbInputField.value.match(_);this.rgbInputField.setState(e?t.Neutral:t.Error),e&&this.setColor(i(+e[1],+e[2],+e[3]),!0,!1)}),this.attachBoxListeners(),this.attachHueListeners()}static defaultBuildLayout(e){let t=document.createElement(`div`);t.classList.add(d.BASE_CLASS);let n=document.createElement(`div`);return n.className=d.BASE_CLASS+`-inputs`,n.append(e.hexInput,e.rgbInput),t.append(e.pickerBox,e.slider,n),t}adjustSize({pickerBoxWidth:e,pickerBoxHeight:t,sliderWidth:n}){this.elements.box.setAttribute(`viewBox`,`0 0 ${e} ${t}`),this.elements.box.style.width=`${e}px`,this.elements.box.style.height=`${t}px`,this.elements.boxRect.setAttribute(`width`,`${e}`),this.elements.boxRect.setAttribute(`height`,`${t}`),this.elements.sliders.style.width=`${n}px`,this.elements.sliders.style.height=`${g}px`,this.elements.hue.setAttribute(`viewBox`,`0 0 ${n} ${g}`),this.elements.hueRect.setAttribute(`width`,`${n}`)}attachAutoResize(){return c(this.container,e=>{let t=e.contentRect.width;this.adjustSize({pickerBoxWidth:t,pickerBoxHeight:t/m,sliderWidth:t})})}attachBoxListeners(){u(this.elements.box,()=>{this.onGrabStart(),this.boxRect=this.elements.box.getBoundingClientRect()},e=>{this.saturationHandler(e.x,e.y)},()=>{this.onGrabEnd()})}attachHueListeners(){u(this.elements.hue,()=>{this.onGrabStart(),this.hueRect=this.elements.hue.getBoundingClientRect()},e=>{this.hueHandler(e.x)},()=>{this.onGrabEnd()})}setColor(e,t=!0,n=!0){if(e===void 0)e={h:0,s:100,l:50,a:1};else if(typeof e==`string`){if(e[0]===`#`)e=o(e);else{let t=e.match(/[.?\d]+/g);e=i(+t[0],+t[1],+t[2],t[3]===void 0?1:+t[3])}}this.boxRect=this.elements.box.getBoundingClientRect();let r=this.boxRect.width/100*e.s,a=100-e.l/(100-e.s/2)*100,s=this.boxRect.height/100*a;this.saturationHandler(this.boxRect.left+r,this.boxRect.top+s,!1),this.setHuePercents(e.h/360,!1),this.hue=e.h,this.saturation=e.s,this.lightness=e.l,this.alpha=e.a,this.updatePicker(t,n)}getCurrentColor(){let e=a(this.hue,this.saturation,this.lightness,this.alpha),t=r(e),n=t.slice(0,-2);return{hsl:`hsl(${this.hue}, ${this.saturation}%, ${this.lightness}%)`,rgb:`rgb(${e[0]}, ${e[1]}, ${e[2]})`,hex:n,hsla:`hsla(${this.hue}, ${this.saturation}%, ${this.lightness}%, ${this.alpha})`,rgba:`rgba(${e[0]}, ${e[1]}, ${e[2]}, ${e[3]})`,hexa:t,rgbaArray:e}}updatePicker(e=!0,n=!0){let r=this.getCurrentColor();this.elements.boxDragger.setAttributeNS(null,`fill`,r.hex),e&&(this.hexInputField.setValueSilently(r.hex),this.hexInputField.setState(t.Neutral)),n&&(this.rgbInputField.setValueSilently(r.rgbaArray.slice(0,-1).join(`, `)),this.rgbInputField.setState(t.Neutral)),this.onChange&&this.onChange(r)}hueHandler(e,t=!0){let r=s(e-this.hueRect.left,0,this.hueRect.width)/this.hueRect.width;this.setHuePercents(n.getIsRTL()?1-r:r,t)}setHuePercents(e,t=!0){this.hue=Math.round(360*e);let n=`hsla(${this.hue}, 100%, 50%, ${this.alpha})`;this.elements.hueDragger.setAttributeNS(null,`x`,e*100+`%`),this.elements.hueDragger.setAttributeNS(null,`fill`,n),this.elements.saturation.lastElementChild.setAttributeNS(null,`stop-color`,n),t&&this.updatePicker()}saturationHandler(e,t,n=!0){let r=this.boxRect.width,i=this.boxRect.height,a=s(e-this.boxRect.left,0,r),o=s(t-this.boxRect.top,0,i),c=a/r*100,l=o/i*100,u=this.elements.boxDragger;u.setAttributeNS(null,`x`,c+`%`),u.setAttributeNS(null,`y`,l+`%`);let d=s(c,0,100),f=100-d/2,p=100-s(l,0,100),m=s(p/100*f,0,100);this.saturation=d,this.lightness=m,n&&this.updatePicker()}};d=_,d.BASE_CLASS=`color-picker`,d.idSeed=0;export{_ as t};
//# sourceMappingURL=colorPicker-DaHGe5Ki.js.map