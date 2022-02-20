import Progress from '../mod.ts';

const goal = 100;

const progress = new Progress({
	goal,
	// ==> here
	clearOnComplete: true,
	// <== here
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
