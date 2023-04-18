// import type {
// 	ExportedChance,
// 	Seeded,
// } from 'https://cdn.jsdelivr.net/gh/DefinitelyTyped/DefinitelyTyped@b70b8e239fc881b2/types/chance/index.d.ts';
// ref: [](https://javascript.info/fetch-progress) @@ <>
// ref: [Aborting a fetch: Next Generation](https://github.com/whatwg/fetch/issues/447) @@ <>
// ref: <https://stackoverflow.com/questions/35711724/upload-progress-indicators-for-fetch>
// ref: <https://stackoverflow.com/questions/36453950/upload-file-with-fetch-api-in-javascript-and-show-progress>
// ref: <https://stackoverflow.com/a/54137265/43774>
// ref: <https://stackoverflow.com/questions/47285198/fetch-api-download-progress-indicator>

import * as $colors from 'https://deno.land/std@0.126.0/fmt/colors.ts';
import * as $path from 'https://deno.land/std@0.149.0/path/mod.ts';

// import { fetch } from 'https://cdn.jsdelvr.net/gh/rivy/deno.dxx@b964ffafb062c2d8/src/lib/xFetch.ts';
import { validURL } from '../../../../../dxx/repo.GH/src/lib/$shared.ts';
import { fetch } from '../../../../../dxx/repo.GH/src/lib/xFetch.ts';

// import $chance from 'npm:chance@1.1.11'; // for Deno v1.28.0+
import 'https://cdn.jsdelivr.net/gh/DefinitelyTyped/DefinitelyTyped@b70b8e239fc881b2/types/chance/index.d.ts';
type ChanceT = Chance.ChanceStatic;
// *BROKEN* // import * as ChanceM from 'https://cdn.jsdelivr.net/npm/chance@1.1.11';
import ChanceM from 'https://esm.sh/chance@1.1.11';
const $chance = { Chance: ChanceM as ChanceT }; // esm.sh typing
// import * as ChanceM from 'https://jspm.dev/npm:chance@1.1.11';
// const $chance = ChanceM as { Chance: ChanceT }; // jspm.dev typing

// console.warn({ $chance });

import Progress from '../mod.ts';

const randomSeedPreset: number | undefined = undefined /* 1234567890 */;
const randomSeed = randomSeedPreset ?? (Math.random() * Math.pow(2, 32));
// console.warn({ randomSeed });
const chance = new $chance.Chance(randomSeed);
function randomPick<T>(array: T[]) {
	const n = chance.integer({ min: 0, max: array.length - 1 });
	return array[n];
}

const isWinOS = Deno.build.os === 'windows';
// ANSI CSI sequences; ref: <https://en.wikipedia.org/wiki/ANSI_escape_code> @@ <https://archive.is/CUtrX>
const ansiCSI = {
	clearEOL: '\x1b[0K',
	clearEOS: '\x1b[0J',
	clearLine: '\x1b[2K',
	cursorUp: /* move cursor up {n} lines */ '\x1b[{n}A',
	hideCursor: '\x1b[?25l',
	showCursor: '\x1b[?25h',
};
import { writeAllSync } from 'https://deno.land/std@0.126.0/streams/conversion.ts';

['unload'].forEach((eventType) =>
	addEventListener(eventType, (_: Event) => {
		// ToDO: [2023-03; rivy] evaluate this for potential problems and conversion to a module of some kind
		const encoder = new TextEncoder();
		const msg = ansiCSI.cursorUp.replace('{n}', '1');
		if (isWinOS) writeAllSync(Deno.stdout, encoder.encode(msg));
	})
);

const urls = [
	// FixME: add `insecure` (or `allowInsecure`) option to `fetch` to allow use of self-signed certificates
	// FixME: `deno run -A examples\fetch-progress.ts "sftp://USER@HOST:PORT/share/"` outputs incorrect completion text (for WinOS; ok for POSIX), overwriting the last line
	// ToDO: [2023-03; rivy] add support for files and file URLs
	// from <https://github.com/denoland/deno/releases>
	'https://github.com/denoland/deno/releases/download/v1.31.3/deno-aarch64-apple-darwin.zip',
	'https://github.com/denoland/deno/releases/download/v1.31.3/deno-x86_64-apple-darwin.zip',
	'https://github.com/denoland/deno/releases/download/v1.31.3/deno-x86_64-pc-windows-msvc.zip',
	'https://github.com/denoland/deno/releases/download/v1.31.3/deno-x86_64-unknown-linux-gnu.zip',
];

// console.warn({ ChanceM, chance });
// console.warn({ natural: chance.natural(), pick: randomPick(urls) });
// Deno.exit(0);

// coefficient()
/** Coefficient of number in engineering or scientific notation (as string to maintain precision)
 */
function coefficient(n: string) {
	return Number(n.replace(/[Ee]\d+$/, ''));
}
function scientificExponentOf(n: number) {
	return (n != 0) ? Math.floor(Math.log10(n)) : 0;
}
function engineeringExponentOf(n: number) {
	return Math.floor(scientificExponentOf(n) / 3) * 3;
}
function toEngineeringNotation(n: number) {
	// const logScale = engineeringScaleOf(n);
	const f = new Intl.NumberFormat(undefined, {
		minimumSignificantDigits: 4,
		maximumSignificantDigits: 4,
		notation: 'engineering',
	});
	return f.format(n);
}

function unitFromEng(n: string) {
	const conversions = new Map([
		['e0', 'B'],
		['e3', 'kB'],
		['e6', 'MB'],
		['e9', 'GB'],
		['e12', 'TB'],
		['e15', 'PB'],
	]);
	// console.warn({ match: n.match(/(E\d+)$/) });
	const [_, exp] = n.match(/(E\d+)$/) ?? [''];
	return `${conversions.get(`${exp}`.toLocaleLowerCase()) ?? ''}`;
}

function toUnitsFromEng(n: string) {
	const conversions = new Map([
		['e0', 'B'],
		['e3', 'kB'],
		['e6', 'MB'],
		['e9', 'GB'],
		['e12', 'TB'],
		['e15', 'PB'],
	]);
	const [_, base, exp] = n.match(/^(.*?)(E\d+)$/) ?? [n, ''];
	return `${base} ${conversions.get(`${exp}`.toLocaleLowerCase()) ?? ''}`.trimEnd();
}

const pick = Deno.args.length > 0 ? Deno.args[0] : randomPick(urls);
const url = validURL(pick);
if (url == null) {
	console.warn(`ERR!: '${pick}' is not a valid URL.`);
	Deno.exit(1);
}
const filename = $path.basename(url.href);

const response = await fetch(url);
const total = Number(response.headers.get('content-length') ?? 0);

const engineeringOOM = engineeringExponentOf(total); // engineering order-of-magnitude
const engTotal = toEngineeringNotation(total);
const coefEngTotal = coefficient(engTotal); // coefficient of number // spell-checker:ignore (vars) coef
const unit = unitFromEng(engTotal);
const asUnits = toUnitsFromEng(engTotal);
console.warn({ response, total, engineeringOOM, engTotal, coefEngTotal, unit, asUnits });

// Deno.exit(0);

const progress = new Progress({
	goal: coefEngTotal,
	hideCursor: true,
	label: `Fetching...`,
	progressTemplate: total > 0
		? `Fetching file... * {percent}% * {bar} {value}/${asUnits} ({elapsed}s; {rate}${unit}/s; eta {eta}s) :: ${url}`
		: `Fetching file... * {value} ({elapsed}s; {rate}/s) :: ${url}`,
	minUpdateInterval: 100,
	progressBarWidthMin: 20,
});

const decoder = new TextDecoder();
let out = '';
const reader = response.body?.getReader();
// console.warn({ reader });
let bytesReceived = 0;
while (true) {
	const result = await reader?.read();
	const bytesRead = result?.value?.length;
	console.warn({ result, bytesRead });
	if (bytesRead != null) {
		bytesReceived += bytesRead;
		out += decoder.decode(result?.value);
		console.warn(`Received ${bytesReceived} bytes (of ${total} data)'`);
		// const value = f
		// 	// .format(bytesReceived / (10 ** engScale))
		// 	.format((Math.round(bytesReceived / (10 ** engScale) * 1000) + Number.EPSILON) / 1000)
		// 	.replace(/[Ee]\d+$/, '')
		// 	.slice(0, 5);
		const f = new Intl.NumberFormat(undefined, {
			minimumSignificantDigits: 4,
			maximumSignificantDigits: 4,
			maximumFractionDigits: 3,
		});
		const valueOOM = engineeringOOM > 0 ? engineeringOOM : engineeringExponentOf(bytesReceived);
		// const units = ...
		const value = f
			.format((Math.round(bytesReceived / (10 ** valueOOM) * 1000) + Number.EPSILON) / 1000)
			.slice(0, 5);
		// console.warn({ value });
		progress.update(Number(value), { goal: bytesReceived, tokenOverrides: [['value', value]] });
	}
	if ((result == null) || (result.done)) {
		progress.log($colors.cyan(`info: Fetch complete ('${filename}')`));
		// progress.log($colors.yellow(`debug: ${total}`));
		progress.update(total, { forceRender: true, tokenOverrides: [['value', `${coefEngTotal}`]] });
		// progress.complete();
		console.warn('');
		break;
	}
}
// if (out.length > 0) {
// 	console.log({ output: out });
// }
// console.log('...');
