import { bgBrightRed, bgCyan, bgYellow } from 'https://deno.land/std@0.74.0/fmt/colors.ts';
import { default as Progress, UpdateOptions } from '../mod.ts';

const goal = 100;

const progress = new Progress({ goal, progressBarSymbolIncomplete: bgBrightRed(' ') });
// console.warn({ progress });

let completed = 0;

function run() {
	// let symbol;
	// if (completed >= 20) symbol = bgYellow(' ');
	// if (completed >= 50) symbol = bgCyan(' ');
	// progress.update(completed++, { progressBarSymbolIncomplete: symbol });
	const options: UpdateOptions = {};
	if (completed >= 20) options.progressBarSymbolIncomplete = bgYellow(' ');
	if (completed >= 50) options.progressBarSymbolIncomplete = bgCyan(' ');
	progress.update(completed++, options);

	if (completed <= goal) {
		setTimeout(function () {
			run();
		}, 50);
	}
}

run();
