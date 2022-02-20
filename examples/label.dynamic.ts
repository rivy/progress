import Progress from '../mod.ts';

const goal = 100;

const progress = new Progress({
	goal,
	// ==> here
	progressTemplate: ':bar :label',
	// <== here
});

let completed = 0;

function* log() {
	yield 'INFO: started';
	yield 'WARN';
	yield 'ERROR: X';
	yield 'custom text';
	yield 'INFO: ending';
}

const info = log();

let label = '';

function run() {
	if (completed <= goal) {
		label = ((completed % 20 === 0) ? info.next().value : label) || '';
		progress.update(completed++, { label });

		setTimeout(function () {
			run();
		}, 50);
	}
}

run();
