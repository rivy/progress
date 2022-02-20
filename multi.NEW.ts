import { bgGreen, bgWhite, writeAllSync } from './deps.ts';

const isTTY = Deno.isatty(Deno.stdout.rid);
const isWindow = Deno.build.os === 'windows';

// ANSI CSI sequences; ref: <https://en.wikipedia.org/wiki/ANSI_escape_code> @@ <https://archive.is/CUtrX>
const ansiCSI = {
	showCursor: '\x1b[?25h',
	hideCursor: '\x1b[?25l',
	clearEOS: '\x1b[0J',
	clearEOL: '\x1b[0K',
};

interface constructorOptions {
	title?: string;
	width?: number;
	complete?: string;
	incomplete?: string;
	clear?: boolean;
	interval?: number;
	display?: string;
}

interface renderOptions {
	completed: number;
	text?: string;
	total?: number;
	complete?: string;
	incomplete?: string;
}

export class MultiProgressBar {
	width: number;
	complete: string;
	incomplete: string;
	clear: boolean;
	interval: number;
	display: string;

	#end = false;
	#startIndex = 0;
	#lastRows = 0;
	#strs: string[] = [];
	private lastStr = '';
	private start = Date.now();
	private time?: string;
	private lastRender = 0;
	private encoder = new TextEncoder();

	/**
	 * Title, total, complete, incomplete, can also be set or changed in the render method
	 *
	 * @param title Progress bar title, default: ''
	 * @param width the displayed width of the progress, default: 50
	 * @param complete completion character, default: colors.bgGreen(' '), can use any string
	 * @param incomplete incomplete character, default: colors.bgWhite(' '), can use any string
	 * @param clear  clear the bar on completion, default: false
	 * @param interval  minimum time between updates in milliseconds, default: 16
	 * @param display  What is displayed and display order, default: ':bar :text :percent :time :completed/:total'
	 */
	constructor(
		{
			title = '',
			width = 50,
			complete = bgGreen(' '),
			incomplete = bgWhite(' '),
			clear = false,
			interval,
			display,
		}: constructorOptions = {},
	) {
		if (title != '') {
			this.#strs.push(title);
			this.#startIndex = 1;
		}
		this.width = width;
		this.complete = complete;
		this.incomplete = incomplete;
		this.clear = clear;
		this.interval = interval ?? 16;
		this.display = display ?? ':bar :text :percent :time :completed/:total';
	}

	/**
	 * "render" the progress bar
	 *
	 * - `bars` progress bars
	 *   - `completed` completed value
	 *   - `total` optional, total number of ticks to complete, default: 100
	 *   - `text` optional, text displayed per ProgressBar, default: ''
	 *   - `complete` - optional, completion character
	 *   - `incomplete` - optional, incomplete character
	 */
	render(bars_: renderOptions | Array<renderOptions>): void {
		if (this.#end || !isTTY) return;

		const bars = Array.isArray(bars_) ? bars_ : [bars_];

		const now = Date.now();
		const ms = now - this.lastRender;
		this.lastRender = now;
		this.time = ((now - this.start) / 1000).toFixed(1) + 's';
		let end = true;
		let index = this.#startIndex;

		for (const { completed, total = 100, text = '', ...options } of bars) {
			if (completed < 0) {
				throw new Error(`completed must greater than or equal to 0`);
			}
			if (!Number.isInteger(total)) throw new Error(`total must be 'number'`);
			if (completed > total && this.#strs[index] != undefined) {
				if (!this.clear) index += 1;
				continue;
			}
			end = false;
			const percent = ((completed / total) * 100).toFixed(2) + '%';
			// :bar :text :percent :time :completed/:total
			let str = this
				.display
				.replace(':text', text)
				.replace(':time', this.time)
				.replace(':percent', percent)
				.replace(':completed', completed + '')
				.replace(':total', total + '');

			// compute the available space (non-zero) for the bar
			let availableSpace = Math.max(0, this.ttyColumns - str.replace(':bar', '').length);
			if (availableSpace && isWindow) availableSpace -= 1;
			const width = Math.min(this.width, availableSpace);
			// :bar
			const completeLength = Math.round(width * completed / total);
			const complete = new Array(completeLength).fill(options.complete ?? this.complete).join('');
			const incomplete = new Array(width - completeLength)
				.fill(options.incomplete ?? this.incomplete)
				.join('');

			str = str.replace(':bar', complete + incomplete);
			this.#strs[index++] = str;
		}
		for (let i = index; i < this.#strs.length; i++) {
			this.#strs[index] = '';
		}
		if (ms < this.interval && end == false) return;
		const renderStr = this.#strs.join(`\n${ansiCSI.clearEOL}`);

		if (renderStr !== this.lastStr) {
			this.hideCursor();
			this.resetPosition();
			this.write(renderStr);
			this.lastStr = renderStr;
			this.#lastRows = this.#strs.length;
			this.showCursor();
		}

		if (end) this.end();
	}

	/**
	 * end: end a progress bar.
	 * No need to call in most cases, unless you want to end before 100%
	 */
	end(): void {
		this.#end = true;
		if (this.clear) {
			this.resetScreen();
		} else {
			this.breakLine();
		}
		this.showCursor();
	}

	/**
	 * interrupt the progress bar and write a message above it
	 *
	 * @param message The message to write
	 */
	console(message: string | number): void {
		this.hideCursor();
		this.resetPosition();
		this.write(`${message}`);
		this.breakLine();
		this.write(this.lastStr);
		this.showCursor();
	}

	private write(msg: string): void {
		msg = `${msg}${ansiCSI.clearEOL}`;
		this.stdoutWrite(msg);
	}

	private resetScreen() {
		this.resetPosition();
		if (this.#lastRows > 0) {
			this.stdoutWrite(`${ansiCSI.clearEOS}`);
		}
	}

	private resetPosition() {
		if (this.#lastRows > 0) {
			this.stdoutWrite('\x1b[' + (this.#lastRows - 1) + 'A\r');
		}
	}

	private get ttyColumns(): number {
		return 100;
	}

	private breakLine() {
		this.stdoutWrite(`\r\n${ansiCSI.clearEOL}`);
	}

	private stdoutWrite(msg: string) {
		writeAllSync(Deno.stdout, this.encoder.encode(msg));
	}

	private hideCursor(): void {
		this.stdoutWrite(`${ansiCSI.hideCursor}`);
	}
	private showCursor(): void {
		this.stdoutWrite(`${ansiCSI.showCursor}`);
	}
}
