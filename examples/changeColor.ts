import { green, red, yellow } from 'https://deno.land/std@0.74.0/fmt/colors.ts';
import Progress from '../mod.ts';

const goal = 100;

const progress = new Progress({
	goal,
	progressBarSymbolComplete: red('='),
	progressBarSymbolIncomplete: yellow('-'),
	// clearOnComplete: true,
});

let completed = 0;

function run() {
	if (completed <= goal) {
		if (completed >= 50) {
			progress.update(completed++, {
				// ==> here
				progressBarSymbolComplete: green('='),
				progressBarSymbolIncomplete: '-',
				// <== here
			});
		} else if (completed >= 25) {
			progress.update(completed++, {
				// ==> here
				progressBarSymbolComplete: green('='),
				// progressBarSymbolIncomplete: '-',
				// <== here
			});
		} else {
			progress.update(completed++);
		}

		setTimeout(function () {
			run();
		}, 50);
	}
}

run();
