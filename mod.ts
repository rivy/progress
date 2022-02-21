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
	progressBarWidth?: number;
	symbolComplete?: string;
	symbolIncomplete?: string;
	symbolIntermediate?: string[];
	clearOnComplete?: boolean;
	minInterval?: number;
	progressTemplate?: string;
	completeTemplate?: string;
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
	clearOnComplete: boolean;
	minInterval: number;
	progressTemplate: string;
	completeTemplate?: string;
	writer: Deno.WriterSync & { rid: number };
	ttyColumns: number;
	isTTY: boolean;

	private isCompleted = false;
	private startTime = Date.now();
	private priorUpdateText = '';
	private priorUpdateTick = 0;
	private priorUpdateTime = 0;

	private defaultGoal = 100;
	private defaultMaxLength = 100;

	private encoder = new TextEncoder();

	/**
	 * Label, goal, symbolComplete, symbolIncomplete, and symbolIntermediate also be changed dynamically in the update method
	 *
	 * @param label Progress bar label, default: ''
	 * @param goal total number of ticks to complete,
	 * @param progressBarWidth the displayed width of the progress, default: 50
	 * @param symbolComplete completion symbol, default: colors.bgGreen(' ')
	 * @param symbolIncomplete incomplete symbol, default: colors.bgWhite(' ')
	 * @param clearOnComplete  clear the bar on completion, default: false
	 * @param minInterval  minimum time between updates in milliseconds, default: 16
	 * @param progressTemplate - template for progress display; default: ':label :percent :bar :elapsed :value/:goal'
	 * @param completeTemplate - template for complete message display; default: undefined
	 */
	constructor(
		{
			label = '',
			goal,
			progressBarWidth = 50,
			symbolComplete = bgGreen(' '),
			symbolIncomplete = bgWhite(' '),
			symbolIntermediate = [],
			clearOnComplete = false,
			minInterval = 16,
			progressTemplate,
			completeTemplate,
			writer = Deno.stderr,
		}: constructorOptions = {},
	) {
		this.label = label;
		this.goal = goal;
		this.progressBarWidth = progressBarWidth;
		this.symbolComplete = symbolComplete;
		this.symbolIntermediate = symbolIntermediate.concat(symbolComplete);
		this.symbolIncomplete = symbolIncomplete;
		this.clearOnComplete = clearOnComplete;
		this.minInterval = minInterval;
		this.progressTemplate = progressTemplate ?? ':label :percent :bar :elapsed :value/:goal';
		this.completeTemplate = completeTemplate;
		this.writer = writer;
		this.isTTY = Deno.isatty(writer.rid);
		this.ttyColumns = ttySize(writer.rid)?.columns ?? this.defaultMaxLength;
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
	update(tick: number, options: updateOptions = {}): void {
		if (this.isCompleted || !this.isTTY) return;

		if (tick < 0) {
			throw new Error('progress: `tick` value must be greater than or equal to 0');
		}

		this.goal = options.goal ?? this.goal ?? this.defaultGoal;
		this.label = options.label ?? this.label;

		const goal = this.goal;

		const now = Date.now();
		const msUpdateInterval = now - this.priorUpdateTime;
		if (msUpdateInterval < this.minInterval && tick < goal) return;

		this.priorUpdateTick = tick;
		this.priorUpdateTime = now;

		// expand template (for :label :elapsed :eta :goal :percent :rate :tick :value)
		let text = this.#expandTemplate(this.progressTemplate, this.#templateVars({ tick }));

		// compute the available space (non-zero) for the bar
		let availableSpace = Math.max(0, this.ttyColumns - text.replace(':bar', '').length);
		if (availableSpace && isWinOS) availableSpace -= 1;

		const width = Math.min(this.progressBarWidth, availableSpace);
		const finished = tick >= goal;

		const partialSymbols = options.symbolIntermediate ?? this.symbolIntermediate;
		const precision = partialSymbols.length > 1;

		// :bar
		const completeLength = width * tick / goal;
		const roundedCompleteLength = Math.floor(completeLength);

		let precise = '';
		if (precision) {
			const preciseLength = completeLength - roundedCompleteLength;
			precise = finished ? '' : partialSymbols[Math.floor(partialSymbols.length * preciseLength)];
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

		if (finished) this.complete(this.completeTemplate);
	}

	/**
	 * `complete()` - finish a progress bar
	 * * no need to call in most cases, unless you want to complete/end before 100%
	 */
	complete(msgTemplate?: string): void {
		this.isCompleted = true;
		if (this.clearOnComplete || (msgTemplate != undefined)) {
			this.#write();
		} else {
			this.#toNextLine();
		}
		if (msgTemplate != undefined) {
			this.#write(
				this.#expandTemplate(msgTemplate, this.#templateVars({ tick: this.priorUpdateTick })),
			);
		}
		this.#showCursor();
	}

	/**
	 * interrupt the progress bar and write a message above it
	 *
	 * @param message The message to write
	 */
	log(message: string | number): void {
		this.#hideCursor();
		this.#write(`${message}`);
		this.#toNextLine();
		this.#write(this.priorUpdateText);
		this.#showCursor();
	}

	#expandTemplate(template: string, vars: Record<string, string | number>) {
		return template
			.replace(/:label(\s?)/, vars.label ? (vars.label.toLocaleString() + '$1') : '')
			.replace(':elapsed', vars.elapsed ? vars.elapsed.toLocaleString() : '')
			.replace(':eta', vars.eta ? vars.eta.toLocaleString() : '')
			.replace(':goal', vars.goal ? vars.goal.toLocaleString() : '')
			.replace(
				':percent',
				vars.percent
					? vars.percent.toLocaleString()
					: '',
			)
			.replace(':rate', vars.rate ? vars.rate.toLocaleString() : '')
			.replace(':tick', vars.tick ? vars.tick.toLocaleString() : '')
			.replace(':value', vars.tick ? vars.tick.toLocaleString() : '');
	}

	#templateVars(inputs_: { label?: string; tick: number; goal?: number }) {
		const inputs = { goal: this.defaultGoal, ...inputs_ };
		const goal = inputs.goal;
		const tick = inputs.tick;
		const now = Date.now();
		const age /* ms */ = now - this.startTime;
		const elapsed /* secs */ = sprintf(
			'%ss',
			new Intl.NumberFormat(undefined, {
				minimumIntegerDigits: 1,
				minimumFractionDigits: 1,
				maximumFractionDigits: 1,
			})
				.format(age /* ms */ / 1000),
		);

		const eta /* secs */ = sprintf(
			'%ss',
			new Intl.NumberFormat(undefined, {
				minimumIntegerDigits: 1,
				minimumFractionDigits: 1,
				maximumFractionDigits: 1,
			})
				.format((goal - tick) / (tick / (age /* ms */ / 1000))),
		);

		const percent = sprintf(
			'%3s%%',
			new Intl.NumberFormat(undefined, {
				minimumIntegerDigits: 1,
				minimumFractionDigits: 0,
				maximumFractionDigits: 0,
			})
				.format((tick / goal) * 100),
		);

		const rate = sprintf(
			'%s/s',
			new Intl.NumberFormat(undefined, {
				minimumIntegerDigits: 1,
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			})
				.format(tick / (age /* ms */ / 1000)),
		);

		return { age, elapsed, eta, goal, now, percent, rate, tick, value: tick };
	}

	#write(msg?: string): void {
		this.#writeRaw(`\r${msg ?? ''}${ansiCSI.clearEOL}`);
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
