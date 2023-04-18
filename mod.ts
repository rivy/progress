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

// spell-checker:ignore (shell/win) netsh wlan

// DONE/ToDO: *review* <https://www.npmjs.com/package/progress> for custom tokens (see <https://github.com/visionmedia/node-progress/blob/master/lib/node-progress.js>)
// ToDO: [2023-03; rivy] *review* use of container in <https://www.npmjs.com/package/bespoke-progress>
// ToDO: [2023-03; rivy] *review* <https://www.npmjs.com/package/cli-progress> for API
// ToDO: [2023-03; rivy] *review* <https://www.npmjs.com/package/multi-progress-bars> for spinners
// ToDO: [2023-03; rivy] add `isComplete()`, pause()/resume(), methods

// import { stripColor } from 'https://deno.land/std@0.126.0/fmt/colors.ts';
import { bgGreen, bgWhite, sprintf, writeAllSync } from './deps.ts';

// import { cliSpinners, cliSpinnersFrameLCM } from './deps.ts';
import { cliTruncate, stringWidth } from './deps.ts';
// import { GraphemeSplitter as _ } from './deps.ts';

import { consoleSize } from './src/lib/consoleSize.ts';

// ToDO: [2023-03; rivy] add partial line functionality for single line progress displays, moving only back and forth along the current line
//  #... * allows for in-line spinners or a simple progress percentage meter

// ToDO: [2023-03; rivy] implement STDIN discarding (see https://www.npmjs.com/package/stdin-discarder; use `Deno.stdin.setRaw()`, ...)
//  #... * note: `Deno.stdin.setRaw(false)` will need Deno version >= v1.31.2 for correct restoration of STDIN input handling (see GH:denoland/deno#17866 with fix GH:denoland/deno#17983)
//  #... just using an input loop can discard all but CTRL-BREAK which would require a signal hook (example `wifi-winos-netsh-wlan-show-interfaces.ts` contains an implementation)

// FixME: [2023-03; rivy] investigate relationship between update interval calls and minUpdateInterval ; some updates can result in `completed` with a value slightly less than `goal`
//    ... *early-complete-bug-example.ts* can show this

//===

const isWinOS = Deno.build.os === 'windows';

/** A regular expression pattern, in string form, meant to be fed to `RegExp(...)`.
-   *branded* to mimic a nominal type (and for better Intellisense handling).
*/
type RegExpPattern = string & { '#brand': 'RegExpPattern' };

const LF = '\n';

// spell-checker:ignore (WinOS) CONOUT

// ToDO: [2023-03; rivy; in progress...] for bar arrangement flexibility and dynamic vertical size ... implement ID system; array position as implicit ID if not specified
//  #... save line state to related ID and save display state for redraws
// ToDO: [2023-03; rivy] implement spinners
// ToDO: [2023-03; rivy] implement widgets and/or ES-6 template compatible format strings

// DONE: [2023-03; rivy] handle title and log messages containing multiple lines
// ToDO: [2023-03; rivy] only use first line of any label (discarding any CR/LF and beyond of label string)
// ToDO: [2023-03; rivy] `cursorRest = 'after' | 'start' | 'end' | 'block_start'`, default = after
// ToDO: [2023-03; rivy] maybe, ES6-template compatible format strings
//  #... or, instead implement custom token replacements; seems simpler and equivalent in functionality (DONE as of [2023-03-22; rivy])
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
// ToDO: [2023-03; rivy] add ability/option to write directly to console via '$CONOUT' or '/dev/tty' avoiding writes to STDOUT or STDERR
// ToDO: [2023-03; rivy] add `pause(clearOnPause: boolean = true)` which could be used for the controller to cleanly print to STDERR/OUT and then `resume()`

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

export interface ProgressBarOptions {
	symComplete?: string;
	symIncomplete?: string;
	symIntermediates?: string[];
	symLeader?: string;
	widthMax?: number;
	widthMin?: number;
}

export interface RenderConfigOptions {
	autoCompleteOnAllComplete?: boolean;
	clearAllOnComplete?: boolean;
	displayAlways?: boolean;
	dynamicCompleteHeight?: boolean;
	dynamicUpdateHeight?: boolean;
	hideCursor?: boolean;
	minUpdateInterval?: number;
	title?: string | string[];
	ttyColumns?: number;
	writer?: Deno.WriterSync & { rid: number };
}

export interface UpdateOptions {
	autoComplete?: boolean;
	clearOnComplete?: boolean;
	completeTemplate?: string | null;
	goal?: number;
	isComplete?: boolean;
	label?: string;
	progressBarSymbolComplete?: string;
	progressBarSymbolIncomplete?: string;
	progressBarSymbolIntermediate?: string[];
	progressBarSymbolLeader?: string;
	progressBarWidthMax?: number;
	progressBarWidthMin?: number;
	progressTemplate?: string;
	tokenOverrides?: [string, string][];
}

type ProgressConstructionOptions = RenderConfigOptions & /* default */ UpdateOptions;

// type ProgressUpdateObject = { value: number; options?: updateOptions };

// ToDO: [2023-03; rivy] add built-in soft exit reset to show cursor (and, if using keypress() to consume input, dispose() and reset to 'cooked' input mode)
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

const EOLRxp = '\r?\n|\r' as RegExpPattern;
const EOLRx = new RegExp(EOLRxp, 'ms');
const terminalEOLRx = new RegExp(`(${EOLRxp})$`, 'ms');
function splitIntoLines(s: string) {
	// all returned "lines" are non-empty or were terminated with a trailing EOL
	// * remove any terminal EOL to avoid a last phantom line
	return s.replace(terminalEOLRx, '').split(EOLRx);
}

// ref: https://unix.stackexchange.com/questions/60641/linux-difference-between-dev-console-dev-tty-and-dev-tty0
const consoleOutputFile = isWinOS ? 'CONOUT$' : '/dev/tty';

// hook application cleanup code to 'unload' event
['unload'].forEach((eventType) =>
	addEventListener(eventType, (_: Event) => {
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
	#progressBarSymbolWidth = 1;

	private encoder = new TextEncoder();

	/**
	 * Goal, label, progressBarSymbolComplete, progressBarSymbolIncomplete, and progressBarSymbolIntermediate also be changed dynamically in the update method
	 *
	 * @param goal  total number of ticks to complete, default: 100
	 * @param label  progress line label text, default: ''
	 * @param completeTemplate  progress display line content for completion, default: undefined
	 * @param progressBarSymbolComplete  completion symbol, default: colors.bgGreen(' ')
	 * @param progressBarSymbolIncomplete  incomplete symbol, default: colors.bgWhite(' ')
	 * @param progressBarSymbolIntermediate  incomplete symbol, default: colors.bgWhite(' ')
	 * @param progressBarSymbolLeader  leader symbol, default: ''
	 * @param progressBarWidthMax  the maximum displayed width of the progress bar, default: 50 characters
	 * @param progressBarWidthMin  the minimum displayed width of the progress bar, default: 10 characters
	 * @param progressTemplate  progress display line content, default: '{label} {percent}% {bar} ({elapsed}s) {value}/{goal}'
	 * @param autoComplete  automatically `complete()` when goal is reached, default: true
	 * @param clearAllOnComplete  clear the entire progress display upon completion, default: false
	 * @param displayAlways  avoid TTY check on writer and always display progress, default: false
	 * @param hideCursor  hide cursor until progress line display is complete, default: false
	 * @param title  progress title line (static), default: undefined
	 * @param minUpdateInterval  minimum time between updates in milliseconds, default: 20 ms
	 */
	constructor({
		autoComplete = true,
		clearOnComplete = false,
		completeTemplate = null,
		goal = 100,
		isComplete = false,
		label = '',
		progressBarSymbolComplete = bgGreen(' '),
		progressBarSymbolIncomplete = bgWhite(' '),
		progressBarSymbolIntermediate = [],
		progressBarSymbolLeader = '',
		progressBarWidthMax = 50, // characters
		progressBarWidthMin = 10, // characters
		progressTemplate = '{label} {percent}% {bar} ({elapsed}s) {value}/{goal}',
		tokenOverrides = [],
		autoCompleteOnAllComplete = true,
		clearAllOnComplete = false,
		displayAlways = false,
		dynamicCompleteHeight = false,
		dynamicUpdateHeight = false,
		hideCursor = false,
		minUpdateInterval = 20, // ms
		title = [],
		ttyColumns = ttySize?.columns ?? 80,
		writer = Deno.stderr,
	}: ProgressConstructionOptions = {}) {
		// convert all symbols to a common display width
		this.#progressBarSymbolWidth = Math.max(
			stringWidth(progressBarSymbolComplete),
			stringWidth(progressBarSymbolIncomplete),
			...progressBarSymbolIntermediate.map((e) => stringWidth(e)),
			stringWidth(progressBarSymbolLeader),
		);
		// max/min bar widths must be a multiple of symbol width
		// * max - round down; min - round up
		progressBarWidthMin += progressBarWidthMin % this.#progressBarSymbolWidth;
		progressBarWidthMax -= progressBarWidthMax % this.#progressBarSymbolWidth;
		// normalizeBarSettings(...): {...};
		this.defaultUpdateSettings = {
			autoComplete,
			clearOnComplete,
			completeTemplate,
			goal,
			isComplete,
			label,
			progressBarSymbolComplete,
			progressBarSymbolIntermediate, /* : progressBarSymbolIntermediate.concat(progressBarSymbolComplete) */
			progressBarSymbolIncomplete,
			progressBarSymbolLeader,
			progressBarWidthMax,
			progressBarWidthMin,
			progressTemplate,
			tokenOverrides,
		};
		this.renderSettings = {
			autoCompleteOnAllComplete,
			clearAllOnComplete,
			displayAlways,
			dynamicCompleteHeight,
			dynamicUpdateHeight,
			hideCursor,
			ttyColumns,
			minUpdateInterval,
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
	// 	this.progressBarSymbolComplete = options.progressBarSymbolComplete;
	// 	this.progressBarSymbolIntermediate = options.progressBarSymbolIntermediate.concat(options.progressBarSymbolComplete);
	// 	this.progressBarSymbolIncomplete = options.progressBarSymbolIncomplete;
	// 	this.completeTemplate = options.completeTemplate;
	// 	this.progressBarWidthMax = options.progressBarWidthMax;
	// 	this.progressBarWidthMin = options.progressBarWidthMin;
	// 	this.progressTemplate = options.progressTemplate;
	// 	this.autoComplete = options.autoComplete;
	// 	this.clearAllOnComplete = options.clearAllOnComplete;
	// 	this.hideCursor = options.hideCursor;
	// 	this.minUpdateInterval = options.minUpdateInterval;
	// 	this.title = options.title;
	// 	this.writer = options.writer;
	// 	this.isTTY = Deno.isatty(writer.rid);
	// 	this.ttyColumns = ttySize(writer.rid)?.columns ?? 80;
	// }

	// ToDO: [2023-03; rivy] add ability for elements of update array to be null/undefined as NOOP for the corresponding Progress display line
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
		_options_?: { forceRender?: boolean },
	): void;
	update(
		updates_: number | (number | [number, (UpdateOptions & { id?: string })?] | null)[],
		options_?: ((UpdateOptions & { id?: string }) & { forceRender?: boolean }),
		render_?: { forceRender?: boolean },
	): void {
		type PriorLine = typeof this.priorLines[number];

		console.warn('update', updates_, options_, render_);
		console.warn('update', { isCompleted: this.isCompleted });

		if (this.isCompleted || !this.display) return;
		const forceRender = render_?.forceRender ?? options_?.forceRender ?? false;

		const now = Date.now();
		const msUpdateInterval = now - this.priorRenderTime;
		if (!forceRender && (msUpdateInterval < this.renderSettings.minUpdateInterval)) return;

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
		console.warn({ updates });

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

		{ // update display // ToDO: [2023-03; rivy] revise as method
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

	// * refresh() ~ re-renders() and re-displays progress display block
	// * display()

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
			'%s', /* in seconds */
			new Intl.NumberFormat(undefined, {
				minimumIntegerDigits: 1,
				minimumFractionDigits: 1,
				maximumFractionDigits: 1,
			})
				.format(age / 1000),
		);

		const eta = sprintf(
			'%s', /* in seconds */
			new Intl.NumberFormat(undefined, {
				minimumIntegerDigits: 1,
				minimumFractionDigits: 1,
				maximumFractionDigits: 1,
			})
				.format((goal - v) / (v / (age / 1000))),
		);

		const percent = sprintf(
			'%3s',
			new Intl.NumberFormat(undefined, {
				minimumIntegerDigits: 1,
				minimumFractionDigits: 0,
				maximumFractionDigits: 0,
			})
				.format((v / goal) * 100),
		);

		const rate = sprintf(
			'%s', /* per second */
			new Intl.NumberFormat(undefined, {
				minimumIntegerDigits: 1,
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			})
				.format(v / (age / 1000)),
		);

		// replace template tokens
		// ToDO: [2023-03; rivy] investigate the fact that subsequent replacements (if matching) can replace *prior replacements*
		//  #... alternative would be construction of a regex combining all overrides and standard tokens for a single pass update
		// ToDO: [2023-03; rivy] add lazy replacements for standard tokens to avoid formatting overhead? benchmark?
		// ToDO: [2023-03; rivy] investigate ~ maybe check for leading/trailing single whitespace character and fully replace just as `{label}` for all tokens?
		//  #... or just trim whitespace (maybe optionally [start,end, all]) the updateText
		//  #... ultimately, would like to remove the special case
		const label = options.label;
		const template = (completed ? options.completeTemplate : undefined) ?? options.progressTemplate;
		let updateText = template;
		if (updateText != null) {
			// replace all token overrides
			for (let i = 0; i < options.tokenOverrides.length; i++) {
				const token = `{${options.tokenOverrides[i][0]}}`;
				const tokenReplacement = `${options.tokenOverrides[i][1]}`;
				updateText = updateText.replace(token, tokenReplacement);
				// console.warn({ updateText });
			}
			// replace all (remaining) standard tokens
			updateText = updateText
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
			const availableSpace = Math.max(
				0,
				this.renderSettings.ttyColumns - stringWidth(updateText.replace('{bar}', '')) - 1,
			);

			/** ProgressBar display width (in [narrow/single-width] characters) */
			const width = Math.max(
				Math.min(options.progressBarWidthMax, availableSpace),
				options.progressBarWidthMin,
			);

			const partialSubGauge = options.progressBarSymbolIntermediate;
			const isPrecise = (partialSubGauge.length > 0);

			// DONE/ToDO: [2023-03; rivy] deal correctly with unicode character variable widths
			// :bar
			const completeWidth = width * ((goal > 0) ? v / goal : 1); // default to full width if goal is 0 (aka, unknown)
			const fullyCompleteWidth = Math.floor(completeWidth);
			const alignedCompleteWidth = fullyCompleteWidth -
				(fullyCompleteWidth % this.#progressBarSymbolWidth);

			let intermediary = '';
			const partialPercentage = (completeWidth - alignedCompleteWidth) /
				this.#progressBarSymbolWidth;
			const subBarElementN = (partialPercentage > 0)
				? Math.floor(partialSubGauge.length * partialPercentage)
				: undefined;
			if (isPrecise && !completed && (subBarElementN != null)) {
				intermediary = partialSubGauge[subBarElementN];
			}
			const anyCompleteWidth = alignedCompleteWidth + stringWidth(intermediary);
			const leader = (completed || (anyCompleteWidth >= width))
				? ''
				: options.progressBarSymbolLeader;

			const incompleteWidth = width - alignedCompleteWidth - stringWidth(intermediary) -
				stringWidth(leader);

			// console.warn({
			// 	// partialSubGauge,
			// 	// pSGLength: partialSubGauge.length,
			// 	// isPrecise,
			// 	// completed,
			// 	width,
			// 	completeWidth,
			// 	fullyCompleteWidth,
			// 	alignedCompleteWidth,
			// 	partialPercentage,
			// 	subBarElementN,
			// 	intermediary,
			// 	incompleteWidth,
			// });

			// ! ToDO?: [2023-03; rivy] enforce symbols as single graphemes (ignoring ANSI escapes)
			// #... maybe just suggest in docs that all symbols be of the same length
			// #... or enforce same length with automatic string extension of symbols
			// #... * what about colorization?
			// #... * maybe just add additional symbols ?, (�) U+FFFD REPLACEMENT CHARACTER,or □ (WHITE SQUARE, U+25A1) as a visual alert but still works
			// #... * DON'T force, just document that the bar will change widths if all "symbols" aren't of the same display width
			// #... * ... maybe warn with a warning suppression option?
			const complete = new Array(alignedCompleteWidth / this.#progressBarSymbolWidth)
				.fill(options.progressBarSymbolComplete)
				.join('');
			const incomplete = new Array(Math.max(incompleteWidth / this.#progressBarSymbolWidth, 0))
				.fill(options.progressBarSymbolIncomplete)
				.join('');

			updateText = updateText.replace('{bar}', complete + intermediary + leader + incomplete);

			updateText = cliTruncate(updateText, this.renderSettings.ttyColumns - 1);
		}

		// console.warn({ updateText: stripColor(updateText) });
		return { updateText, completed };
	}

	/**
	 * complete(): finish progress bar
	 * * no need to call unless you want completion to occur before all goals are obtained
	 */
	complete(cursorRest: CursorPosition = 'afterBlock'): void {
		console.warn('complete');
		// ToDO: [2023-03; rivy] add support for all cursorRest positions
		if (this.isCompleted) return;
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
		// if (!isWinOS) {
		if (cursorRest == 'afterBlock') {
			this.#cursorToNextLine();
			this.#cursorToLineStart();
			this.#cursorPosition = 'afterBlock';
		}
		this.#showCursor();
		this.isCompleted = true;
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
		if (this.isCompleted) {
			if (!isWinOS) {
				this.#cursorToNextLine();
				this.#cursorToLineStart();
				this.#cursorPosition = 'afterBlock';
			}
			this.#showCursor();
		}
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
		if (this.#cursorPosition == 'afterBlock') this.#cursorUp();
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
