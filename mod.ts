import { bgGreen, bgWhite, sprintf, writeAllSync } from './deps.ts';
import { consoleSize } from './src/lib/consoleSize.ts';
export { MultiProgressBar } from './multi.ts';

const isWinOS = Deno.build.os === 'windows';

// spell-checker:ignore (WinOS) CONOUT

// ToDO: `cursorRest = [start, end, after]`, default = after
// ToDO: ES6-template compatible format strings
// ref: <>
// ```js
// const fill = function(template: string, vars = {}) {
// 	const keys = Object.keys(vars);
// 	const values = Object.values(vars);
// 	return new Function(...keys, `return \`${template}\`;`)(...values);
// };
//
// const s = 10; console.log(fill('s=${s.toString().padStart(4,`.`)}',{s}));"
// ```
// ToDO: add ability/option to write directly to console via '$CONOUT' or '/dev/tty' avoiding writes to STDOUT or STDERR
// ToDO: add `pause(clearOnPause: boolean = false)` which could be used for the controller to cleanly print to STDERR/OUT and then `resume()`

// ANSI CSI sequences; ref: <https://en.wikipedia.org/wiki/ANSI_escape_code> @@ <https://archive.is/CUtrX>
const ansiCSI = {
	clearEOL: '\x1b[0K',
	clearEOS: '\x1b[0J',
	clearLine: '\x1b[2K',
	cursorUp: /* move cursor up {n} lines */ '\x1b[{n}A',
	hideCursor: '\x1b[?25l',
	showCursor: '\x1b[?25h',
};

const ttySize = await consoleSize(); // async global b/c `Deno.consoleSize()` lost functionality when stabilized (see GH:denoland/deno#17982)

interface constructorOptions {
	// *default* progress line update options
	goal?: number;
	label?: string;
	barSymbolComplete?: string;
	barSymbolIncomplete?: string;
	barSymbolIntermediate?: string[];
	completeTemplate?: string;
	progressBarWidthMax?: number;
	progressBarWidthMin?: number;
	progressTemplate?: string;
	autoComplete?: boolean;
	// render settings
	clearAllOnComplete?: boolean;
	displayAlways?: boolean;
	hideCursor?: boolean;
	maxWidth?: number;
	minRenderInterval?: number;
	title?: string;
	writer?: Deno.WriterSync & { rid: number };
}

interface updateOptions {
	goal?: number;
	label?: string;
	barSymbolComplete?: string;
	barSymbolIncomplete?: string;
	barSymbolIntermediate?: string[];
	completeTemplate?: string;
	progressBarWidthMax?: number;
	progressBarWidthMin?: number;
	progressTemplate?: string;
	autoComplete?: boolean;
}

// type ProgressUpdateObject = { value: number; options?: updateOptions };

export default class Progress {
	label: string;
	goal: number;
	barSymbolComplete: string;
	barSymbolIncomplete: string;
	barSymbolIntermediate: string[];
	completeTemplate: string | null | undefined;
	progressBarWidthMax: number;
	progressBarWidthMin: number;
	progressTemplate: string;
	autoComplete: boolean;
	clearAllOnComplete: boolean;
	displayAlways: boolean;
	hideCursor: boolean;
	minRenderInterval: number;
	title: string | null | undefined;
	writer: Deno.WriterSync & { rid: number };
	ttyColumns: number;

	private display = true;
	private isCompleted = false;
	private startTime = Date.now();
	private priorUpdateText = '';
	private priorUpdateTime = 0;

	private encoder = new TextEncoder();

	/**
	 * Goal, label, barSymbolComplete, barSymbolIncomplete, and barSymbolIntermediate also be changed dynamically in the update method
	 *
	 * @param goal  total number of ticks to complete, default: 100
	 * @param label  progress line label text, default: ''
	 * @param barSymbolComplete  completion symbol, default: colors.bgGreen(' ')
	 * @param barSymbolIncomplete  incomplete symbol, default: colors.bgWhite(' ')
	 * @param barSymbolIntermediate  incomplete symbol, default: colors.bgWhite(' ')
	 * @param completeTemplate  progress display line content for completion, default: undefined
	 * @param progressBarWidthMax  the maximum displayed width of the progress bar, default: 50 characters
	 * @param progressBarWidthMin  the minimum displayed width of the progress bar, default: 10 characters
	 * @param progressTemplate  progress display line content, default: ':label :percent :bar :elapsed :value/:goal'
	 * @param autoComplete  automatically `complete()` when goal is reached, default: true
	 * @param clearAllOnComplete  clear the entire progress display upon completion, default: false
	 * @param displayAlways  avoid TTY check on writer and always display progress, default: false
	 * @param hideCursor  hide cursor until progress line display is complete, default: false
	 * @param title  progress title line (static), default: undefined
	 * @param minRenderInterval  minimum time between updates in milliseconds, default: 16 ms
	 */
	constructor(
		{
			goal = 100,
			label = '',
			barSymbolComplete = bgGreen(' '),
			barSymbolIncomplete = bgWhite(' '),
			barSymbolIntermediate = [],
			completeTemplate = undefined,
			progressBarWidthMax = 50,
			progressBarWidthMin = 10,
			progressTemplate = ':label :percent :bar :elapsed :value/:goal',
			autoComplete = true,
			clearAllOnComplete = true,
			displayAlways = false,
			hideCursor = false,
			minRenderInterval = 16,
			title = undefined,
			writer = Deno.stderr,
		}: constructorOptions = {},
	) {
		this.goal = goal;
		this.label = label;
		this.barSymbolComplete = barSymbolComplete;
		this.barSymbolIntermediate = barSymbolIntermediate.concat(barSymbolComplete);
		this.barSymbolIncomplete = barSymbolIncomplete;
		this.completeTemplate = completeTemplate;
		this.progressBarWidthMax = progressBarWidthMax;
		this.progressBarWidthMin = progressBarWidthMin;
		this.progressTemplate = progressTemplate;
		this.autoComplete = autoComplete;
		this.clearAllOnComplete = clearAllOnComplete;
		this.displayAlways = displayAlways;
		this.hideCursor = hideCursor;
		this.minRenderInterval = minRenderInterval;
		this.title = title;
		this.writer = writer;
		this.ttyColumns = ttySize?.columns ?? 80;

		this.display = this.displayAlways || Deno.isatty(writer.rid);

		// this.#init();
	}

	// #init(options: constructorOptions) {
	// 	this.goal = options.goal;
	// 	this.label = options.label;
	// 	this.barSymbolComplete = options.barSymbolComplete;
	// 	this.barSymbolIntermediate = options.barSymbolIntermediate.concat(options.barSymbolComplete);
	// 	this.barSymbolIncomplete = options.barSymbolIncomplete;
	// 	this.completeTemplate = options.completeTemplate;
	// 	this.progressBarWidthMax = options.progressBarWidthMax;
	// 	this.progressBarWidthMin = options.progressBarWidthMin;
	// 	this.progressTemplate = options.progressTemplate;
	// 	this.autoComplete = options.autoComplete;
	// 	this.clearAllOnComplete = options.clearAllOnComplete;
	// 	this.hideCursor = options.hideCursor;
	// 	this.minRenderInterval = options.minRenderInterval;
	// 	this.title = options.title;
	// 	this.writer = options.writer;
	// 	this.isTTY = Deno.isatty(writer.rid);
	// 	this.ttyColumns = ttySize(writer.rid)?.columns ?? 80;
	// }

	/**
	 * update/render progress
	 *
	 * - `value` - current value
	 * - `options` - optional dynamic parameters (constructed configuration overrides)
	 *   - `label` - progress bar label
	 *   - `goal` - target value for completion
	 *   - `symbolComplete` - completion symbol
	 *   - `symbolIncomplete` - incomplete symbol
	 *   - `symbolIntermediate` - intermediate symbols
	 */
	// ToDO: overload and allow...
	// `update(number, options: updateOptions = {})` => update first progress line (note: two arguments)
	// `update(u: ProgressUpdateObject /* { number, options? } */)` => (alternate form) update first progress line
	// `update(number[])` => update first N progress lines
	// `update(u: ProgressUpdateObject[] /* { number, options? }[] */)` => update first N progress lines
	// update(u: number, options?: unknown): void;
	update(v: number, options: updateOptions = {}): void {
		if (this.isCompleted || !this.display) return;

		if ((isNaN(v)) || (v < 0)) {
			throw new Error(`progress: value must be a number which is greater than or equal to 0`);
		}

		const goal = options.goal ?? this.goal;
		const now = Date.now();
		const msUpdateInterval = now - this.priorUpdateTime;
		if (msUpdateInterval < this.minRenderInterval && v < goal) return;

		this.priorUpdateTime = now;

		const age = now - this.startTime; // (in ms)

		const elapsed = sprintf(
			'%ss', /* in seconds */
			new Intl.NumberFormat(undefined, {
				minimumIntegerDigits: 1,
				minimumFractionDigits: 1,
				maximumFractionDigits: 1,
			})
				.format(age / 1000),
		);

		const eta = sprintf(
			'%ss', /* in seconds */
			new Intl.NumberFormat(undefined, {
				minimumIntegerDigits: 1,
				minimumFractionDigits: 1,
				maximumFractionDigits: 1,
			})
				.format((goal - v) / (v / (age / 1000))),
		);

		const percent = sprintf(
			'%3s%%',
			new Intl.NumberFormat(undefined, {
				minimumIntegerDigits: 1,
				minimumFractionDigits: 0,
				maximumFractionDigits: 0,
			})
				.format((v / goal) * 100),
		);

		const rate = sprintf(
			'%s/s', /* per second */
			new Intl.NumberFormat(undefined, {
				minimumIntegerDigits: 1,
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			})
				.format(v / (age / 1000)),
		);

		// :label :elapsed :eta :goal :percent :rate :value
		const label = options.label ?? this.label;
		const progressTemplate = options.progressTemplate ?? this.progressTemplate;
		let updateText = progressTemplate
			.replace('{elapsed}', elapsed)
			.replace('{eta}', eta)
			.replace('{goal}', goal + '')
			.replace('{percent}', percent)
			.replace('{rate}', rate)
			.replace('{value}', v + '')
			.replace(/{label}(\s?)/, label.length ? (label + '$1') : '');

		// compute the available space (non-zero) for the bar
		let availableSpace = Math.max(0, this.ttyColumns - updateText.replace('{bar}', '').length);
		if (availableSpace && isWinOS) availableSpace -= 1;

		const width = Math.min(this.progressBarWidthMax, availableSpace);
		const finished = v >= goal;

		const preciseBar = options.barSymbolIntermediate ?? this.barSymbolIntermediate;
		const precision = preciseBar.length > 1;

		// :bar
		const completeLength = width * v / goal;
		const roundedCompleteLength = Math.floor(completeLength);

		let precise = '';
		if (precision) {
			const preciseLength = completeLength - roundedCompleteLength;
			precise = finished ? '' : preciseBar[Math.floor(preciseBar.length * preciseLength)];
		}

		const complete = new Array(roundedCompleteLength)
			.fill(options.barSymbolComplete ?? this.barSymbolComplete)
			.join('');
		const incomplete = new Array(Math.max(width - roundedCompleteLength - (precision ? 1 : 0), 0))
			.fill(options.barSymbolIncomplete ?? this.barSymbolIncomplete)
			.join('');

		updateText = updateText.replace('{bar}', complete + precise + incomplete);

		if (updateText !== this.priorUpdateText) {
			this.#write(updateText);
			this.priorUpdateText = updateText;
		}

		if (finished && this.autoComplete) this.complete();
	}

	/**
	 * complete(): finish progress bar
	 * * no need to call unless you want completion to occur before goal is attained
	 */
	complete(): void {
		this.isCompleted = true;
		if (this.completeTemplate == null) { /* do nothing */ }
		else if (this.completeTemplate == '') {
			this.#write();
		} else {
			this.#write(this.completeTemplate);
		}
		// this.#toNextLine();
		this.#showCursor();
	}

	/**
	 * interrupt the progress bar and write a message above it
	 *
	 * @param message The message to write
	 */
	log(message: string | number): void {
		if (this.hideCursor) this.#hideCursor();
		this.#write(`${message}`);
		this.#cursorToNextLine();
		this.#write(this.priorUpdateText);
		// if (!this.hideCursor) this.#showCursor();
	}

	#write(msg?: string): void {
		if (this.hideCursor) this.#hideCursor();
		this.#writeRaw(`\r${msg ?? ''}${ansiCSI.clearEOL}`);
		// if (!this.hideCursor) this.#showCursor();
	}

	#writeRaw(msg: string) {
		writeAllSync(this.writer, this.encoder.encode(msg));
	}

	/** Move cursor to beginning of next line (scrolls screen if needed) */
	#cursorToNextLine() {
		this.#writeRaw('\r\n');
	}

	/** Move cursor to beginning of current line */
	#cursorToLineStart() {
		this.#writeRaw('\r');
	}

	#cursorUp(nRows = 0) {
		this.#writeRaw(`${ansiCSI.cursorUp.replace('{n}', `${nRows}`)}`);
	}

	#hideCursor(): void {
		this.#writeRaw(`${ansiCSI.hideCursor}`);
	}

	#showCursor(): void {
		this.#writeRaw(`${ansiCSI.showCursor}`);
	}
}
