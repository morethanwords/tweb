import{a as o,e as t,g as r,_ as a,l as s}from"./index-lS0zgiqS.js";import{P as l}from"./page-QHQHurSu.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-0rV8yrEC.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-ub-QNFKR.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-0rV8yrEC.js","./avatar-fXaA8sLn.js","./button-aOiXO0Sl.js","./index-lS0zgiqS.js","./index-VlDUTURu.css","./page-QHQHurSu.js","./wrapEmojiText-WJDO0KmB.js","./scrollable-LzLHUiNv.js","./putPreloader-EnVE_Sqm.js","./htmlToSpan-WDyx53gQ.js","./countryInputField-syGd7wUj.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-eTjp2uxP.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}