import{a as o,e as t,g as r,_ as a,l as s}from"./index-3JVQT9YU.js";import{P as l}from"./page-MHdLDqLL.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-n1OTFTGt.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-gTrwwzqN.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-n1OTFTGt.js","./avatar-Ua9S6iCi.js","./button-dksoXDfg.js","./index-3JVQT9YU.js","./index-3IrLF-DD.css","./page-MHdLDqLL.js","./wrapEmojiText-CSwrGT2M.js","./scrollable-uyGGO_zK.js","./putPreloader-ups32tOW.js","./htmlToSpan-1Q1h4vmi.js","./countryInputField-40FFkfLM.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-zeKezEur.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}