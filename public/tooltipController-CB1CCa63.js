//# allFunctionsCalledOnLoad
var e=new class{constructor(){this.closeCallbacks=new Set}register(e){return this.closeCallbacks.add(e),()=>this.closeCallbacks.delete(e)}closeAll(){[...this.closeCallbacks].forEach(e=>e())}};export{e as t};
//# sourceMappingURL=tooltipController-CB1CCa63.js.map