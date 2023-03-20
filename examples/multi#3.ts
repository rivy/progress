import Progress from '../mod.ts';

const title = 'Downloading files...';
const total = 100;

const bars = new Progress({
	// autoCompleteOnAllComplete: false,
	// clearAllOnComplete: true,
	// title,
	// clearOnComplete: true,
	dynamicCompleteHeight: true,
	// dynamicUpdateHeight: true,
	barSymbolComplete: '=',
	barSymbolIncomplete: '-',
	// progressBarWidthMax: 100,
	completeTemplate: '',
	progressTemplate: '[{bar}] {label} {percent}% (in {elapsed}s) {value}/{goal}',
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
			[completed1, { label: 'file1', barSymbolComplete: '*', barSymbolIncomplete: '.' }],
			[completed2, { label: 'file2', clearOnComplete: true }],
			[completed3, { label: 'file3' /* completeTemplate: '*DONE*: {label}' */ }],
		]);
		if ((completed3 <= total) && (completed3 % 50 == 0)) {
			bars.log(`file3: completed ${completed3} of ${total}`);
		}
		if (completed1 >= 100 && !displayedDone1) {
			bars.log('file1: DONE');
			displayedDone1 = true;
		}
		if (completed2 >= 100 && !displayedDone2) {
			bars.log('file2: DONE');
			displayedDone2 = true;
		}
		if (completed3 >= 100 && !displayedDone3) {
			bars.log('file3: DONE');
			displayedDone3 = true;
		}

		setTimeout(function () {
			downloading();
		}, 50);
	} else bars.update(1);
}

downloading();
