import{a as o,e as t,g as r,_ as a,l as s}from"./index-vPomZQnx.js";import{P as l}from"./page-LpAoM83r.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-URoWMqDh.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-htxc-EuZ.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-URoWMqDh.js","./avatar-UmBSPhwk.js","./button-WMjxfvfX.js","./index-vPomZQnx.js","./index-a9cJFIqq.css","./page-LpAoM83r.js","./wrapEmojiText-EY4tBdob.js","./scrollable-bkRNAagy.js","./putPreloader-gR5Sxp5Q.js","./htmlToSpan-xJ1szuCq.js","./countryInputField-HQv8dYSM.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-PTZhrd1O.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}