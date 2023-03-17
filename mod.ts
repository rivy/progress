// ref: [progress (`deno`)](https://github.com/deno-library/progress)
// ref: [progressbar (`deno)](https://github.com/jakobhellermann/deno-progressbar) // spell-checker:ignore progressbar
// ref: [mpb (`go`)](https://github.com/vbauerster/mpb)
// ref: [multibar (`go`)](https://github.com/sethgrid/multibar) // spell-checker:ignore multibar
// ref: [](https://www.npmjs.com/package/progress)
// ref: [](https://www.npmjs.com/package/cli-progress)
// ref: [](https://www.npmjs.com/package/gauge)
// ref: [](https://www.npmjs.com/package/multibar)
// ref: [](https://www.npmjs.com/package/cli-infinity-progress)
// ref: [](https://www.npmjs.com/package/multi-progress)
// ref: [](https://www.npmjs.com/package/multi-progress-bars)

// ref: [](https://www.npmjs.com/package/cli-spinners)
// ref: [](https://www.npmjs.com/package/log-update)
// ref: [](https://github.com/sindresorhus/ora)
// ref: [](https://www.npmjs.com/package/awesome-logging)

import { bgGreen, bgWhite, sprintf, writeAllSync } from './deps.ts';

// import { cliSpinners, cliSpinnersFrameLCM } from './deps.ts';
import { stringWidth } from './deps.ts';
// import { GraphemeSplitter as _ } from './deps.ts';

import { consoleSize } from './src/lib/consoleSize.ts';

// ToDO: implement STDIN discarding (see https://www.npmjs.com/package/stdin-discarder; use `Deno.stdin.setRaw()`, ...)
//   ... * note: `Deno.stdin.setRaw(false)` will need Deno version >= v1.31.2 for correct restoration of STDIN input handling (see GH:denoland/deno#17866 with fix GH:denoland/deno#17983)

//===

const isWinOS = Deno.build.os === 'windows';

// spell-checker:ignore (WinOS) CONOUT

// ToDO: [in progress...] for bar arrangement flexibility and dynamic vertical size ... implement ID system; array position as implicit ID if not specified
//   ... save line state to related ID and save display state for redraws
// ToDO: implement spinners
// ToDO: implement widgets and/or ES-6 template compatible format strings

// ToDO: `cursorRest = 'after' | 'start' | 'end' | 'block_start'`, default = after
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

interface renderConfigOptions {
	autoCompleteOnAllComplete?: boolean;
	clearAllOnComplete?: boolean;
	displayAlways?: boolean;
	hideCursor?: boolean;
	minRenderInterval?: number;
	title?: string | string[]; // ToDO: string | string[]
	ttyColumns?: number;
	writer?: Deno.WriterSync & { rid: number };
}

interface updateOptions {
	autoComplete?: boolean;
	barSymbolComplete?: string;
	barSymbolIncomplete?: string;
	barSymbolIntermediate?: string[];
	clearOnComplete?: boolean;
	completeTemplate?: string | null;
	goal?: number;
	isComplete?: boolean;
	label?: string;
	progressBarWidthMax?: number;
	progressBarWidthMin?: number;
	progressTemplate?: string;
}

type ProgressConstructionOptions = renderConfigOptions & /* default */ updateOptions;

// type ProgressUpdateObject = { value: number; options?: updateOptions };

// ToDO: add built-in soft exit reset to show cursor (and, if using keypress() to consume input, dispose() and reset to 'cooked' input mode)
/** Open a file specified by `path`, using `options`.
 * * _`no-throw`_ function (returns `undefined` upon any error)
 * @returns an instance of `Deno.FsFile`
 */
function denoOpenSyncNT(path: string | URL, options?: Deno.OpenOptions) {
	// no-throw `Deno.openSync(..)`
	try {
		return Deno.openSync(path, options);
	} catch {
		return undefined;
	}
}

/** Determine if resource (`rid`) is a TTY (a terminal).
 * * _`no-throw`_ function (returns `false` upon any error)
 * @param rid ~ resource ID
 * @tags no-throw
 */
function isTTY(rid: number) {
	// no-throw `Deno.isatty(..)`
	try {
		return Deno.isatty(rid);
	} catch {
		return false;
	}
}

const consoleOutputFile = isWinOS ? 'CONOUT$' : '/dev/tty';

['unload'].forEach((eventType) =>
	addEventListener(eventType, (_: Event) => {
		// ref: https://unix.stackexchange.com/questions/60641/linux-difference-between-dev-console-dev-tty-and-dev-tty0
		// const consoleFileName = isWinOS ? 'CONOUT$' : '/dev/tty';
		const file = denoOpenSyncNT(consoleOutputFile, { read: true, write: true });
		if (file != null) {
			writeAllSync(file, (new TextEncoder()).encode(ansiCSI.showCursor));
			Deno.close(file.rid);
		}
		// await discardInput();
		// keypress().dispose(); // stop keypress() event loop and iterator
		if (isTTY(Deno.stdin.rid)) Deno.stdin.setRaw(false);
	})
);

type CursorPosition =
	| 'lastLineStart' // @ first character of last block line
	| 'blockStart' // @ first character of first block line
	| 'blockEnd' // @ *first character past* final character of last block line
	| 'afterBlock' // start of line after block
;
// class Progress
export default class Progress {
	renderSettings: Required<renderConfigOptions>;
	defaultUpdateSettings: Required<updateOptions>;

	private display = true;
	private isCompleted = false;
	private startTime = Date.now();
	private priorLines: { id: number | string; text: string | null; completed: boolean }[] = [];
	private priorUpdateTime = 0;
	// private renderFrame = 0; // for spinners
	#cursorPosition: CursorPosition = 'blockStart';

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
		autoComplete = true,
		barSymbolComplete = bgGreen(' '),
		barSymbolIncomplete = bgWhite(' '),
		barSymbolIntermediate = [],
		clearOnComplete = false,
		completeTemplate = null,
		goal = 100,
		isComplete = false,
		label = '',
		progressBarWidthMax = 50, // characters
		progressBarWidthMin = 10, // characters
		progressTemplate = '{label} {percent} {bar} {elapsed} {value}/{goal}',
		autoCompleteOnAllComplete = true,
		clearAllOnComplete = false,
		displayAlways = false,
		hideCursor = false,
		minRenderInterval = 16, // ms
		title = [],
		ttyColumns = ttySize?.columns ?? 80,
		writer = Deno.stderr,
	}: ProgressConstructionOptions = {}) {
		this.defaultUpdateSettings = {
			autoComplete,
			barSymbolComplete,
			barSymbolIntermediate: barSymbolIntermediate.concat(barSymbolComplete),
			barSymbolIncomplete,
			clearOnComplete,
			completeTemplate,
			goal,
			isComplete,
			label,
			progressBarWidthMax,
			progressBarWidthMin,
			progressTemplate,
		};
		if (!Array.isArray(title)) title = [title];
		this.renderSettings = {
			autoCompleteOnAllComplete,
			clearAllOnComplete,
			displayAlways,
			hideCursor,
			ttyColumns,
			minRenderInterval,
			title,
			writer,
		};

		this.display = this.renderSettings.displayAlways || Deno.isatty(writer.rid);

		for (let i = 0; i < title.length; i++) this.log(title[i]);

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

	// ToDO: add ability for elements of update array to be null/undefined as NOOP for the corresponding Progress display line
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
	update(_value_: number, _options_?: (updateOptions & { id?: string })): void;
	update(_updates_: (number | [number, (updateOptions & { id?: string })?] | null)[]): void;
	update(
		updates_: number | (number | [number, (updateOptions & { id?: string })?] | null)[],
		options_?: (updateOptions & { id?: string }),
	): void {
		let updates: ([number, (updateOptions & { id?: string })?] | null)[];
		if (!Array.isArray(updates_)) {
			updates = [[updates_, options_]];
		} else {
			updates = updates_.map((e) => (e != null) ? (Array.isArray(e) ? e : [e, {}]) : null);
		}
		// console.warn({ values });
		if (this.isCompleted || !this.display) return;

		const now = Date.now();
		const msUpdateInterval = now - this.priorUpdateTime;
		if (msUpdateInterval < this.renderSettings.minRenderInterval) return;

		const nextLines: typeof this.priorLines = [];

		let allComplete = true;
		for (let idx = 0; idx < updates.length; idx++) {
			if (updates[idx] != null) {
				const value = updates[idx]![0];
				const options = updates[idx]![1] ?? {};
				const id = options.id ?? idx;
				const { updateText, completed } = this.priorLines[idx]?.completed
					? { updateText: this.priorLines[idx].text, completed: this.priorLines[idx].completed }
					: this.#renderLine(value, options);
				nextLines[idx] = { id, text: updateText, completed };
				allComplete &&= completed;
			} else allComplete &&= true;
		}

		{ // update display // ToDO: revise as method
			this.#cursorToBlockStart();
			for (let idx = 0; idx < updates.length; idx++) {
				if (nextLines[idx] !== this.priorLines[idx]) {
					const text = nextLines[idx].text;
					if (text != null) {
						const clearOnComplete = (updates[idx] != null)
							? ((updates[idx]![1] ?? {}).clearOnComplete ??
								this.defaultUpdateSettings.clearOnComplete)
							: this.defaultUpdateSettings.clearOnComplete;
						const clear = clearOnComplete && nextLines[idx].completed;
						this.#writeLine(clear ? '' : text);
					}
					this.priorLines[idx] = nextLines[idx];
				}
				const lastLineToRender = (idx == (updates.length - 1));
				if (!lastLineToRender) this.#cursorToNextLine();
			}
			this.#cursorPosition = 'blockEnd';
		}

		if (allComplete && this.renderSettings.autoCompleteOnAllComplete) this.complete();
	}

	#renderLine(v: number, options: updateOptions) {
		// if ((isNaN(v)) || (v < 0)) {
		// 	throw new Error(`progress: value must be a number which is greater than or equal to 0`);
		// }

		const now = Date.now();
		const age = now - this.startTime; // (in ms)

		const goal = options.goal ?? this.defaultUpdateSettings.goal;

		if ((isNaN(v)) || (v < 0)) v = 0;
		if (v > goal) v = goal;

		const completed = v >= goal;

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
		const template =
			(completed
				? (options.completeTemplate ?? this.defaultUpdateSettings.completeTemplate)
				: undefined) ?? options.progressTemplate ?? this.defaultUpdateSettings.progressTemplate;
		let updateText = null;
		if (template != null) {
			updateText = template
				.replaceAll('{elapsed}', elapsed)
				.replaceAll('{eta}', eta)
				.replaceAll('{goal}', goal + '')
				.replaceAll('{percent}', percent)
				.replaceAll('{rate}', rate)
				.replaceAll('{value}', v + '')
				.replaceAll(/(\s?){label}(\s?)/g, label.length ? ('$1' + label + '$2') : '');

			// compute the available space (non-negative) for a bar
			// * note: b/c of the flexible size, only one `{bar}` is supported and only the first is replaced
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
				precise = completed ? '' : preciseBar[Math.floor(preciseBar.length * preciseLength)];
			}

			const complete = new Array(roundedCompleteLength)
				.fill(options.barSymbolComplete ?? this.defaultUpdateSettings.barSymbolComplete)
				.join('');
			const incomplete = new Array(Math.max(width - roundedCompleteLength - (precision ? 1 : 0), 0))
				.fill(options.barSymbolIncomplete ?? this.defaultUpdateSettings.barSymbolIncomplete)
				.join('');

			updateText = updateText.replace('{bar}', complete + precise + incomplete);
		}

		return { updateText, completed };
	}

	/**
	 * complete(): finish progress bar
	 * * no need to call unless you want completion to occur before goal is attained
	 */
	complete(): void {
		this.isCompleted = true;
		if (this.renderSettings.clearAllOnComplete) {
			for (let i = 0; i < this.priorLines.length; i++) {
				this.#cursorToLineStart();
				this.#writeLine();
				this.#cursorUp();
			}
			this.#cursorToNextLine();
		}
		this.#showCursor();
	}

	/**
	 * interrupt the progress bar and write a message above it
	 *
	 * @param message The message to write
	 */
	log(message: string | number): void {
		if (this.renderSettings.hideCursor) this.#hideCursor();
		this.#cursorToBlockStart();
		{
			// minimize text overwrite flashes
			this.#cursorToNextLine(this.priorLines.length);
			this.#cursorUp(this.priorLines.length);
		}
		this.#writeLine(`${message}`);
		this.#cursorToNextLine();
		for (let i = 0; i < this.priorLines.length; i++) {
			const line = this.priorLines[i];
			this.#writeLine(line.text ?? '');
			const lastLineToRender = (i == (this.priorLines.length - 1));
			if (!lastLineToRender) this.#cursorToNextLine();
			this.#cursorPosition = 'blockEnd';
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

	/** Move cursor to beginning of current line */
	#cursorToBlockStart() {
		if (this.#cursorPosition == 'blockStart') return;
		this.#cursorToLineStart();
		if (this.priorLines.length > 0) this.#cursorUp(this.priorLines.length - 1);
	}

	/** Move cursor to beginning of current line */
	#cursorToLineStart() {
		this.#writeRaw('\r');
	}

	/** Move cursor to beginning of next line (scrolls screen if needed) */
	#cursorToNextLine(nLines = 1) {
		for (let i = 0; i < nLines; i++) {
			this.#writeRaw('\r\n');
		}
	}

	#cursorUp(nLines = 1) {
		if (nLines > 0) {
			this.#writeRaw(`${ansiCSI.cursorUp.replace('{n}', `${nLines}`)}`);
		}
	}

	#hideCursor(): void {
		this.#writeRaw(`${ansiCSI.hideCursor}`);
	}

	#showCursor(): void {
		this.#writeRaw(`${ansiCSI.showCursor}`);
	}
}
