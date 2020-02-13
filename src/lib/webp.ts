
import {Webp} from "webp-hero/libwebp/dist/webp.js"
import {detectWebpSupport} from "webp-hero/dist/detect-webp-support.js"

const relax = () => new Promise(resolve => requestAnimationFrame(resolve))

export class WebpMachineError extends Error {}

/**
 * Webp Machine
 * - decode and polyfill webp images
 * - can only decode images one-at-a-time (otherwise will throw busy error)
 */
export class WebpMachine {
	private readonly webp: Webp
	private readonly webpSupport: Promise<boolean>
	private busy = false
	private cache: {[key: string]: string} = {}

	constructor({
		webp = new Webp(),
		webpSupport = detectWebpSupport()
	} = {}) {
    this.webp = webp;
    this.webp.Module.doNotCaptureKeyboard = true;
		this.webpSupport = webpSupport;
	}

	/**
	 * Decode raw webp data into a png data url
	 */
	async decode(webpData: Uint8Array): Promise<string> {
		if (this.busy) throw new WebpMachineError("cannot decode when already busy")
		this.busy = true

		try {
			await relax()
			const canvas = document.createElement("canvas")
			this.webp.setCanvas(canvas)
			this.webp.webpToSdl(webpData, webpData.length)
			this.busy = false
			return canvas.toDataURL()
		}
		catch (error) {
			this.busy = false
			error.name = WebpMachineError.name
			error.message = `failed to decode webp image: ${error.message}`
			throw error
		}
	}
}

(window as any).WebpMachine = WebpMachine;
