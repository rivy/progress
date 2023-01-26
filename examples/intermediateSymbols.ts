import { /* bgGreen, */ bgWhite, green } from 'https://deno.land/std@0.74.0/fmt/colors.ts';
import Progress from '../mod.ts';

const goal = 1000;

const progress = new Progress({
	goal,
	// Note: on Windows, if UTF-8 is not the default encoding for the terminal, such characters will not be displayed as expected.
	// ==> here
	// symbolComplete: bgGreen('*'),
	symbolIntermediate: [
		bgWhite(green('▏')),
		bgWhite(green('▎')),
		bgWhite(green('▍')),
		bgWhite(green('▌')),
		bgWhite(green('▋')),
		bgWhite(green('▊')),
		bgWhite(green('▉')),
		// bgWhite(green('-')),
		// bgWhite(green('/')),
		// bgWhite(green('|')),
		// bgWhite(green('\\')),
		// bgWhite(green('-')),
		// bgWhite(green('/')),
		// bgWhite(green('|')),
		// bgWhite(green('\\')),
	],
	// <== here
});

let completed = 0;

function downloading() {
	if (completed <= goal) {
		progress.update(completed++);

		setTimeout(function () {
			downloading();
		}, 10);
	}
}

downloading();
