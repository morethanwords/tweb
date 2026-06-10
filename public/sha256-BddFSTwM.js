import{a8 as r}from"./index-BwIBo_Hm.js";const e=typeof window<"u"&&"crypto"in window?window.crypto.subtle:self.crypto.subtle;function s(t){return e.digest("SHA-256",r(t)).then(n=>new Uint8Array(n))}export{s as a,e as s};
//# sourceMappingURL=sha256-BddFSTwM.js.map
