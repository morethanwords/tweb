import{a as o,e as t,g as r,_ as a,l as s}from"./index-fwEXG5WO.js";import{P as l}from"./page-SPUvE1lZ.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-ABNTABxH.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-4oQIZYNp.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-ABNTABxH.js","./avatar-Hs5r8Ku2.js","./button-mzmzadiB.js","./index-fwEXG5WO.js","./index-oCcwLZ8q.css","./page-SPUvE1lZ.js","./wrapEmojiText-ut0bMpjU.js","./scrollable-kVe9RJSr.js","./putPreloader-kE5-kGsR.js","./htmlToSpan-tcUSO2xw.js","./countryInputField-0yVSL3jS.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-4khBkTdP.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}