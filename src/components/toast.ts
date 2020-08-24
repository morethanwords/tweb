const toastEl = document.createElement('div');
toastEl.classList.add('toast');
export function toast(html: string) {
  toastEl.innerHTML = html;
  document.body.append(toastEl);

  if(toastEl.dataset.timeout) clearTimeout(+toastEl.dataset.timeout);
  toastEl.dataset.timeout = '' + setTimeout(() => {
    toastEl.remove();
    delete toastEl.dataset.timeout;
  }, 3000);
}