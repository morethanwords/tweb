import{a as o,f as t,h as r,_ as a,l as s}from"./index-fHlWRqCU.js";import{P as l}from"./page-a_SRcjsp.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-TJcj06gB.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-xpkTabqa.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-TJcj06gB.js","./avatar-inRkXAdO.js","./button-xTNZPjVe.js","./index-fHlWRqCU.js","./index-pzR5gIOz.css","./page-a_SRcjsp.js","./wrapEmojiText-t90P2W1z.js","./scrollable-M6CE2UA2.js","./putPreloader-mw406B9q.js","./htmlToSpan-gis36w6q.js","./countryInputField-s-A0a5H-.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-G_ifGWKe.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}