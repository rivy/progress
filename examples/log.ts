// import { sprintf } from '../deps.ts';
// const formatAsInteger = new Intl.NumberFormat(undefined, {
// 	minimumIntegerDigits: 1,
// 	minimumFractionDigits: 0,
// 	maximumFractionDigits: 0,
// });

import Progress from '../mod.ts';

const label = 'progress =';
const goal = 100;

const progress = new Progress({
	title: 'Gauges with logging...',
	label,
	goal,
	hideCursor: true,
	progressBarWidthMax: 150,
});

let completed = 0;

function downloading() {
	if (completed <= goal) {
		progress.update([++completed, [completed, { label: 'progress *' }]]);
		// here ==>
		if (completed % 20 === 0) {
			// progress.log(`${sprintf('%3s%% complete', asInteger.format(completed))}`);
			progress.log(`${completed.toString().padStart(3, ' ')}% complete`);
		}
		// <== here

		setTimeout(function () {
			downloading();
		}, 50);
	}
}

downloading();
