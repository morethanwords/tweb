//# allFunctionsCalledOnLoad
function e(t,n=2){if(t===0)return`0`;if(t<0)return`-`+e(-t,n);let r=1e3,i=n<0?0:n,a=[``,`K`,`M`,`B`,`T`],o=Math.min(Math.floor(Math.log(t)/Math.log(r)),a.length-1);return parseFloat((t/r**o).toFixed(i))+a[o]}export{e as t};
//# sourceMappingURL=formatNumber-CrA4O9hN.js.map