import { bgRgb24 } from 'https://deno.land/std@0.74.0/fmt/colors.ts';
import ProgressBar from '../mod.ts';

const goal = 100;

const progress = new ProgressBar({ goal });

interface Rgb {
	r: number;
	g: number;
	b: number;
}

const red: Rgb = { r: 128, g: 0, b: 0 };
const green: Rgb = { r: 0, g: 128, b: 0 };

function colorShift(from: Rgb, to: Rgb, fromToFraction: number): Rgb {
	return {
		r: from.r * (1 - fromToFraction) + to.r * fromToFraction,
		g: from.g * (1 - fromToFraction) + to.g * fromToFraction,
		b: from.b * (1 - fromToFraction) + to.b * fromToFraction,
	};
}

let completed = 0;

function run() {
	if (completed <= goal) {
		progress.update(completed++, {
			// ==> here
			barSymbolComplete: bgRgb24(' ', colorShift(red, green, completed / goal)),
			// <== here
		});

		setTimeout(function () {
			run();
		}, 50);
	}
}

run();
