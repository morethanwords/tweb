import{a as o,e as t,g as r,_ as a,l as s}from"./index-KevWqk89.js";import{P as l}from"./page-h4-JFMdU.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-ANBs5neo.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-E1byF-Pr.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-ANBs5neo.js","./avatar-BpokTWXU.js","./button-2EiMqoep.js","./index-KevWqk89.js","./index-a3UEjh-7.css","./page-h4-JFMdU.js","./wrapEmojiText-mmXdQbhu.js","./scrollable-Awk_CiIT.js","./putPreloader-UPXgnht_.js","./htmlToSpan-oMhsa39O.js","./countryInputField-n-i1h4kG.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-rCp6aD83.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}