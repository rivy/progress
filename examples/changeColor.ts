import { green, yellow } from 'https://deno.land/std@0.74.0/fmt/colors.ts';
import Progress from '../mod.ts';

const goal = 100;

const progress = new Progress({ goal, symbolComplete: '=', symbolIncomplete: '-' });

let completed = 0;

function run() {
	if (completed <= goal) {
		if (completed >= 20) {
			progress.update(completed++, {
				// ==> here
				symbolComplete: green('='),
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
