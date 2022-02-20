import ProgressBar from '../mod.ts';

const goal = 100;

const progress = new ProgressBar({
	goal,
	symbolComplete: '=',
	symbolIncomplete: '-',
	// here ==>
	// progressTemplate: ':bar'
	// progressTemplate: ':bar :age'
	// progressTemplate: '[:bar]'
	// progressTemplate: 'hello :bar world'
	progressTemplate: ':value/:goal hello :age [:bar] :percent',
	// <== here
});

let completed = 0;

function run() {
	if (completed <= goal) {
		progress.update(completed++);

		setTimeout(function () {
			run();
		}, 100);
	}
}

run();
