import{a as o,e as t,g as r,_ as a,l as s}from"./index-qSlrZUPB.js";import{P as l}from"./page-CJ_86FDg.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-jxFxxsOc.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-oJM-RVvD.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-jxFxxsOc.js","./avatar-LtYhVRD2.js","./button-yzvi0BQv.js","./index-qSlrZUPB.js","./index-oCcwLZ8q.css","./page-CJ_86FDg.js","./wrapEmojiText-WEOtSS7R.js","./scrollable-1qonJR7t.js","./putPreloader-7BKJGMcN.js","./htmlToSpan-vhraqO4U.js","./countryInputField-3XLX8XXf.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-NXAgFiEg.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}