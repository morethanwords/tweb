import{a as o,e as t,g as r,_ as a,l as s}from"./index-yzRohyy9.js";import{P as l}from"./page-vZ9UZ7BT.js";const n=()=>(o.managers.appStateManager.pushToState("authState",{_:"authStateSignedIn"}),t.requestedServerLanguage||t.getCacheLangPack().then(e=>{e.local&&t.getLangPack(e.lang_code)}),i.pageEl.style.display="",r(),Promise.all([a(()=>import("./appDialogsManager-wOnLJLSw.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]),import.meta.url),s(),"requestVideoFrameCallback"in HTMLVideoElement.prototype?Promise.resolve():a(()=>import("./requestVideoFrameCallbackPolyfill-GsYXQx88.js"),__vite__mapDeps([]),import.meta.url)]).then(([e])=>{e.default.start(),setTimeout(()=>{document.getElementById("auth-pages").remove()},1e3)})),i=new l("page-chats",!1,n);export{i as default};
//# sourceMappingURL=pageIm-TbEWAR-l.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./appDialogsManager-wOnLJLSw.js","./avatar-y1W7TPXx.js","./button-31BeO1mP.js","./index-yzRohyy9.js","./index-pzR5gIOz.css","./page-vZ9UZ7BT.js","./wrapEmojiText-hswWiVAK.js","./scrollable-sMOly0_Y.js","./putPreloader-SMoJW7x7.js","./htmlToSpan-_yQ8hN2N.js","./countryInputField-EAOJDAJS.js","./textToSvgURL-Z4O-nL1S.js","./codeInputField-fG2A-Mga.js","./appDialogsManager-6QNcK96s.css"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}