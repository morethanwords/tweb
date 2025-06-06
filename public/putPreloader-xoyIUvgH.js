import{O as i}from"./index-KE8-Aw4R.js";function n(e,o=!1){const r=`
  <svg xmlns="http://www.w3.org/2000/svg" class="preloader-circular" viewBox="25 25 50 50">
  <circle class="preloader-path" cx="50" cy="50" r="20" fill="none" stroke-miterlimit="10"/>
  </svg>`;if(o){const t=document.createElement("div");return t.classList.add("preloader"),t.innerHTML=r,e&&e.appendChild(t),t}return e.insertAdjacentHTML("beforeend",r),e.lastElementChild}i.putPreloader=n;function a(e,o="check"){const r=e.querySelector(".tgico");return r?.remove(),e.disabled=!0,n(e),()=>{e.replaceChildren(),r&&e.append(r),e.removeAttribute("disabled")}}function c(){const e=document.createElement("div");return e.classList.add("preloader"),n(e),e}export{c as P,n as p,a as s};
//# sourceMappingURL=putPreloader-xoyIUvgH.js.map
