//# allFunctionsCalledOnLoad
function e(e,t,n){let r=0,i=0,a;return(o,s)=>{r++||(a=s);let c=++i;new Promise(t=>t(e(o))).then(()=>{--r,a=o},()=>{if(--r)return;if(!n){t(a);return}let e=e=>c===i&&t(e);new Promise(e=>e(n())).then(e,()=>e(void 0))})}}export{e as t};
//# sourceMappingURL=createOptimisticSave-DiuSnTCJ.js.map