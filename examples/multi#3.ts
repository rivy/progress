import Progress from '../mod.ts';

const title = 'download files';
const total = 100;

const bars = new Progress({
	// clearAllOnComplete: true,
	title, // FixME: doesn't work...
	clearOnComplete: true,
	barSymbolComplete: '=',
	barSymbolIncomplete: '-',
	// progressBarWidthMax: 100,
	// completeTemplate: 'DONE: {label}',
	progressTemplate: '[{bar}] {label} {percent} {elapsed} {value}/{goal}',
});

let completed1 = 0;
let completed2 = 0;
let completed3 = 0;

function downloading() {
	if (completed1 <= total) {
		completed1 += 1;
		completed2 += 3;
		completed3 += 2;
		bars.update([
			[completed1, { label: 'file1', barSymbolComplete: '*', barSymbolIncomplete: '.' }],
			[completed2, { label: 'file2', clearOnComplete: true }],
			[completed3, { label: 'file3', completeTemplate: 'DONE: {label}' }],
		]);
		if ((completed3 <= total) && (completed3 % 50 == 0)) {
			bars.log(`Hit completed3 of ${completed3}/${total}.`);
		}

		setTimeout(function () {
			downloading();
		}, 100);
	}
}

bars.log('Downloading files...');
downloading();
