import Progress from '../mod.ts';

const progress = new Progress({
	label: 'backward',
	goal: 100,
	// progressTemplate: '{percent}% * {value}/{goal} ({elapsed}s)',
});

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
		// FixME: add option to complete() which determines final cursor rest (default = 'afterBlock')
		//    ... if no more display output, 'blockEnd' for WinOS will give same display appearance as POSIX 'afterBlock' for shell prompt placement
		progress.complete();
		console.log('info: application complete.');
	} else {
		setTimeout(backward, 50);
	}
}

forward();
