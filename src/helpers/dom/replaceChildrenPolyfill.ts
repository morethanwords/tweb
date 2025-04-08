export default function replaceChildrenPolyfill() {
  if((Node as any).prototype.replaceChildren === undefined) {
    (Node as any).prototype.replaceChildren = function(...nodes: any[]) {
      this.textContent = '';
      // while(this.lastChild) {
      //   this.removeChild(this.lastChild);
      // }
      if(nodes) {
        this.append(...nodes);
      }
    }
  }
}
