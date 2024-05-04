function o(t,r){const n=t.length;if(n!==r.length)return!1;for(let e=0;e<n;++e)if(t[e]!==r[e])return!1;return!0}function l(t){const r=new Blob([t],{type:"image/svg+xml;charset=utf-8"});return new Promise(n=>{const e=new FileReader;e.onload=a=>{n(a.target.result)},e.readAsDataURL(r)})}export{o as b,l as t};
//# sourceMappingURL=textToSvgURL-Cnw_Q8Rw.js.map
