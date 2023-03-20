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

// FixME: investigate relationship between update interval calls and minRenderInterval ; some updates can result in `completed` with a value slightly less than `goal`
//    ... *early-complete-bug-example.ts* can show this

//===

const isWinOS = Deno.build.os === 'windows';

const LF = '\n';

// spell-checker:ignore (WinOS) CONOUT

// ToDO: [in progress...] for bar arrangement flexibility and dynamic vertical size ... implement ID system; array position as implicit ID if not specified
//   ... save line state to related ID and save display state for redraws
// ToDO: implement spinners
// ToDO: implement widgets and/or ES-6 template compatible format strings

// ToDO: handle title and log messages containing multiple lines
// ToDO: only use first line of any label (discarding any CR/LF and beyond of label string)
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

export interface RenderConfigOptions {
	autoCompleteOnAllComplete?: boolean;
	clearAllOnComplete?: boolean;
	displayAlways?: boolean;
	dynamicCompleteHeight?: boolean;
	dynamicUpdateHeight?: boolean;
	hideCursor?: boolean;
	minRenderInterval?: number;
	title?: string | string[]; // ToDO: string | string[]
	ttyColumns?: number;
	writer?: Deno.WriterSync & { rid: number };
}

export interface UpdateOptions {
	autoComplete?: boolean;
	barSymbolComplete?: string;
	barSymbolIncomplete?: string;
	barSymbolIntermediate?: string[];
	barSymbolLeader?: string;
	clearOnComplete?: boolean;
	completeTemplate?: string | null;
	goal?: number;
	isComplete?: boolean;
	label?: string;
	progressBarWidthMax?: number;
	progressBarWidthMin?: number;
	progressTemplate?: string;
}

type ProgressConstructionOptions = RenderConfigOptions & /* default */ UpdateOptions;

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

const EOLReS = '\r?\n|\r';
const EOLRx = new RegExp(`${EOLReS}`, 'ms');
const terminalEOLRx = new RegExp(`(${EOLReS})$`, 'ms');
function splitIntoLines(s: string) {
	// all returned "lines" are non-empty or were terminated with a trailing EOL
	// * remove any terminal EOL to avoid a last phantom line
	return s.replace(terminalEOLRx, '').split(EOLRx);
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
	renderSettings: Required<RenderConfigOptions>;
	defaultUpdateSettings: Required<UpdateOptions>;

	private display = true;
	private isCompleted = false;
	private startTime = Date.now();
	private priorLines: {
		id: number | string;
		text: string | null;
		completed: boolean;
		options: Required<UpdateOptions>;
	}[] = [];
	private priorRenderTime = 0;
	// private renderFrame = 0; // for spinners
	private titleLines: string[];
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
	 * @param barSymbolLeader  bar leader symbol, default: ''
	 * @param completeTemplate  progress display line content for completion, default: undefined
	 * @param progressBarWidthMax  the maximum displayed width of the progress bar, default: 50 characters
	 * @param progressBarWidthMin  the minimum displayed width of the progress bar, default: 10 characters
	 * @param progressTemplate  progress display line content, default: '{label} {percent} {bar} {elapsed} {value}/{goal}'
	 * @param autoComplete  automatically `complete()` when goal is reached, default: true
	 * @param clearAllOnComplete  clear the entire progress display upon completion, default: false
	 * @param displayAlways  avoid TTY check on writer and always display progress, default: false
	 * @param hideCursor  hide cursor until progress line display is complete, default: false
	 * @param title  progress title line (static), default: undefined
	 * @param minRenderInterval  minimum time between updates in milliseconds, default: 20 ms
	 */
	constructor({
		autoComplete = true,
		barSymbolComplete = bgGreen(' '),
		barSymbolIncomplete = bgWhite(' '),
		barSymbolIntermediate = [],
		barSymbolLeader = '',
		clearOnComplete = false,
		completeTemplate = null,
		goal = 100,
		isComplete = false,
		label = '',
		progressBarWidthMax = 50, // characters
		progressBarWidthMin = 10, // characters
		progressTemplate = '{label} {percent} {bar} ({elapsed}) {value}/{goal}',
		autoCompleteOnAllComplete = true,
		clearAllOnComplete = false,
		displayAlways = false,
		dynamicCompleteHeight = false,
		dynamicUpdateHeight = false,
		hideCursor = false,
		minRenderInterval = 20, // ms
		title = [],
		ttyColumns = ttySize?.columns ?? 80,
		writer = Deno.stderr,
	}: ProgressConstructionOptions = {}) {
		this.defaultUpdateSettings = {
			autoComplete,
			barSymbolComplete,
			barSymbolIntermediate, /* : barSymbolIntermediate.concat(barSymbolComplete) */
			barSymbolIncomplete,
			barSymbolLeader,
			clearOnComplete,
			completeTemplate,
			goal,
			isComplete,
			label,
			progressBarWidthMax,
			progressBarWidthMin,
			progressTemplate,
		};
		this.renderSettings = {
			autoCompleteOnAllComplete,
			clearAllOnComplete,
			displayAlways,
			dynamicCompleteHeight,
			dynamicUpdateHeight,
			hideCursor,
			ttyColumns,
			minRenderInterval,
			title,
			writer,
		};

		this.display = this.renderSettings.displayAlways || Deno.isatty(writer.rid);

		this.titleLines = (Array.isArray(title) ? title : [title]).filter((s) => s != null);
		// * split all supplied text into lines
		this.titleLines = (this.titleLines.length <= 0) ? [] : splitIntoLines(this.titleLines.join(LF));

		for (let i = 0; i < this.titleLines.length; i++) {
			this.#writeLine(this.titleLines[i]);
			this.#cursorToNextLine();
		}

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
	update(
		_value_: number,
		_options_?: (UpdateOptions & { id?: string }) & { forceRender?: boolean },
		_render_?: { forceRender: boolean },
	): void;
	update(
		_updates_: (number | [number, (UpdateOptions & { id?: string })?] | null)[],
		_options_: { forceRender?: boolean },
	): void;
	update(
		updates_: number | (number | [number, (UpdateOptions & { id?: string })?] | null)[],
		options_?: ((UpdateOptions & { id?: string }) & { forceRender?: boolean }),
		render_?: { forceRender?: boolean },
	): void {
		type PriorLine = typeof this.priorLines[number];

		if (this.isCompleted || !this.display) return;
		const forceRender = render_?.forceRender ?? options_?.forceRender ?? false;

		const now = Date.now();
		const msUpdateInterval = now - this.priorRenderTime;
		if (!forceRender && (msUpdateInterval < this.renderSettings.minRenderInterval)) return;

		this.priorRenderTime = now;

		let updates: ([number, (Required<UpdateOptions> & { id?: string })] | null)[];
		const defaultOptions = this.defaultUpdateSettings;
		if (!Array.isArray(updates_)) {
			updates = [[updates_, { ...defaultOptions, ...(this.priorLines[0]?.options), ...options_ }]];
		} else {
			updates = updates_.map((e, idx) =>
				(e != null)
					? (Array.isArray(e)
						? [e[0], { ...defaultOptions, ...(this.priorLines[idx]?.options), ...e[1] }]
						: [e, { ...defaultOptions, ...(this.priorLines[0]?.options) }])
					: null
			);
		}
		// console.warn({ updates });

		const updatedLines: (PriorLine | null)[] = [];

		const linesForUpdate = Math.max(updates.length, this.priorLines.length);
		for (let idx = 0; idx < linesForUpdate; idx++) {
			if (updates[idx] == null) {
				updatedLines[idx] = null;
			} else {
				const value = updates[idx]![0];
				// const options = { ...(this.priorLines[idx]?.options), ...updates[idx]![1] };
				const options = updates[idx]![1];
				const id = options.id ?? idx;
				const { updateText, completed } = this.priorLines[idx]?.completed
					? { updateText: this.priorLines[idx].text, completed: this.priorLines[idx].completed }
					: this.#renderLine(value, options);
				const clear = options.clearOnComplete && completed;
				// console.warn({ updateText, clear });
				updatedLines[idx] = { id, text: clear ? null : updateText, completed, options };
			}
		}
		// console.warn({ updatedLines });

		{ // update display // ToDO: revise as method
			const nextLines: typeof this.priorLines = [];
			const dynamicHeight = this.renderSettings.dynamicUpdateHeight;
			const priorDisplayHeight = this.priorLines.length;
			// * calculate next display frame
			let displayLineIndex = 0;
			for (let idx = 0; idx < updatedLines.length; idx++) {
				const line = updatedLines[idx] ?? this.priorLines[idx];
				if (!dynamicHeight || (line.text != null)) {
					nextLines[displayLineIndex++] = line;
				}
			}
			// * show new display frame
			this.#cursorToBlockStart();
			const lastLineToRender = nextLines.length - 1;
			for (let idx = 0; idx < nextLines.length; idx++) {
				this.#writeLine(nextLines[idx]?.text ?? '');
				if (idx != lastLineToRender) this.#cursorToNextLine();
			}
			const linesToClear = ((priorDisplayHeight - nextLines.length) > 0)
				? (priorDisplayHeight - nextLines.length)
				: 0;
			for (let i = 0; i < linesToClear; i++) {
				this.#cursorToNextLine();
				this.#writeLine('');
			}
			this.#cursorUp(linesToClear);
			this.#cursorToNextLine(this.titleLines.length - 1);
			this.priorLines = nextLines;
			this.#cursorPosition = 'blockEnd';
		}

		// if (allUpdatedAreComplete && this.renderSettings.autoCompleteOnAllComplete) this.complete();
		const allComplete = this.priorLines.reduce(
			(allCompleteSoFar, line) => allCompleteSoFar && line.completed,
			true,
		);
		if (allComplete && this.renderSettings.autoCompleteOnAllComplete) this.complete();
	}

	#renderLine(v: number, options: Required<UpdateOptions>) {
		// if ((isNaN(v)) || (v < 0)) {
		// 	throw new Error(`progress: value must be a number which is greater than or equal to 0`);
		// }
		// console.warn({ options });

		const now = Date.now();
		const age = now - this.startTime; // (in ms)

		const goal = options.goal;

		if ((isNaN(v)) || (v < 0)) v = 0;
		if (v > goal) v = goal;

		const completed = options.autoComplete && (v >= goal);

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
		const label = options.label;
		const template = (completed ? options.completeTemplate : undefined) ?? options.progressTemplate;
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

			// compute the available space (non-negative) for a bar gauge
			// * note: b/c of the flexible size, only one `{bar}` is supported and only the first is replaced
			// * `stringWidth()` instead of `.length` to correctly count visual character column width of string, ignoring ANSI escapes
			// ...eg, `\u{ff0a}` == "full-width asterisk" is otherwise incorrectly counted as a single character column wide
			// ...eg, `0x1b[m*` == ANSI reset + '*' is otherwise incorrectly counted as a four character columns wide
			let availableSpace = Math.max(
				0,
				this.renderSettings.ttyColumns - stringWidth(updateText.replace('{bar}', '')),
			);
			if ((availableSpace > 0) && isWinOS) availableSpace -= 1;

			const width = Math.min(options.progressBarWidthMax, availableSpace);

			const partialSubGauge = options.barSymbolIntermediate;
			const isPrecise = partialSubGauge.length > 1;

			// ToDO: deal correctly with unicode character variable widths
			// :bar
			const completeWidth = width * v / goal;
			const wholeCompleteWidth = Math.floor(completeWidth);

			let intermediary = '';
			if (isPrecise) {
				const partialLength = completeWidth - wholeCompleteWidth;
				intermediary = completed
					? ''
					: partialSubGauge[Math.floor(partialSubGauge.length * partialLength)];
			}
			const leader = completed ? '' : options.barSymbolLeader;

			const incompleteWidth = width - wholeCompleteWidth - stringWidth(intermediary) -
				stringWidth(leader);

			// console.warn({ width, completeWidth, wholeCompleteWidth, incompleteWidth });

			// ToDO: enforce symbols as single graphemes (ignoring ANSI escapes)
			const complete = new Array(wholeCompleteWidth).fill(options.barSymbolComplete).join('');
			const incomplete = new Array(Math.max(incompleteWidth, 0))
				.fill(options.barSymbolIncomplete)
				.join('');
			// const leader = hasLeader ? [...]
			// console.warn({ complete, intermediary, leader, incomplete });

			updateText = updateText.replace('{bar}', complete + intermediary + leader + incomplete);
		}

		return { updateText, completed };
	}

	/**
	 * complete(): finish progress bar
	 * * no need to call unless you want completion to occur before goal is attained
	 */
	complete(): void {
		if (this.isCompleted) return;
		this.isCompleted = true;
		const dynamicHeight = this.renderSettings.dynamicCompleteHeight;
		// console.warn({ priorLines: this.priorLines });
		const finalLines: (typeof this.priorLines) = [];
		if (this.renderSettings.clearAllOnComplete) {
			// console.warn('clearing...');
			for (let i = this.priorLines.length; i > 0; i--) {
				this.#cursorToLineStart();
				this.#writeLine();
				this.#cursorUp();
			}
			this.priorLines = finalLines;
			this.#cursorToNextLine();
		} else if (dynamicHeight) {
			let linesToClear = 0;
			let finalLinesIndex = 0;
			for (let i = 0; i < this.priorLines.length; i++) {
				const text = this.priorLines[i]?.text ?? '';
				if (text.length <= 0) linesToClear += 1;
				else finalLines[finalLinesIndex++] = this.priorLines[i];
			}
			// console.warn({ priorLines: this.priorLines, linesToClear, finalLines });
			for (let i = 0; i < linesToClear; i++) {
				this.#cursorToLineStart();
				this.#writeLine();
				this.#cursorUp();
			}
			this.priorLines = finalLines;
			// console.warn({ priorLines: this.priorLines, linesToClear, finalLines });
			this.#cursorToBlockStart();
			const lastLineToRender = this.priorLines.length - 1;
			for (let i = 0; i < this.priorLines.length; i++) {
				const text = this.priorLines[i].text ?? '';
				if (text.length > 0) {
					this.#writeLine(text);
					if (i < lastLineToRender) this.#cursorToNextLine();
				}
			}
		}
		// this.#writeLine();
		// this.#cursorUp();
		this.#showCursor();
	}

	/**
	 * interrupt the progress bar and write a message above it
	 *
	 * @param message The message to write
	 */
	log(message: string): void {
		// if (this.isCompleted) return;
		if (this.renderSettings.hideCursor) this.#hideCursor();
		this.#cursorToBlockStart();
		this.#cursorUp(this.titleLines.length);
		{
			// minimize text overwrite/rewrite flashes
			this.#cursorToNextLine(this.priorLines.length + this.titleLines.length);
			this.#cursorUp(this.priorLines.length + this.titleLines.length);
		}

		// * split message into lines and write to display
		const msgs = splitIntoLines(message);
		msgs.forEach((msg) => {
			this.#writeLine(`${msg}`);
			this.#cursorToNextLine();
		});

		for (let i = 0; i < this.titleLines.length; i++) {
			this.#writeLine(this.titleLines[i]);
			this.#cursorToNextLine();
		}
		for (let i = 0; i < this.priorLines.length; i++) {
			const line = this.priorLines[i];
			this.#writeLine(line?.text ?? '');
			const lastLineToRender = (i == (this.priorLines.length - 1));
			if (!lastLineToRender) this.#cursorToNextLine();
			this.#cursorPosition = 'blockEnd';
		}
		if (this.isCompleted) this.#showCursor();
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
		// if (this.titleLines.length > 0) this.#cursorUp(this.titleLines.length - 1);
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
