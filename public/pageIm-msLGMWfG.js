import{a as o,e as t,g as r,_ as a,l as s}from"./index-dvIen_E8.js";import{P as l}from"./page-6V5n_C6V.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-I3KgfpFk.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-msLGMWfG.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-I3KgfpFk.js","./avatar-KH8SQHmA.js","./button-JmjujcuK.js","./index-dvIen_E8.js","./index-AVuhmvIK.css","./page-6V5n_C6V.js","./wrapEmojiText-acQ_aCW7.js","./scrollable-tTPQi33o.js","./putPreloader-q68En1U3.js","./htmlToSpan-dq6gkPQ4.js","./countryInputField-ppDpsjpt.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-QQhr4wlZ.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}