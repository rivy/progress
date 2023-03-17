import { bgBrightRed, bgCyan, bgYellow } from 'https://deno.land/std@0.74.0/fmt/colors.ts';
import Progress from '../mod.ts';

const goal = 100;

const progress = new Progress({ goal, barSymbolIncomplete: bgBrightRed(' ') });

let completed = 0;

function run() {
	let symbol;
	if (completed >= 20) symbol = bgYellow(' ');
	if (completed >= 50) symbol = bgCyan(' ');
	progress.update(completed++, { barSymbolIncomplete: symbol });
	if (completed <= goal) {
		setTimeout(function () {
			run();
		}, 50);
	}
}

run();
