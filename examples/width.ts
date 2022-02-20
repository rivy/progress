import Progress from '../mod.ts';

const title = 'interval:';
const goal = 100;

const progress = new Progress({
	title,
	goal,
	// here ==>
	// width: 20
	progressBarWidth: 1000, // longer than the terminal width
	// <== here
});

let completed = 0;

function downloading() {
	if (completed <= goal) {
		progress.update(completed++);

		setTimeout(function () {
			downloading();
		}, 100);
	}
}

downloading();
