import{M as o}from"./index-BkkOS5_4.js";function i(r,n=!1){const e=`
  <svg xmlns="http://www.w3.org/2000/svg" class="preloader-circular" viewBox="25 25 50 50">
  <circle class="preloader-path" cx="50" cy="50" r="20" fill="none" stroke-miterlimit="10"/>
  </svg>`;if(n){const t=document.createElement("div");return t.classList.add("preloader"),t.innerHTML=e,r&&r.appendChild(t),t}return r.insertAdjacentHTML("beforeend",e),r.lastElementChild}o.putPreloader=i;function a(r,n="check"){const e=r.querySelector(".tgico");return e?.remove(),r.disabled=!0,i(r),()=>{r.replaceChildren(),e&&r.append(e),r.removeAttribute("disabled")}}export{i as p,a as s};
//# sourceMappingURL=putPreloader-XVHOfOJL.js.map
