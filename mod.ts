import { bgGreen, bgWhite, sprintf, writeAllSync } from './deps.ts';
export { MultiProgressBar } from './multi.ts';

const isWinOS = Deno.build.os === 'windows';

// ANSI CSI sequences; ref: <https://en.wikipedia.org/wiki/ANSI_escape_code> @@ <https://archive.is/CUtrX>
const ansiCSI = { showCursor: '\x1b[?25h', hideCursor: '\x1b[?25l', clearEOL: '\x1b[0K' };

type ConsoleSize = { columns: number; rows: number };
function ttySize(rid = Deno.stdout.rid) {
	// `Deno.consoleSize()` is unstable API (as of v1.19+) => deno-lint-ignore no-explicit-any
	// deno-lint-ignore no-explicit-any
	const denoConsoleSize = (Deno as any).consoleSize as (rid: number) => ConsoleSize | undefined;
	let size: ConsoleSize | undefined;
	try {
		// * `denoConsoleSize()` may throw (if rid is not a TTY [ie, redirected])
		size = denoConsoleSize?.(rid);
	} catch {
		size = undefined;
	}
	return size;
}

interface constructorOptions {
	label?: string;
	goal?: number;
	maxBarWidth?: number;
	symbolComplete?: string;
	symbolIncomplete?: string;
	symbolIntermediate?: string[];
	autoComplete?: boolean;
	clearOnComplete?: boolean;
	progressTemplate?: string;
	hideCursor?: boolean;
	//
	maxWidth?: number;
	minRenderInterval?: number;
	title?: string;
	writer?: Deno.WriterSync & { rid: number };
}

interface updateOptions {
	label?: string;
	goal?: number;
	symbolComplete?: string;
	symbolIncomplete?: string;
	symbolIntermediate?: string[];
}

export default class Progress {
	label: string;
	goal?: number;
	progressBarWidth: number;
	symbolComplete: string;
	symbolIncomplete: string;
	symbolIntermediate: string[];
	autoComplete: boolean;
	clearOnComplete: boolean;
	progressTemplate: string;
	hideCursor: boolean;
	minRenderInterval: number;
	writer: Deno.WriterSync & { rid: number };
	ttyColumns: number;
	isTTY: boolean;

	private isCompleted = false;
	private startTime = Date.now();
	private priorUpdateText = '';
	private priorUpdateTime = 0;

	private encoder = new TextEncoder();

	/**
	 * Label, goal, symbolComplete, symbolIncomplete, and symbolIntermediate also be changed dynamically in the update method
	 *
	 * @param label Progress bar label, default: ''
	 * @param goal total number of ticks to complete,
	 * @param progressBarWidth the displayed width of the progress, default: 50 characters
	 * @param symbolComplete completion symbol, default: colors.bgGreen(' ')
	 * @param symbolIncomplete incomplete symbol, default: colors.bgWhite(' ')
	 * @param autoComplete automatically `complete()` when goal is reached, default: true
	 * @param clearOnComplete  clear the bar on completion, default: false
	 * @param progressTemplate  What is displayed and display order, default: ':label :percent :bar :elapsed :value/:goal'
	 * @param hideCursor  hide cursor until progress bar is complete, default: false
	 * @param minRenderInterval  minimum time between updates in milliseconds, default: 16 ms
	 */
	constructor(
		{
			label = '',
			goal,
			maxBarWidth = 50,
			symbolComplete = bgGreen(' '),
			symbolIncomplete = bgWhite(' '),
			symbolIntermediate = [],
			autoComplete = true,
			clearOnComplete = false,
			progressTemplate,
			hideCursor = false,
			minRenderInterval = 16,
			writer = Deno.stderr,
		}: constructorOptions = {},
	) {
		this.label = label;
		this.goal = goal;
		this.progressBarWidth = maxBarWidth;
		this.symbolComplete = symbolComplete;
		this.symbolIntermediate = symbolIntermediate.concat(symbolComplete);
		this.symbolIncomplete = symbolIncomplete;
		this.autoComplete = autoComplete;
		this.clearOnComplete = clearOnComplete;
		this.progressTemplate = progressTemplate ?? ':label :percent :bar :elapsed :value/:goal';
		this.hideCursor = hideCursor;
		this.minRenderInterval = minRenderInterval;
		this.writer = writer;
		this.isTTY = Deno.isatty(writer.rid);
		this.ttyColumns = ttySize(writer.rid)?.columns ?? 100;
	}

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
	update(value: number, options: updateOptions = {}): void {
		if (this.isCompleted || !this.isTTY) return;

		if ((isNaN(value)) || (value < 0)) {
			throw new Error(`progress: value must be a number which is greater than or equal to 0`);
		}

		const goal = options.goal ?? this.goal ?? 100;
		const now = Date.now();
		const msUpdateInterval = now - this.priorUpdateTime;
		if (msUpdateInterval < this.minRenderInterval && value < goal) return;

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
				.format((goal - value) / (value / (age / 1000))),
		);

		const percent = sprintf(
			'%3s%%',
			new Intl.NumberFormat(undefined, {
				minimumIntegerDigits: 1,
				minimumFractionDigits: 0,
				maximumFractionDigits: 0,
			})
				.format((value / goal) * 100),
		);

		const rate = sprintf(
			'%s/s', /* per second */
			new Intl.NumberFormat(undefined, {
				minimumIntegerDigits: 1,
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			})
				.format(value / (age / 1000)),
		);

		// :label :elapsed :eta :goal :percent :rate :value
		const label = options.label ?? this.label;
		let text = this
			.progressTemplate
			.replace(/:label(\s?)/, label.length ? (label + '$1') : '')
			.replace(':elapsed', elapsed)
			.replace(':eta', eta)
			.replace(':goal', goal + '')
			.replace(':percent', percent)
			.replace(':rate', rate)
			.replace(':value', value + '');

		// compute the available space (non-zero) for the bar
		let availableSpace = Math.max(0, this.ttyColumns - text.replace(':bar', '').length);
		if (availableSpace && isWinOS) availableSpace -= 1;

		const width = Math.min(this.progressBarWidth, availableSpace);
		const finished = value >= goal;

		const preciseBar = options.symbolIntermediate ?? this.symbolIntermediate;
		const precision = preciseBar.length > 1;

		// :bar
		const completeLength = width * value / goal;
		const roundedCompleteLength = Math.floor(completeLength);

		let precise = '';
		if (precision) {
			const preciseLength = completeLength - roundedCompleteLength;
			precise = finished ? '' : preciseBar[Math.floor(preciseBar.length * preciseLength)];
		}

		const complete = new Array(roundedCompleteLength)
			.fill(options.symbolComplete ?? this.symbolComplete)
			.join('');
		const incomplete = new Array(Math.max(width - roundedCompleteLength - (precision ? 1 : 0), 0))
			.fill(options.symbolIncomplete ?? this.symbolIncomplete)
			.join('');

		text = text.replace(':bar', complete + precise + incomplete);

		if (text !== this.priorUpdateText) {
			this.#write(text);
			this.priorUpdateText = text;
		}

		if (finished && this.autoComplete) this.complete();
	}

	/**
	 * complete(): finish progress bar
	 * * no need to call unless you want completion to occur before goal is attained
	 */
	complete(): void {
		this.isCompleted = true;
		if (this.clearOnComplete) {
			this.#write();
			// } else {
			// 	this.#toNextLine();
		}
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
		this.#toNextLine();
		this.#write(this.priorUpdateText);
		if (!this.hideCursor) this.#showCursor();
	}

	#write(msg?: string): void {
		if (this.hideCursor) this.#hideCursor();
		this.#writeRaw(`\r${msg ?? ''}${ansiCSI.clearEOL}`);
		if (!this.hideCursor) this.#showCursor();
	}

	#writeRaw(msg: string) {
		writeAllSync(this.writer, this.encoder.encode(msg));
	}

	#toNextLine() {
		this.#writeRaw('\r\n');
	}

	#hideCursor(): void {
		this.#writeRaw(`${ansiCSI.hideCursor}`);
	}

	#showCursor(): void {
		this.#writeRaw(`${ansiCSI.showCursor}`);
	}
}
