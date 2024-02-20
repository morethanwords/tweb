import{a as o,e as t,g as r,_ as a,l as s}from"./index-4dxJURxu.js";import{P as l}from"./page-p1wFORTp.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-UN6bZe_I.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-q46uNQcs.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-UN6bZe_I.js","./avatar-meHMuswV.js","./button-vaojbvAN.js","./index-4dxJURxu.js","./index-r_N6u86T.css","./page-p1wFORTp.js","./wrapEmojiText-6YYJxVNw.js","./scrollable-3yWtQ_v1.js","./putPreloader-EDFJd2e5.js","./htmlToSpan-PO6PrFzY.js","./countryInputField-dH5gXLyV.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-y4qtnmVz.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}