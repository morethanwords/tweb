type TooltipClose = () => void;

class TooltipController {
  private closeCallbacks = new Set<TooltipClose>();

  public register(close: TooltipClose) {
    this.closeCallbacks.add(close);
    return () => this.closeCallbacks.delete(close);
  }

  public closeAll() {
    [...this.closeCallbacks].forEach((close) => close());
  }
}

const tooltipController = new TooltipController();
export default tooltipController;
