import { bgGreen, bgWhite, sprintf, writeAllSync } from './deps.ts';

// import { cliSpinners as _ } from './deps.ts';
import { stringWidth } from './deps.ts';
// import { GraphemeSplitter as _ } from './deps.ts';

import { consoleSize } from './src/lib/consoleSize.ts';
export { MultiProgressBar } from './multi.ts';

// ToDO: implement STDIN discarding (see https://www.npmjs.com/package/stdin-discarder; use `Deno.stdin.setRaw()`, ...)
//   ... * note: `Deno.stdin.setRaw(false)` will need Deno version >= v1.31.2 for correct restoration of STDIN input handling (see GH:denoland/deno#17866 with fix GH:denoland/deno#17983)

//===

const isWinOS = Deno.build.os === 'windows';

// spell-checker:ignore (WinOS) CONOUT

// ToDO: `cursorRest = [start, end, after, title_start?, title_end?, title_after?]`, default = after
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
// ToDO: add `pause(clearOnPause: boolean = true)` which could be used for the controller to cleanly print to STDERR/OUT and then `resume()`

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

// interface constructorOptions {
// 	// *default* progress line update options
// 	goal?: number;
// 	label?: string;
// 	barSymbolComplete?: string;
// 	barSymbolIncomplete?: string;
// 	barSymbolIntermediate?: string[];
// 	clearOnComplete?: string;
// 	completeTemplate?: string;
// 	progressBarWidthMax?: number;
// 	progressBarWidthMin?: number;
// 	progressTemplate?: string;
// 	autoComplete?: boolean;
// 	// render configuration settings
// 	clearAllOnComplete?: boolean;
// 	displayAlways?: boolean;
// 	hideCursor?: boolean;
// 	maxWidth?: number;
// 	minRenderInterval?: number;
// 	title?: string; // ToDO: string | string[]
// 	writer?: Deno.WriterSync & { rid: number };
// }

interface renderConfigOptions {
	clearAllOnComplete?: boolean;
	displayAlways?: boolean;
	hideCursor?: boolean;
	ttyColumns?: number;
	minRenderInterval?: number;
	title?: string | string[]; // ToDO: string | string[]
	writer?: Deno.WriterSync & { rid: number };
}

interface updateOptions {
	goal?: number;
	label?: string;
	barSymbolComplete?: string;
	barSymbolIncomplete?: string;
	barSymbolIntermediate?: string[];
	clearOnComplete?: boolean;
	completeTemplate?: string | null;
	progressBarWidthMax?: number;
	progressBarWidthMin?: number;
	progressTemplate?: string;
	autoComplete?: boolean;
}

type ProgressConstructionOptions = updateOptions & renderConfigOptions;

// type ProgressUpdateObject = { value: number; options?: updateOptions };

// class Progress
export default class Progress {
	renderSettings: Required<renderConfigOptions>;
	defaultUpdateSettings: Required<updateOptions>;

	private display = true;
	private isCompleted = false;
	private startTime = Date.now();
	private priorUpdates: (string | null)[] = [];
	private priorUpdateTime = 0;
	// private renderFrame = 0; // for spinners

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
	 * @param progressTemplate  progress display line content, default: '{label} {percent} {bar} {elapsed} {value}/{goal}'
	 * @param autoComplete  automatically `complete()` when goal is reached, default: true
	 * @param clearAllOnComplete  clear the entire progress display upon completion, default: false
	 * @param displayAlways  avoid TTY check on writer and always display progress, default: false
	 * @param hideCursor  hide cursor until progress line display is complete, default: false
	 * @param title  progress title line (static), default: undefined
	 * @param minRenderInterval  minimum time between updates in milliseconds, default: 16 ms
	 */
	constructor({
		goal = 100,
		label = '',
		barSymbolComplete = bgGreen(' '),
		barSymbolIncomplete = bgWhite(' '),
		barSymbolIntermediate = [],
		clearOnComplete = false,
		completeTemplate = null,
		progressBarWidthMax = 50, // characters
		progressBarWidthMin = 10, // characters
		progressTemplate = '{label} {percent} {bar} {elapsed} {value}/{goal}',
		autoComplete = true,
		clearAllOnComplete = true,
		displayAlways = false,
		hideCursor = false,
		minRenderInterval = 16, // ms
		title = [],
		ttyColumns = ttySize?.columns ?? 80,
		writer = Deno.stderr,
	}: ProgressConstructionOptions = {}) {
		this.defaultUpdateSettings = {
			goal,
			label,
			barSymbolComplete,
			barSymbolIntermediate: barSymbolIntermediate.concat(barSymbolComplete),
			barSymbolIncomplete,
			clearOnComplete,
			completeTemplate,
			progressBarWidthMax,
			progressBarWidthMin,
			progressTemplate,
			autoComplete,
		};
		this.renderSettings = {
			clearAllOnComplete,
			displayAlways,
			hideCursor,
			ttyColumns,
			minRenderInterval,
			title,
			writer,
		};

		this.display = this.renderSettings.displayAlways || Deno.isatty(writer.rid);

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
	// update([number, updateOptions][]): void;
	// update(v: number, options: updateOptions = {}): void {
	update(_value_: number, _options_?: updateOptions): void;
	update(_updates_: (number | [number, updateOptions?])[]): void;
	update(updates_: number | (number | [number, updateOptions?])[], options_?: updateOptions): void {
		let updates: [number, updateOptions?][];
		if (!Array.isArray(updates_)) {
			updates = [[updates_, options_]];
		} else {
			updates = updates_.map((e) => Array.isArray(e) ? e : [e, {}]);
		}
		// console.warn({ values });
		if (this.isCompleted || !this.display) return;

		const now = Date.now();
		const msUpdateInterval = now - this.priorUpdateTime;
		if (msUpdateInterval < this.renderSettings.minRenderInterval) return;

		// const priorBlockHeight = this.priorUpdates.length;
		// const updates_n = updates.length;
		this.#cursorToBlockTopLeft();
		const n = 0;

		const value = updates[n][0];
		const options = updates[n][1] ?? {};

		const { updateText, finished } = this.#renderLine(value, options);

		if (updateText !== this.priorUpdates[n]) {
			if (updateText != null) this.#writeLine(updateText);
			this.priorUpdates[n] = updateText;
		}

		if (finished && this.defaultUpdateSettings.autoComplete) this.complete();
	}

	#renderLine(v: number, options: updateOptions) {
		if ((isNaN(v)) || (v < 0)) {
			throw new Error(`progress: value must be a number which is greater than or equal to 0`);
		}

		const now = Date.now();
		const age = now - this.startTime; // (in ms)

		const goal = options.goal ?? this.defaultUpdateSettings.goal;
		const finished = v >= goal;

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

		// {elapsed} {eta} {goal} {percent} {rate} {value} {label} {bar}
		const label = options.label ?? this.defaultUpdateSettings.label;
		const template = finished
			? (options.completeTemplate ?? this.defaultUpdateSettings.completeTemplate)
			: (options.progressTemplate ?? this.defaultUpdateSettings.progressTemplate);
		let updateText = null;
		if (template != null) {
			updateText = template
				.replace('{elapsed}', elapsed)
				.replace('{eta}', eta)
				.replace('{goal}', goal + '')
				.replace('{percent}', percent)
				.replace('{rate}', rate)
				.replace('{value}', v + '')
				.replace(/(\s?){label}(\s?)/, label.length ? ('$1' + label + '$2') : '');

			// compute the available space (non-negative) for the bar
			// * `stringWidth()` instead of `.length` to correctly count visual character column width of string, ignoring ANSI escapes
			// ...eg, `\u{ff0a}` == "full-width asterisk" is otherwise incorrectly counted as a single character column wide
			// ...eg, `0x1b[m*` == ANSI reset + '*' is otherwise incorrectly counted as a four character columns wide
			let availableSpace = Math.max(
				0,
				this.renderSettings.ttyColumns - stringWidth(updateText.replace('{bar}', '')),
			);
			if ((availableSpace > 0) && isWinOS) availableSpace -= 1;

			const width = Math.min(this.defaultUpdateSettings.progressBarWidthMax, availableSpace);

			const preciseBar = options.barSymbolIntermediate ??
				this.defaultUpdateSettings.barSymbolIntermediate;
			const precision = preciseBar.length > 1;

			// ToDO: deal correctly with unicode character variable widths
			// :bar
			const completeLength = width * v / goal;
			const roundedCompleteLength = Math.floor(completeLength);

			let precise = '';
			if (precision) {
				const preciseLength = completeLength - roundedCompleteLength;
				precise = finished ? '' : preciseBar[Math.floor(preciseBar.length * preciseLength)];
			}

			const complete = new Array(roundedCompleteLength)
				.fill(options.barSymbolComplete ?? this.defaultUpdateSettings.barSymbolComplete)
				.join('');
			const incomplete = new Array(Math.max(width - roundedCompleteLength - (precision ? 1 : 0), 0))
				.fill(options.barSymbolIncomplete ?? this.defaultUpdateSettings.barSymbolIncomplete)
				.join('');

			updateText = updateText.replace('{bar}', complete + precise + incomplete);
		}

		return { updateText, finished };
	}

	/**
	 * complete(): finish progress bar
	 * * no need to call unless you want completion to occur before goal is attained
	 */
	complete(): void {
		this.isCompleted = true;
		if (this.defaultUpdateSettings.completeTemplate == null) { /* do nothing */ }
		else if (this.defaultUpdateSettings.completeTemplate == '') {
			this.#writeLine();
		} else {
			this.#writeLine(this.defaultUpdateSettings.completeTemplate);
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
		if (this.renderSettings.hideCursor) this.#hideCursor();
		this.#writeLine(`${message}`);
		this.#cursorToNextLine();
		for (const line of this.priorUpdates) {
			this.#writeLine(line ?? '');
		}
		// if (!this.hideCursor) this.#showCursor();
	}

	#writeLine(msg?: string): void {
		if (this.renderSettings.hideCursor) this.#hideCursor();
		this.#cursorToLineStart();
		this.#writeRaw(`${msg ?? ''}${ansiCSI.clearEOL}`);
		// if (!this.hideCursor) this.#showCursor();
	}

	#writeRaw(msg: string) {
		writeAllSync(this.renderSettings.writer, this.encoder.encode(msg));
	}

	/** Move cursor to beginning of next line (scrolls screen if needed) */
	#cursorToNextLine() {
		this.#writeRaw('\r\n');
	}

	/** Move cursor to beginning of current line */
	#cursorToLineStart() {
		this.#writeRaw('\r');
	}

	/** Move cursor to beginning of current line */
	#cursorToBlockTopLeft() {
		this.#cursorToLineStart();
		this.#cursorUp(this.priorUpdates.length - 1);
	}

	#cursorUp(nRows = 1) {
		if (nRows > 0) {
			this.#writeRaw(`${ansiCSI.cursorUp.replace('{n}', `${nRows}`)}`);
		}
	}

	#hideCursor(): void {
		this.#writeRaw(`${ansiCSI.hideCursor}`);
	}

	#showCursor(): void {
		this.#writeRaw(`${ansiCSI.showCursor}`);
	}
}
