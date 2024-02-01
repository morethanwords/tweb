import{a as o,e as t,g as r,_ as a,l as s}from"./index-0wHDtVcK.js";import{P as l}from"./page-9C5p-eD_.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-g4DOHvz-.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-tCjmI0q9.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-g4DOHvz-.js","./avatar-KWn3zHtL.js","./button-Ds4-zzy5.js","./index-0wHDtVcK.js","./index-cNa-T4HH.css","./page-9C5p-eD_.js","./wrapEmojiText-pupJ-a1l.js","./scrollable-5zxCV_hS.js","./putPreloader-9UPQGEOi.js","./htmlToSpan-utecc87G.js","./countryInputField-Rt-E4CjF.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-oOfWM-cI.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}