import{a as o,e as t,g as r,_ as a,l as s}from"./index-0OJnCXHr.js";import{P as l}from"./page-g8mEXPlf.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-3DFih4MP.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-bvnqTxMn.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-3DFih4MP.js","./avatar-5jAiwkTT.js","./button-gzfT5Gk1.js","./index-0OJnCXHr.js","./index-oCcwLZ8q.css","./page-g8mEXPlf.js","./wrapEmojiText-_vWe2RYS.js","./scrollable-AXHmt_MB.js","./putPreloader-9jjl2rDp.js","./htmlToSpan-XONPSAPU.js","./countryInputField-83pHXnan.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-m5nP4an4.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}