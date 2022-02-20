import Progress from '../mod.ts';

const title = 'interval:';
const goal = 100;

const progress = new Progress({ title, goal });

let completed = 0;

function downloading() {
	if (completed <= goal) {
		progress.update(completed++);
		// here ==>
		if (completed % 20 === 0) progress.log(completed);
		// <== here

		setTimeout(function () {
			downloading();
		}, 50);
	}
}

downloading();
