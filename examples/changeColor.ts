import { green, red, yellow } from 'https://deno.land/std@0.74.0/fmt/colors.ts';
import Progress from '../mod.ts';

const goal = 100;

const progress = new Progress({
	goal,
	barSymbolComplete: red('='),
	barSymbolIncomplete: yellow('-'),
});

let completed = 0;

function run() {
	if (completed <= goal) {
		if (completed >= 20) {
			progress.update(completed++, {
				// ==> here
				barSymbolComplete: green('='),
				barSymbolIncomplete: '-',
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
