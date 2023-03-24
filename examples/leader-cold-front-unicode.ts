import {
	bgBlue,
	bgBrightYellow,
	bgRed,
	/* bgGreen, */ bgWhite, /* , green */
	bgYellow,
} from 'https://deno.land/std@0.74.0/fmt/colors.ts';
import Progress from '../mod.ts';

const goal = 1000;

// ToDO: check for unicode availability for emoji support o/w just use color
const progress = new Progress({
	goal,
	minUpdateInterval: 10,
	// progressBarWidthMax: 100,
	// Note: on Windows, if UTF-8 is not the default encoding for the terminal, such characters will not be displayed as expected.
	progressTemplate: '{percent}% [{bar}|{value}/{goal}] ({elapsed}s)',
	// ==> here
	// progressBarSymbolComplete: '=',
	// progressBarSymbolIncomplete: ' ',
	// progressBarSymbolLeader: '>',
	progressBarSymbolComplete: bgBlue('❄️'),
	progressBarSymbolIncomplete: bgRed('  '),
	progressBarSymbolIntermediate: [bgRed('💫'), bgBlue('💫'), bgBlue('✨')],
	progressBarSymbolLeader: bgRed('💨'),
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
