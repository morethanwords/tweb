//# allFunctionsCalledOnLoad
var e=class extends Set{track(e){let t=new WeakRef(e);return this.add(t),t}forEachLive(e){for(let t of this){let n=t.deref();n?e(n):this.delete(t)}}};export{e as t};
//# sourceMappingURL=weakRefSet-D3PuxdgC.js.map