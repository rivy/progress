import Progress from '../mod.ts';

const label = 'LABEL';
const goal = 100;

const progress = new Progress({
	label,
	goal,
	// ==> here
	barSymbolComplete: '=',
	barSymbolIncomplete: '-',
	// <== here
	completeTemplate: '{percent}% {label}',
});

let completed = 0;

function run() {
	if (completed <= goal) {
		progress.update(completed++);

		setTimeout(function () {
			run();
		}, 50);
	}
}

run();
