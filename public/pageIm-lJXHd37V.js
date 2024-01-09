import{a as o,e as t,g as r,_ as a,l as s}from"./index-PXggFQiQ.js";import{P as l}from"./page-QOa9QBhy.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-4TiKcROA.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-lJXHd37V.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-4TiKcROA.js","./avatar-QUZk9Stm.js","./button--JO-466L.js","./index-PXggFQiQ.js","./index-VlDUTURu.css","./page-QOa9QBhy.js","./wrapEmojiText-Mt_SuK1d.js","./scrollable-EDP5lPrg.js","./putPreloader-brAFkgRk.js","./htmlToSpan-6KArIGuq.js","./countryInputField-GztpWwoo.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-oFnM-EO_.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}