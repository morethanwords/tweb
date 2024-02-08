import{a as o,e as t,g as r,_ as a,l as s}from"./index-U8k8Ynib.js";import{P as l}from"./page-BW92TTfv.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-X9P9XVAr.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-Ssg96uN7.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-X9P9XVAr.js","./avatar-xB2FfH3N.js","./button-6UuRzbmA.js","./index-U8k8Ynib.js","./index-SIFg33ud.css","./page-BW92TTfv.js","./wrapEmojiText-fnWLwva8.js","./scrollable-w9FPfYJJ.js","./putPreloader-c0NAVc5V.js","./htmlToSpan-TJkKoYZd.js","./countryInputField-cYPgzbfk.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-mq0WxfIO.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}