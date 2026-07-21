import{dp as b,d6 as $,dY as u,hi as m,dn as w,cq as C,hj as E,eF as B,bw as d}from"./index-tqkhqbK2.js";import{b as S}from"./appDialogsManager-6JZcDDMr.js";const f=380,y=198,I=f/y,L=f,x=24,h=class h{constructor({buildLayout:t=h.defaultBuildLayout,pickerBoxWidth:e=f,pickerBoxHeight:s=y,sliderWidth:n=L,thickSlider:l=!1}={}){this.hue=0,this.saturation=100,this.lightness=50,this.alpha=1,this.elements={},this.onGrabStart=()=>{document.documentElement.style.cursor=this.elements.boxDragger.style.cursor="grabbing"},this.onGrabEnd=()=>{document.documentElement.style.cursor=this.elements.boxDragger.style.cursor=""};const i=h.idSeed++,a=b(`
      <svg class="${h.BASE_CLASS+"-box"}" viewBox="0 0 ${e} ${s}" style="width: ${e}px; height: ${s}px;">
        <defs>
          <linearGradient id="color-picker-saturation-${i}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#fff"></stop>
            <stop offset="100%" stop-color="hsl(0,100%,50%)"></stop>
          </linearGradient>
          <linearGradient id="color-picker-brightness-${i}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="rgba(0,0,0,0)"></stop>
            <stop offset="100%" stop-color="#000"></stop>
          </linearGradient>
          <pattern id="color-picker-pattern-${i}" width="100%" height="100%">
            <rect x="0" y="0" width="100%" height="100%" fill="url(#color-picker-saturation-${i})"></rect>
            <rect x="0" y="0" width="100%" height="100%" fill="url(#color-picker-brightness-${i})"></rect>
          </pattern>
        </defs>
        <rect id="color-picker-box-rect-${i}" rx="10" ry="10" x="0" y="0" width="${e}" height="${s}" fill="url(#color-picker-pattern-${i})"></rect>
        <svg class="${h.BASE_CLASS+"-dragger"} ${h.BASE_CLASS+"-box-dragger"}" x="0" y="0">
          <circle r="11" fill="inherit" stroke="#fff" stroke-width="2"></circle>
        </svg>
      </svg>
    `),c=b(`
      <div class="${h.BASE_CLASS+"-sliders"}" style="width: ${n}px; height: ${x}px">
        <svg class="${h.BASE_CLASS+"-color-slider"}" viewBox="0 0 ${n} ${x}">
          <defs>
            <linearGradient id="hue-${i}" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stop-color="#f00"></stop>
              <stop offset="16.666%" stop-color="#f0f"></stop>
              <stop offset="33.333%" stop-color="#00f"></stop>
              <stop offset="50%" stop-color="#0ff"></stop>
              <stop offset="66.666%" stop-color="#0f0"></stop>
              <stop offset="83.333%" stop-color="#ff0"></stop>
              <stop offset="100%" stop-color="#f00"></stop>
            </linearGradient>
          </defs>
          <rect id="color-picker-hue-rect-${i}" rx="${l?10:4}" x="0" y="${l?3:9}" width="${n}" height="${l?20:8}" fill="url(#hue-${i})"></rect>
          <svg class="${h.BASE_CLASS+"-dragger"} ${h.BASE_CLASS+"-color-slider-dragger"}" x="0" y="13">
            <circle r="11" fill="inherit" stroke="#fff" stroke-width="2"></circle>
          </svg>
        </svg>
      </div>
    `);this.elements.box=a,this.elements.boxDragger=a.lastElementChild,this.elements.saturation=a.querySelector(`#color-picker-saturation-${i}`),this.elements.boxRect=a.querySelector(`#color-picker-box-rect-${i}`),this.elements.sliders=c,this.elements.hue=c.firstElementChild,this.elements.hueDragger=this.elements.hue.lastElementChild,this.elements.hueRect=c.querySelector(`#color-picker-hue-rect-${i}`),this.hexInputField=new $({plainText:!0,label:"Appearance.Color.Hex"}),this.rgbInputField=new $({plainText:!0,label:"Appearance.Color.RGB"}),this.container=t({pickerBox:a,slider:c,hexInput:this.hexInputField.container,rgbInput:this.rgbInputField.container}),this.hexInputField.input.addEventListener("input",()=>{let r=this.hexInputField.value.replace(/#/g,"").slice(0,6);const p=r.match(/([a-fA-F\d]+)/),g=p&&p[0].length===r.length&&[6].includes(r.length);this.hexInputField.setState(g?u.Neutral:u.Error),r="#"+r,this.hexInputField.setValueSilently(r),g&&this.setColor(r,!1,!0)});const o=/^(?:rgb)?\(?([01]?\d\d?|2[0-4]\d|25[0-5])(?:\W+)([01]?\d\d?|2[0-4]\d|25[0-5])\W+(?:([01]?\d\d?|2[0-4]\d|25[0-5])\)?)$/;this.rgbInputField.input.addEventListener("input",()=>{const r=this.rgbInputField.value.match(o);this.rgbInputField.setState(r?u.Neutral:u.Error),r&&this.setColor(m(+r[1],+r[2],+r[3]),!0,!1)}),this.attachBoxListeners(),this.attachHueListeners()}static defaultBuildLayout(t){const e=document.createElement("div");e.classList.add(h.BASE_CLASS);const s=document.createElement("div");return s.className=h.BASE_CLASS+"-inputs",s.append(t.hexInput,t.rgbInput),e.append(t.pickerBox,t.slider,s),e}adjustSize({pickerBoxWidth:t,pickerBoxHeight:e,sliderWidth:s}){this.elements.box.setAttribute("viewBox",`0 0 ${t} ${e}`),this.elements.box.style.width=`${t}px`,this.elements.box.style.height=`${e}px`,this.elements.boxRect.setAttribute("width",`${t}`),this.elements.boxRect.setAttribute("height",`${e}`),this.elements.sliders.style.width=`${s}px`,this.elements.sliders.style.height=`${x}px`,this.elements.hue.setAttribute("viewBox",`0 0 ${s} ${x}`),this.elements.hueRect.setAttribute("width",`${s}`)}attachAutoResize(){return w(this.container,t=>{const e=t.contentRect.width;this.adjustSize({pickerBoxWidth:e,pickerBoxHeight:e/I,sliderWidth:e})})}attachBoxListeners(){S(this.elements.box,()=>{this.onGrabStart(),this.boxRect=this.elements.box.getBoundingClientRect()},t=>{this.saturationHandler(t.x,t.y)},()=>{this.onGrabEnd()})}attachHueListeners(){S(this.elements.hue,()=>{this.onGrabStart(),this.hueRect=this.elements.hue.getBoundingClientRect()},t=>{this.hueHandler(t.x)},()=>{this.onGrabEnd()})}setColor(t,e=!0,s=!0){if(t===void 0)t={h:0,s:100,l:50,a:1};else if(typeof t=="string")if(t[0]==="#")t=C(t);else{const o=t.match(/[.?\d]+/g);t=m(+o[0],+o[1],+o[2],o[3]===void 0?1:+o[3])}this.boxRect=this.elements.box.getBoundingClientRect();const n=this.boxRect.width/100*t.s,l=100-t.l/(100-t.s/2)*100,i=this.boxRect.height/100*l;this.saturationHandler(this.boxRect.left+n,this.boxRect.top+i,!1),this.hueRect=this.elements.hue.getBoundingClientRect();const a=t.h/360,c=this.hueRect.left+this.hueRect.width*a;this.hueHandler(c,!1),this.hue=t.h,this.saturation=t.s,this.lightness=t.l,this.alpha=t.a,this.updatePicker(e,s)}getCurrentColor(){const t=E(this.hue,this.saturation,this.lightness,this.alpha),e=B(t),s=e.slice(0,-2);return{hsl:`hsl(${this.hue}, ${this.saturation}%, ${this.lightness}%)`,rgb:`rgb(${t[0]}, ${t[1]}, ${t[2]})`,hex:s,hsla:`hsla(${this.hue}, ${this.saturation}%, ${this.lightness}%, ${this.alpha})`,rgba:`rgba(${t[0]}, ${t[1]}, ${t[2]}, ${t[3]})`,hexa:e,rgbaArray:t}}updatePicker(t=!0,e=!0){const s=this.getCurrentColor();this.elements.boxDragger.setAttributeNS(null,"fill",s.hex),t&&(this.hexInputField.setValueSilently(s.hex),this.hexInputField.setState(u.Neutral)),e&&(this.rgbInputField.setValueSilently(s.rgbaArray.slice(0,-1).join(", ")),this.rgbInputField.setState(u.Neutral)),this.onChange&&this.onChange(s)}hueHandler(t,e=!0){const n=d(t-this.hueRect.left,0,this.hueRect.width)/this.hueRect.width;this.hue=Math.round(360*n);const l=`hsla(${this.hue}, 100%, 50%, ${this.alpha})`;this.elements.hueDragger.setAttributeNS(null,"x",n*100+"%"),this.elements.hueDragger.setAttributeNS(null,"fill",l),this.elements.saturation.lastElementChild.setAttributeNS(null,"stop-color",l),e&&this.updatePicker()}saturationHandler(t,e,s=!0){const n=this.boxRect.width,l=this.boxRect.height,i=d(t-this.boxRect.left,0,n),a=d(e-this.boxRect.top,0,l),c=i/n*100,o=a/l*100,r=this.elements.boxDragger;r.setAttributeNS(null,"x",c+"%"),r.setAttributeNS(null,"y",o+"%");const p=d(c,0,100),g=100-p/2,R=100-d(o,0,100),v=d(R/100*g,0,100);this.saturation=p,this.lightness=v,s&&this.updatePicker()}};h.BASE_CLASS="color-picker",h.idSeed=0;let A=h;export{A as C};
//# sourceMappingURL=colorPicker-CxUV89V0.js.map
