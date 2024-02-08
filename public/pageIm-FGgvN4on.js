import{a as o,e as t,g as r,_ as a,l as s}from"./index-KxhL4Pfo.js";import{P as l}from"./page-LLAguh9Y.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-G_uimGwK.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-FGgvN4on.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-G_uimGwK.js","./avatar-l-tpMIIc.js","./button-jLCgQafz.js","./index-KxhL4Pfo.js","./index-SIFg33ud.css","./page-LLAguh9Y.js","./wrapEmojiText-58ATGH7h.js","./scrollable-RGQayP6H.js","./putPreloader-IW6Epw8a.js","./htmlToSpan-PCmdpU43.js","./countryInputField-wm1A6Bzw.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-2YPzdM-C.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}