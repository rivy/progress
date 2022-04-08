import { MultiProgressBar } from '../mod.ts';

const title = 'download files';
const total = 100;

const bars = new MultiProgressBar({
	title,
	// clear: true,
	complete: '=',
	incomplete: '-',
	display: '[:bar] :text :percent :time :completed/:total',
});

let completed1 = 0;
let completed2 = 0;

// ref: <https://cliffy.io/keycode> , <https://cliffy.io/keypress>
// ref: [CTRL+C (in C++)](https://github.com/evgenykislov/ctrl-c)
// ref: (in use) <https://github.com/tommywalkie/gauntlet/blob/d56c48c00c30ee304dff47285f5baffb213350d6/server/dev.ts#L113-L133>
// ref: [CTRL+C (SIGHUP, SIGINT, and SIGTERM; in Rust)](https://github.com/Detegr/rust-ctrlc)

// ref: [feat(tty): add cbreak option to enable passthrough of signals](https://github.com/denoland/deno/pull/8383)
// ref: [prompt: raise SIGINT on ctrl+c](https://github.com/c4spar/deno-cliffy/pull/106)
// ref: [up down left right don't response](https://github.com/c4spar/deno-cliffy/issues/272)
// ref: [Presses of special keys are not detectable by Deno on Window](https://github.com/denoland/deno/issues/5945)

import { setHandler } from 'https://deno.land/x/ctrlc@v0.1.2/mod.ts';

const ctrlC = setHandler(() => {
	bars.console('caught CTRL+C...');
});
// ctrlC.dispose();

function downloading() {
	if (completed1 <= total || completed2 <= total) {
		completed1 += 1;
		completed2 += 2;
		bars.render([{ completed: completed1, total, text: 'file1', complete: '*', incomplete: '.' }, {
			completed: completed2,
			total,
			text: 'file2',
		}]);
		setTimeout(function () {
			downloading();
		}, 100);
	} else console.log('DONE');
}

window.addEventListener('unload', (e: Event): void => {
	console.log('onclose');
	Deno.writeAllSync(Deno.stdout, new TextEncoder().encode('\x1b[?25h'));
	console.log('cursor restored');
});

downloading();
// ctrlC.dispose();
