import{a as o,e as t,g as r,_ as a,l as s}from"./index-GdXo2iUu.js";import{P as l}from"./page-MRK5ajEw.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-47umEMIG.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-0ofw_Qvf.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-47umEMIG.js","./avatar-5eIl9r5-.js","./button-LBQ6siPM.js","./index-GdXo2iUu.js","./index-VlDUTURu.css","./page-MRK5ajEw.js","./wrapEmojiText-O99M_mt6.js","./scrollable-K0kBWz-_.js","./putPreloader-wrEINppn.js","./htmlToSpan-DGq4Sf8F.js","./countryInputField-cE32EVUg.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-oXD8KRhW.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}