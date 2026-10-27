//# allFunctionsCalledOnLoad
function e({width:e=0,height:t=0,image:n}={}){let r=document.createElement(`canvas`);r.width=e,r.height=t;let i=r.captureStream();i.getVideoTracks()[0].enabled=!0;let a=r.getContext(`2d`);return n&&(a.drawImage(n,0,0,e,t),a.globalAlpha=.5,a.fillStyle=`#000`),a.fillRect(0,0,e,t),i}export{e as t};
//# sourceMappingURL=createCanvasStream-B1dHr4H9.js.map