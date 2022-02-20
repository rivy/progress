import Progress from '../mod.ts';

const label = 'progress:';
const goal = 100;

const progress = new Progress({
	// here ==>
	label,
	// <== here
	goal,
});

let completed = 0;

function downloading() {
	if (completed <= goal) {
		progress.update(completed++);

		setTimeout(function () {
			downloading();
		}, 50);
	}
}

downloading();
