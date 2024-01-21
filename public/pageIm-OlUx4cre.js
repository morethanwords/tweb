import{a as o,e as t,g as r,_ as a,l as s}from"./index-Ir_5dCYr.js";import{P as l}from"./page-BQ6YEPQf.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-T8_uAAlM.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-OlUx4cre.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-T8_uAAlM.js","./avatar-DBMrtMNg.js","./button-6gG3Eqqb.js","./index-Ir_5dCYr.js","./index-03gtc5VX.css","./page-BQ6YEPQf.js","./wrapEmojiText-jwbmuhKo.js","./scrollable-KUorvceU.js","./putPreloader-M8tZ1q34.js","./htmlToSpan-mNWxaBNq.js","./countryInputField-q2pklkoL.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-27N3hJwB.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}