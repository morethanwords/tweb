import{a as o,e as t,g as r,_ as a,l as s}from"./index-PrfXNcAD.js";import{P as l}from"./page-j4qxlABU.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-JTofNoqN.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-VTwEGGqs.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-JTofNoqN.js","./avatar-AqiYQlwW.js","./button-Vj1bAIYP.js","./index-PrfXNcAD.js","./index-3IrLF-DD.css","./page-j4qxlABU.js","./wrapEmojiText-poDXqnXH.js","./scrollable-OQXHkZi8.js","./putPreloader-MRXxczrf.js","./htmlToSpan-J4sGdLFI.js","./countryInputField-pA3or5qX.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-u2UTTNph.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}