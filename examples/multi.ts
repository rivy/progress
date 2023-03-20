import Progress from '../mod.ts';

const title = 'download files';
const total = 100;

const bars = new Progress({
	title,
	// clear: true,
	barSymbolComplete: '=',
	barSymbolIncomplete: '-',
	progressTemplate: '[{bar}] {label} {percent}% {elapsed}s {value}/{goal}',
});

let completed1 = 0;
let completed2 = 0;

function downloading() {
	if (completed1 <= total || completed2 <= total) {
		completed1 += 1;
		completed2 += 2;
		bars.update([
			[completed1, { label: 'file1', barSymbolComplete: '*', barSymbolIncomplete: '.' }],
			[completed2, { label: 'file2' }],
		]);

		setTimeout(function () {
			downloading();
		}, 100);
	}
}

downloading();
