import{a as o,e as t,g as r,_ as a,l as s}from"./index-r0mvkgtT.js";import{P as l}from"./page-OymlVzXV.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-Z3P-OhQW.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-Qr9bIoEj.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-Z3P-OhQW.js","./avatar--jQ5OjGY.js","./button-ic53N62J.js","./index-r0mvkgtT.js","./index-3IrLF-DD.css","./page-OymlVzXV.js","./wrapEmojiText-lpiuF9Wi.js","./scrollable-eeUkmC7o.js","./putPreloader-oRPDLEOq.js","./htmlToSpan-vrpG4Zud.js","./countryInputField-oolKOC4j.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-L27xuwP5.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}