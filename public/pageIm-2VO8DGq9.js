import{a as o,e as t,g as r,_ as a,l as s}from"./index-XZA1-3MU.js";import{P as l}from"./page-eb81Un_i.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-aLs9GOvc.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-2VO8DGq9.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-aLs9GOvc.js","./avatar-ohgkiWHW.js","./button-aS2SE0kp.js","./index-XZA1-3MU.js","./index-pzR5gIOz.css","./page-eb81Un_i.js","./wrapEmojiText-pejq-WF4.js","./scrollable-OU41biYL.js","./putPreloader--f-Xu9AG.js","./htmlToSpan-52gQDcFu.js","./countryInputField-Rr6PHiIn.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-H0ySI27M.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}