import{a as o,e as t,g as r,_ as a,l as s}from"./index-V9prFj2_.js";import{P as l}from"./page-UoJ5ebDX.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-a21weyXD.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-D3BIWMsS.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-a21weyXD.js","./avatar-qM-zG4BL.js","./button-nX8trwgz.js","./index-V9prFj2_.js","./index-a9cJFIqq.css","./page-UoJ5ebDX.js","./wrapEmojiText-PgUc0oWi.js","./scrollable-a8VUE4jl.js","./putPreloader-hijTKqyN.js","./htmlToSpan-mDapkOYi.js","./countryInputField-tk1nXTBx.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-j3XNfSfl.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}