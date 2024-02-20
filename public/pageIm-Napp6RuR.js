import{a as o,e as t,g as r,_ as a,l as s}from"./index-hMtu7mz2.js";import{P as l}from"./page-yb8jlICo.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-SLGK78BM.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-Napp6RuR.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-SLGK78BM.js","./avatar-b14pfa9M.js","./button-cwG208uc.js","./index-hMtu7mz2.js","./index-kXhP1fQP.css","./page-yb8jlICo.js","./wrapEmojiText-ZF3ZRJ_k.js","./scrollable-7gYZYBaT.js","./putPreloader-8oF1BTPQ.js","./htmlToSpan-_EoWsNhf.js","./countryInputField-IXi4LTO0.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-WTqIeFTs.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}