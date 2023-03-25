import * as $colors from 'https://deno.land/std@0.126.0/fmt/colors.ts';

import Progress from '../mod.ts';

const title = 'Downloading files...';
const total = 100;

function logProgressInfo(progress: Progress, message: string) {
	progress.log($colors.brightWhite($colors.bgCyan(' i ')) + ' ' + message);
}

const bars = new Progress({
	// autoCompleteOnAllComplete: false,
	// clearAllOnComplete: true,
	// title,
	// clearOnComplete: true,
	dynamicCompleteHeight: true,
	// dynamicUpdateHeight: true,
	progressBarSymbolComplete: '=',
	progressBarSymbolIncomplete: '-',
	progressBarWidthMax: 100,
	completeTemplate: '',
	progressTemplate: `🚀 ${$colors.red('*')} [${$colors.green('{bar}')}] {label} {percent}% (in ${
		$colors.yellow('{elapsed}s')
	}) {value}/{goal}`,
	hideCursor: true,
});

let completed1 = 0;
let completed2 = 0;
let completed3 = 0;

let displayedDone1 = false;
let displayedDone2 = false;
let displayedDone3 = false;

function downloading() {
	if (completed1 <= total) {
		completed1 += 1;
		completed2 += 3;
		completed3 += 2;
		bars.update([
			[0, {
				goal: 1,
				progressTemplate: title,
				completeTemplate: title + 'DONE',
				clearOnComplete: false,
			}],
			[completed1, {
				label: 'file1',
				progressBarSymbolComplete: '*',
				progressBarSymbolIncomplete: '.',
			}],
			[completed2, { label: 'file2', clearOnComplete: true }],
			[completed3, { label: 'file3' /* completeTemplate: '*DONE*: {label}' */ }],
		]);
		if ((completed3 <= total) && (completed3 % 50 == 0)) {
			logProgressInfo(bars, `file3: completed ${completed3} of ${total}`);
		}
		if (completed1 >= 100 && !displayedDone1) {
			logProgressInfo(bars, 'file1: DONE');
			displayedDone1 = true;
		}
		if (completed2 >= 100 && !displayedDone2) {
			logProgressInfo(bars, 'file2: DONE');
			displayedDone2 = true;
		}
		if (completed3 >= 100 && !displayedDone3) {
			logProgressInfo(bars, 'file3: DONE');
			displayedDone3 = true;
		}

		setTimeout(function () {
			downloading();
		}, 50);
	} else bars.update(1);
}

downloading();
