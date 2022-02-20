import Progress from '../mod.ts';

const label = '[goal test]';
const goal = 100;

const progress = new Progress({
	label,
	// Can also be set within the render method
	// total
});

let completed = 0;

function downloading() {
	if (completed <= goal) {
		// Can also be set in the constructor
		// ==> here
		progress.update(completed++, { goal });
		// <== here

		setTimeout(function () {
			downloading();
		}, 100);
	}
}

downloading();
