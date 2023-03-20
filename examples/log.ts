// import { sprintf } from '../deps.ts';
// const formatAsInteger = new Intl.NumberFormat(undefined, {
// 	minimumIntegerDigits: 1,
// 	minimumFractionDigits: 0,
// 	maximumFractionDigits: 0,
// });

import * as $colors from 'https://deno.land/std@0.126.0/fmt/colors.ts';

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
		progress.update([completed, [completed, { label: 'progress *' }]]);
		// here ==>
		if (completed % 20 === 0) {
			// progress.log(`${sprintf('%3s%% complete', asInteger.format(completed))}`);
			progress.log($colors.cyan(`info: ${completed.toString().padStart(3, ' ')}% complete`));
		}
		// <== here
		// const complete = completed >= goal;
		// if (complete) {
		// 	progress.complete();
		// } else {
		setTimeout(function () {
			downloading();
		}, 50);
		// }

		completed += 1;
	}
}

downloading();
