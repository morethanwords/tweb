//# allFunctionsCalledOnLoad
function e(e){let t=e.tagName===`AUDIO`||e.tagName===`VIDEO`,n=e;if(t){try{n.pause()}catch{}n.srcObject=null,n.src=``}if(!t&&!e.isConnected)e.src=``;else if(e.removeAttribute(`src`),t)try{n.load()}catch{}}export{e as t};
//# sourceMappingURL=clearMediaElementSource-nyXce2uw.js.map