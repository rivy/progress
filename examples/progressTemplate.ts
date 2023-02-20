import ProgressBar from '../mod.ts';

const goal = 100;

const progress = new ProgressBar({
	goal,
	barSymbolComplete: '=',
	barSymbolIncomplete: '-',
	// here ==>
	// progressTemplate: ':bar'
	// progressTemplate: ':bar :elapsed'
	// progressTemplate: '[:bar]'
	// progressTemplate: 'hello :bar world'
	progressTemplate: ':value/:goal hello! :elapsed [:bar] :percent (:rate; eta :eta)',
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
