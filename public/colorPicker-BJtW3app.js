//# allFunctionsCalledOnLoad
import{u as e}from"./langPack-Cx34d7Qs.js";import{A as t,E as n,R as r,z as i}from"./state-DmqeVMbd.js";import{t as a}from"./clamp-CCzIhYEL.js";import{t as o}from"./resizeObserver-D_NZ4JVJ.js";import{n as s,t as c}from"./inputField-yafnNQpV.js";import{E as l,S as u}from"./openEditors-CzYjk_4s.js";var d,f=380,p=198,m=f/p,h=f,g=24,_=class d{constructor({buildLayout:e=d.defaultBuildLayout,pickerBoxWidth:t=f,pickerBoxHeight:n=p,sliderWidth:r=h,thickSlider:a=!1}={}){this.hue=0,this.saturation=100,this.lightness=50,this.alpha=1,this.elements={},this.onGrabStart=()=>{document.documentElement.style.cursor=this.elements.boxDragger.style.cursor=`grabbing`},this.onGrabEnd=()=>{document.documentElement.style.cursor=this.elements.boxDragger.style.cursor=``};let o=d.idSeed++,l=u(`
      <svg class="${d.BASE_CLASS+`-box`}" viewBox="0 0 ${t} ${n}" style="width: ${t}px; height: ${n}px;">
        <defs>
          <linearGradient id="color-picker-saturation-${o}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#fff"></stop>
            <stop offset="100%" stop-color="hsl(0,100%,50%)"></stop>
          </linearGradient>
          <linearGradient id="color-picker-brightness-${o}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="rgba(0,0,0,0)"></stop>
            <stop offset="100%" stop-color="#000"></stop>
          </linearGradient>
          <pattern id="color-picker-pattern-${o}" width="100%" height="100%">
            <rect x="0" y="0" width="100%" height="100%" fill="url(#color-picker-saturation-${o})"></rect>
            <rect x="0" y="0" width="100%" height="100%" fill="url(#color-picker-brightness-${o})"></rect>
          </pattern>
        </defs>
        <rect id="color-picker-box-rect-${o}" rx="10" ry="10" x="0" y="0" width="${t}" height="${n}" fill="url(#color-picker-pattern-${o})"></rect>
        <svg class="${d.BASE_CLASS+`-dragger`} ${d.BASE_CLASS+`-box-dragger`}" x="0" y="0">
          <circle r="11" fill="inherit" stroke="#fff" stroke-width="2"></circle>
        </svg>
      </svg>
    `),m=u(`
      <div class="${d.BASE_CLASS+`-sliders`}" style="width: ${r}px; height: ${g}px">
        <svg class="${d.BASE_CLASS+`-color-slider`}" viewBox="0 0 ${r} ${g}">
          <defs>
            <linearGradient id="hue-${o}" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stop-color="#f00"></stop>
              <stop offset="16.666%" stop-color="#f0f"></stop>
              <stop offset="33.333%" stop-color="#00f"></stop>
              <stop offset="50%" stop-color="#0ff"></stop>
              <stop offset="66.666%" stop-color="#0f0"></stop>
              <stop offset="83.333%" stop-color="#ff0"></stop>
              <stop offset="100%" stop-color="#f00"></stop>
            </linearGradient>
          </defs>
          <rect id="color-picker-hue-rect-${o}" rx="${a?10:4}" x="0" y="${a?3:9}" width="${r}" height="${a?20:8}" fill="url(#hue-${o})"></rect>
          <svg class="${d.BASE_CLASS+`-dragger`} ${d.BASE_CLASS+`-color-slider-dragger`}" x="0" y="13">
            <circle r="11" fill="inherit" stroke="#fff" stroke-width="2"></circle>
          </svg>
        </svg>
      </div>
    `);this.elements.box=l,this.elements.boxDragger=l.lastElementChild,this.elements.saturation=l.querySelector(`#color-picker-saturation-${o}`),this.elements.boxRect=l.querySelector(`#color-picker-box-rect-${o}`),this.elements.sliders=m,this.elements.hue=m.firstElementChild,this.elements.hueDragger=this.elements.hue.lastElementChild,this.elements.hueRect=m.querySelector(`#color-picker-hue-rect-${o}`),this.hexInputField=new c({plainText:!0,label:`Appearance.Color.Hex`}),this.rgbInputField=new c({plainText:!0,label:`Appearance.Color.RGB`}),this.container=e({pickerBox:l,slider:m,hexInput:this.hexInputField.container,rgbInput:this.rgbInputField.container}),this.hexInputField.input.addEventListener(`input`,()=>{let e=this.hexInputField.value.replace(/#/g,``).slice(0,6),t=e.match(/([a-fA-F\d]+)/),n=t&&t[0].length===e.length&&[6].includes(e.length);this.hexInputField.setState(n?s.Neutral:s.Error),e=`#`+e,this.hexInputField.setValueSilently(e),n&&this.setColor(e,!1,!0)});let _=/^(?:rgb)?\(?([01]?\d\d?|2[0-4]\d|25[0-5])(?:\W+)([01]?\d\d?|2[0-4]\d|25[0-5])\W+(?:([01]?\d\d?|2[0-4]\d|25[0-5])\)?)$/;this.rgbInputField.input.addEventListener(`input`,()=>{let e=this.rgbInputField.value.match(_);this.rgbInputField.setState(e?s.Neutral:s.Error),e&&this.setColor(i(+e[1],+e[2],+e[3]),!0,!1)}),this.attachBoxListeners(),this.attachHueListeners()}static defaultBuildLayout(e){let t=document.createElement(`div`);t.classList.add(d.BASE_CLASS);let n=document.createElement(`div`);return n.className=d.BASE_CLASS+`-inputs`,n.append(e.hexInput,e.rgbInput),t.append(e.pickerBox,e.slider,n),t}adjustSize({pickerBoxWidth:e,pickerBoxHeight:t,sliderWidth:n}){this.elements.box.setAttribute(`viewBox`,`0 0 ${e} ${t}`),this.elements.box.style.width=`${e}px`,this.elements.box.style.height=`${t}px`,this.elements.boxRect.setAttribute(`width`,`${e}`),this.elements.boxRect.setAttribute(`height`,`${t}`),this.elements.sliders.style.width=`${n}px`,this.elements.sliders.style.height=`${g}px`,this.elements.hue.setAttribute(`viewBox`,`0 0 ${n} ${g}`),this.elements.hueRect.setAttribute(`width`,`${n}`)}attachAutoResize(){return o(this.container,e=>{let t=e.contentRect.width;this.adjustSize({pickerBoxWidth:t,pickerBoxHeight:t/m,sliderWidth:t})})}attachBoxListeners(){l(this.elements.box,()=>{this.onGrabStart(),this.boxRect=this.elements.box.getBoundingClientRect()},e=>{this.saturationHandler(e.x,e.y)},()=>{this.onGrabEnd()})}attachHueListeners(){l(this.elements.hue,()=>{this.onGrabStart(),this.hueRect=this.elements.hue.getBoundingClientRect()},e=>{this.hueHandler(e.x)},()=>{this.onGrabEnd()})}setColor(e,t=!0,r=!0){if(e===void 0)e={h:0,s:100,l:50,a:1};else if(typeof e==`string`){if(e[0]===`#`)e=n(e);else{let t=e.match(/[.?\d]+/g);e=i(+t[0],+t[1],+t[2],t[3]===void 0?1:+t[3])}}this.boxRect=this.elements.box.getBoundingClientRect();let a=this.boxRect.width/100*e.s,o=100-e.l/(100-e.s/2)*100,s=this.boxRect.height/100*o;this.saturationHandler(this.boxRect.left+a,this.boxRect.top+s,!1),this.setHuePercents(e.h/360,!1),this.hue=e.h,this.saturation=e.s,this.lightness=e.l,this.alpha=e.a,this.updatePicker(t,r)}getCurrentColor(){let e=t(this.hue,this.saturation,this.lightness,this.alpha),n=r(e),i=n.slice(0,-2);return{hsl:`hsl(${this.hue}, ${this.saturation}%, ${this.lightness}%)`,rgb:`rgb(${e[0]}, ${e[1]}, ${e[2]})`,hex:i,hsla:`hsla(${this.hue}, ${this.saturation}%, ${this.lightness}%, ${this.alpha})`,rgba:`rgba(${e[0]}, ${e[1]}, ${e[2]}, ${e[3]})`,hexa:n,rgbaArray:e}}updatePicker(e=!0,t=!0){let n=this.getCurrentColor();this.elements.boxDragger.setAttributeNS(null,`fill`,n.hex),e&&(this.hexInputField.setValueSilently(n.hex),this.hexInputField.setState(s.Neutral)),t&&(this.rgbInputField.setValueSilently(n.rgbaArray.slice(0,-1).join(`, `)),this.rgbInputField.setState(s.Neutral)),this.onChange&&this.onChange(n)}hueHandler(t,n=!0){let r=a(t-this.hueRect.left,0,this.hueRect.width)/this.hueRect.width;this.setHuePercents(e.getIsRTL()?1-r:r,n)}setHuePercents(e,t=!0){this.hue=Math.round(360*e);let n=`hsla(${this.hue}, 100%, 50%, ${this.alpha})`;this.elements.hueDragger.setAttributeNS(null,`x`,e*100+`%`),this.elements.hueDragger.setAttributeNS(null,`fill`,n),this.elements.saturation.lastElementChild.setAttributeNS(null,`stop-color`,n),t&&this.updatePicker()}saturationHandler(e,t,n=!0){let r=this.boxRect.width,i=this.boxRect.height,o=a(e-this.boxRect.left,0,r),s=a(t-this.boxRect.top,0,i),c=o/r*100,l=s/i*100,u=this.elements.boxDragger;u.setAttributeNS(null,`x`,c+`%`),u.setAttributeNS(null,`y`,l+`%`);let d=a(c,0,100),f=100-d/2,p=100-a(l,0,100),m=a(p/100*f,0,100);this.saturation=d,this.lightness=m,n&&this.updatePicker()}};d=_,d.BASE_CLASS=`color-picker`,d.idSeed=0;export{_ as t};
//# sourceMappingURL=colorPicker-BJtW3app.js.map