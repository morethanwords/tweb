function a(n,t){let r=!1,e=0;const c=()=>{if(!(r||t&&!t())){if(n.isConnected){n.focus();return}e=requestAnimationFrame(c)}};return e=requestAnimationFrame(c),()=>{r=!0,cancelAnimationFrame(e)}}export{a as f};
//# sourceMappingURL=focusWhenConnected-14rkj1jb.js.map
