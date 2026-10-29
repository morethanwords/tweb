//# allFunctionsCalledOnLoad
function e(e){let t=typeof e?.type==`string`?e.type.match(/^FLOOD_WAIT_(\d+)/):null,n=t&&parseInt(t[1])||0;return n?{hasWaitTime:!0,waitTime:n}:{hasWaitTime:!1}}export{e as t};
//# sourceMappingURL=getFloodWaitTime-CE-DRug6.js.map