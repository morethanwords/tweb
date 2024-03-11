import{a as o,e as t,g as r,_ as a,l as s}from"./index-M8z-nwNm.js";import{P as l}from"./page-kT6kVFv9.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-lzhZi3nI.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-wngHxkKH.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-lzhZi3nI.js","./avatar-HalcuPNE.js","./button-Mm7TqKr1.js","./index-M8z-nwNm.js","./index-pzR5gIOz.css","./page-kT6kVFv9.js","./wrapEmojiText-PAHdiQbe.js","./scrollable-ILmNatrX.js","./putPreloader-jxB4tqkF.js","./htmlToSpan-BQ96zqgl.js","./countryInputField-tqY1KpER.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-Ofayp2TX.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}