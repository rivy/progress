// import type {
// 	ExportedChance,
// 	Seeded,
// } from 'https://cdn.jsdelivr.net/gh/DefinitelyTyped/DefinitelyTyped@b70b8e239fc881b2/types/chance/index.d.ts';
// ref: [](https://javascript.info/fetch-progress) @@ <>
// ref: [Aborting a fetch: Next Generation](https://github.com/whatwg/fetch/issues/447) @@ <>
// ref: <https://stackoverflow.com/questions/35711724/upload-progress-indicators-for-fetch>
// ref: <https://stackoverflow.com/questions/36453950/upload-file-with-fetch-api-in-javascript-and-show-progress>
// ref: <https://stackoverflow.com/a/54137265/43774>

import * as $colors from 'https://deno.land/std@0.126.0/fmt/colors.ts';
import * as $path from 'https://deno.land/std@0.149.0/path/mod.ts';

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

const randomSeed = Date.now();
const chance = new $chance.Chance(randomSeed);
function randomPick<T>(array: T[]) {
	const n = chance.integer({ min: 0, max: array.length - 1 });
	return array[n];
}

const urls = [
	// from <https://github.com/denoland/deno/releases>
	'https://github.com/denoland/deno/releases/download/v1.31.3/deno-aarch64-apple-darwin.zip',
	'https://github.com/denoland/deno/releases/download/v1.31.3/deno-x86_64-apple-darwin.zip',
	'https://github.com/denoland/deno/releases/download/v1.31.3/deno-x86_64-pc-windows-msvc.zip',
	'https://github.com/denoland/deno/releases/download/v1.31.3/deno-x86_64-unknown-linux-gnu.zip',
];

// console.warn({ ChanceM, chance });
// console.warn({ natural: chance.natural(), pick: randomPick(urls) });
// Deno.exit(0);

const url = randomPick(urls);
const filename = $path.basename(url);

const response = await fetch(url);
const total = Number(response.headers.get('content-length'));

function engineeringScaleOf(n: number) {
	return Math.floor(Math.log10(n) / 3) * 3;
}
function nToEngineerScale(n: number) {
	// const logScale = engineeringScaleOf(n);
	const f = new Intl.NumberFormat(undefined, {
		minimumSignificantDigits: 4,
		maximumSignificantDigits: 4,
		notation: 'engineering',
	});
	return f.format(n);
}

function unitFrom(n: string) {
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

function toUnits(n: string) {
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

const engScale = engineeringScaleOf(total);
const scaledTotal = nToEngineerScale(total);
// const bareScaledTotal = total / (10 ** engScale);
const bareScaledTotal = Number(scaledTotal.replace(/[Ee]\d+$/, ''));
const unit = unitFrom(scaledTotal);
const asUnits = toUnits(scaledTotal);
// console.warn({ total, engScale, scaledTotal, bareScaledTotal, unit, asUnits });

// Deno.exit(0);

const progress = new Progress({
	goal: bareScaledTotal,
	hideCursor: true,
	label: `Fetching...`,
	progressTemplate:
		`Fetching file... * {percent}% * {bar} {value}/${asUnits} ({elapsed}s; {rate}${unit}/s; eta {eta}s) :: ${url}`,
	minRenderInterval: 100,
	progressBarWidthMin: 20,
});

const f = new Intl.NumberFormat(undefined, {
	minimumSignificantDigits: 4,
	maximumSignificantDigits: 4,
});
const reader = response.body?.getReader();
let bytesReceived: number | null = 0;
while (true) {
	const result = await reader?.read();
	const received = result?.value?.length;
	if (received != null) {
		bytesReceived += received;
		// console.log(`Received ${bytesReceived} bytes (of ${total} data)'`);
		const value = Number(f.format(bytesReceived / (10 ** engScale)).replace(/[Ee]\d+$/, ''));
		progress.update(value);
	}
	if (result?.done) {
		progress.log($colors.cyan(`info: Fetch complete ('${filename}')`));
		progress.update(total, { forceRender: true });
		// progress.complete();
		break;
	}
}
