import {Webp} from "webp-hero/libwebp/dist/webp.js"

const relax = () => new Promise(resolve => requestAnimationFrame(resolve));

export class WebpMachineError extends Error {}

/**
 * Webp Machine
 * - decode and polyfill webp images
 * - can only decode images one-at-a-time (otherwise will throw busy error)
 */
export class WebpMachine {
	private readonly webp: Webp;
	private busy = false;

	constructor() {
    this.webp = new Webp();
    this.webp.Module.doNotCaptureKeyboard = true;
	}

	/**
	 * Decode raw webp data into a png data url
	 */
	decode(webpData: Uint8Array): Promise<Uint8Array> {
		if(this.busy) throw new WebpMachineError("cannot decode when already busy");
		this.busy = true;

		try {
			return relax().then(() => {
				const canvas = document.createElement("canvas");
				this.webp.setCanvas(canvas);
				this.webp.webpToSdl(webpData, webpData.length);
				this.busy = false;

				return new Promise((resolve, reject) => {
					canvas.toBlob(blob => {
						let reader = new FileReader();
						reader.onload = (event) => {
							resolve(new Uint8Array(event.target.result as ArrayBuffer));
						};
						reader.onerror = reject;
						reader.readAsArrayBuffer(blob);
					}, 'image/png', 1);
				});
			});	
		} catch(error) {
			this.busy = false;
			error.name = WebpMachineError.name;
			error.message = `failed to decode webp image: ${error.message}`;
			throw error;
		}
	}
}

(window as any).WebpMachine = WebpMachine;
