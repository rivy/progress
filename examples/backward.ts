import Progress from '../mod.ts';

const progress = new Progress({ title: 'backward', goal: 100 });

let completed = 0;

function forward() {
	progress.update(completed++);
	if (completed > 60) {
		backward();
	} else {
		setTimeout(forward, 20);
	}
}

function backward() {
	// ==> here
	progress.update(--completed);
	// <== here
	if (completed == 0) {
		progress.end();
	} else {
		setTimeout(backward, 50);
	}
}

forward();
