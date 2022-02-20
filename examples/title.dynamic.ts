import Progress from '../mod.ts';

const goal = 100;

const progress = new Progress({
	goal,
	// ==> here
	progressTemplate: ':bar :title',
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

let title = '';

function run() {
	if (completed <= goal) {
		title = ((completed % 20 === 0) ? info.next().value : title) || '';
		progress.update(completed++, { title });

		setTimeout(function () {
			run();
		}, 50);
	}
}

run();
