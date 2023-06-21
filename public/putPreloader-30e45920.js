import{M as i}from"./index-608b9304.js";function a(r,t=!1){const s=`
  <svg xmlns="http://www.w3.org/2000/svg" class="preloader-circular" viewBox="25 25 50 50">
  <circle class="preloader-path" cx="50" cy="50" r="20" fill="none" stroke-miterlimit="10"/>
  </svg>`;if(t){const e=document.createElement("div");return e.classList.add("preloader"),e.innerHTML=s,r&&r.appendChild(e),e}return r.insertAdjacentHTML("beforeend",s),r.lastElementChild}i.putPreloader=a;function o(r,t="check"){return r.classList.remove("tgico-"+t),r.disabled=!0,a(r),()=>{r.replaceChildren(),r.classList.add("tgico-"+t),r.removeAttribute("disabled")}}export{a as p,o as s};
//# sourceMappingURL=putPreloader-30e45920.js.map
