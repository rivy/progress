import { bgRgb24 } from 'https://deno.land/std@0.74.0/fmt/colors.ts';
import ProgressBar from '../mod.ts';

const goal = 100;

const progress = new ProgressBar({ goal });

let completed = 0;

function run() {
	if (completed <= goal) {
		progress.update(completed++, {
			// ==> here
			barSymbolComplete: bgRgb24(' ', { r: 128, g: completed / goal * 255, b: 0 }),
			// <== here
		});

		setTimeout(function () {
			run();
		}, 50);
	}
}

run();
