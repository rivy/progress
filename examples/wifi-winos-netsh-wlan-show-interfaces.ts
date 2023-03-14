// `deno run --allow-run $0`

// spell-checker:ignore (libs) denque (shell/cmd) netsh wlan CONOUT (WLAN) BSSID

// ToDO: add input checking for ESC/CR/q or Q and swallow

// ToDO: `maxSequentialFailures` will likely never trigger correctly
//   ... need to use current failure with history of prior IDs (and/or fetchDelays) and success rates to trigger failure exit
// FixME: `fetchDelay` of 0-10 ms causes high CPU utilization
// FixME: SIGBREAK occasionally causes `Unhandled Exception: System.NullReferenceException: Object reference not set to an instance of an object.`

// ref: [How to manage wifi networks from CMD](https://www.windowscentral.com/how-manage-wireless-networks-using-command-prompt-windows-10) @@ <https://archive.is/KAF2I> , <https://archive.is/jz5xy>
// ref: <https://www.kapilarya.com/fix-the-hosted-network-couldnt-be-started-in-windows-10> @@ <https://archive.is/lHhzH>

// ref: <https://www.juniper.net/documentation/en_US/junos-space-apps/network-director3.7/topics/concept/wireless-ssid-bssid-essid.html> @@ <https://archive.is/gtmDY>

import * as $colors from 'https://deno.land/std@0.126.0/fmt/colors.ts';
import { writeAllSync } from 'https://deno.land/std@0.126.0/streams/conversion.ts';

export const decoder = new TextDecoder(); // default == 'utf=8'
// export const encoder = new TextEncoder(); // *always* 'utf-8'
export const decode = (input?: Uint8Array): string => decoder.decode(input);
// export const encode = (input?: string): Uint8Array => encoder.encode(input);

// import Progress from 'https://cdn.jsdelivr.net/gh/rivy/progress@1d0758f6f7/mod.ts';
import Progress from './../mod.ts';

//===

// refs
// * <https://stackoverflow.com/questions/62332153/deno-callback-on-exit>
// * <https://deno.land/manual/examples/os_signals> @@ <https://archive.is/Ak1jc>
// * <https://denolib.gitbook.io/guide/advanced/process-lifecycle> @@ <https://archive.is/8jDN6>
// * [Clean up on `Deno.exit(...)`](https://github.com/denoland/deno/issues/3603)
// * [Deno ~ OS Signals](https://deno.land/manual/examples/os_signals)
// * [Deno ~ Program Lifecycle](https://deno.land/manual/runtime/program_lifecycle)
// * [MDN ~ Event](https://developer.mozilla.org/en-US/docs/Web/API/Event)

import * as $semver from 'https://deno.land/x/semver@v1.4.0/mod.ts';

const isWinOS = Deno.build.os === 'windows';
let exit_requested = false;

/** Open a file specified by `path`, using `options`.
 * * _`no-throw`_ function (returns `undefined` upon any error)
 * @returns an instance of `Deno.FsFile`
 */
function denoOpenSyncNT(path: string | URL, options?: Deno.OpenOptions) {
	// no-throw `Deno.openSync(..)`
	try {
		return Deno.openSync(path, options);
	} catch {
		return undefined;
	}
}

// restore cursor display on console (regardless of process exit path)
const ansiCSI = { showCursor: '\x1b[?25h', hideCursor: '\x1b[?25l', clearEOL: '\x1b[0K' };
['unload'].forEach((eventType) =>
	addEventListener(eventType, (_: Event) => {
		// ref: https://unix.stackexchange.com/questions/60641/linux-difference-between-dev-console-dev-tty-and-dev-tty0
		const consoleFileName = isWinOS ? 'CONOUT$' : '/dev/tty';
		const file = denoOpenSyncNT(consoleFileName, { write: true });
		if (file != null) {
			writeAllSync(file, (new TextEncoder()).encode(ansiCSI.showCursor));
			Deno.close(file.rid);
		}
	})
);

try {
	// catch SIGBREAK and SIGINT to avoid abrupt process exits
	// * use `exit_requested` as an orderly exit signal to the main application loop
	// * note: for success, requires Deno v1.23.0+ (ref: <https://github.com/denoland/deno/pull/14694> , <https://github.com/denoland/deno/releases/tag/v1.23.0>)
	const s: Deno.Signal[] = (isWinOS && ($semver
			.satisfies(Deno.version.deno, '>=1.23.0'))
		? ['SIGBREAK'] as Deno.Signal[]
		: [])
		.concat(['SIGINT']);
	s.forEach((signalType) =>
		Deno.addSignalListener(signalType, () => {
			exit_requested = true;
		})
	);
} catch (_e) {
	// console.warn('Caught exception...', { _e });
}

//===

function netshWlanShowInterfaces() {
	try {
		const process = Deno.run({
			cmd: ['netsh', 'wlan', 'show', 'interfaces'],
			stdin: 'null',
			stderr: 'null',
			stdout: 'piped',
		});
		return (process.output()).then((output) => decode(output)).finally(() => process.close());
	} catch (_) {
		return Promise.resolve(undefined);
	}
}

function netshOutputToMaps(output?: string) {
	if (output == null) return undefined;
	const LF = '\n';
	const EOL = new RegExp('\r?\n|\r', 'gms'); // WinOS, POSIX, or MacOS
	const elementRx = /^.*[:]\s*\S/;
	// // note: prior `replace()` is needed as a simple `split(`(?:${eolRes}){2}`) would otherwise incorrectly match an isolated CRLF as a double EOL
	// const sections = output.replace(EOL, LF).split(`${LF}${LF}`).filter((e) => e.match(elementRx));
	const doubleEOL = new RegExp('\r?\n\r?\n|\r\r', 'gms'); // WinOS, POSIX, or MacOS
	const sections = output.split(doubleEOL).filter((e) => e.match(elementRx));
	// console.warn({ sections });
	return sections.map((e) =>
		new Map(
			e
				.split(EOL)
				.reduce((result, e) => {
					if (e.match(elementRx)) result.push(e);
					else result.push(result.pop() + LF + e.trimStart());
					return result;
				}, [] as string[])
				.map((e) => {
					const splitAt = ' : ';
					const i = e.indexOf(splitAt);
					return [e.slice(0, i).trim(), e.slice(i + (splitAt.length)).trim()];
				}),
		)
	);
}

// WiFi signal strength
// ref: <https://www.screenbeam.com/wifihelp/wifibooster/wi-fi-signal-strength-what-is-a-good-signal> @@ <https://archive.is/nxFc3>
// ref: <https://stackoverflow.com/questions/15797920/how-to-convert-wifi-signal-strength-from-quality-percent-to-rssi-dbm>
// * linux
// ref: <https://www.cyberciti.biz/tips/linux-find-out-wireless-network-speed-signal-strength.html> @@ <https://archive.is/jDYLx>
// ref: [WSL ~ USB device support](https://github.com/microsoft/WSL/issues/2195)
// ref: [WiFi hardware access from WSL](https://github.com/microsoft/WSL/issues/1077)
// ref: <https://github.com/dorssel/usbipd-win>
// ref: <https://www.google.com/search?q=windows+wsl+wireless+info&oq=windows+wsl+wireless+info>

function dBmFromQuality(signalQuality: number) {
	return (signalQuality / 2) - 100;
}
// function qualityFromDBM(signalDBM: number) {
// 	return (signalDBM + 100) * 2;
// }

const qualityLevels = [
	{
		dBm: -50,
		quality: 'excellent',
		signal: $colors.bgGreen(' '),
		background: $colors.bgWhite(' '),
	},
	{ dBm: -60, quality: 'good', signal: $colors.bgGreen(' '), background: $colors.bgWhite(' ') },
	{
		dBm: -67,
		quality: 'reliable',
		signal: $colors.bgCyan(' '),
		background: $colors.bgWhite(' '),
	},
	{ dBm: -70, quality: 'weak', signal: $colors.bgMagenta(' '), background: $colors.bgYellow(' ') },
	{
		dBm: -80,
		quality: 'unreliable',
		signal: $colors.bgRed(' '),
		background: $colors.bgYellow(' '),
	},
	{
		dBm: -90,
		quality: 'bad',
		signal: $colors.bgBrightRed(' '),
		background: $colors.bgMagenta(' '),
	},
];

function qualityLevelInfo(dBm: number) {
	return qualityLevels.find((e) => dBm >= e.dBm) ?? qualityLevels[qualityLevels.length - 1];
}

// console.warn('Script is initialized and starting...');

const nReadings = /* 10 */ Infinity;
// const arrayForWhat: Map<string, string>[] = [];

const writer = Deno.openSync('CONOUT$', {
	/* `read` permission required to ID as TTY by `Deno.isatty()` (see GH:denoland/deno#18168) */
	read: true,
	write: true,
});
// console.warn({ writer, /* info: writer.statSync(),  */ isTTY: Deno.isatty(writer.rid) });
// writeAllSync(writer, new TextEncoder().encode('Test to CONOUT$\n'));
const progress = new Progress({
	title: 'WiFi Signals',
	// completeTemplate: 'done',
	autoComplete: false,
	// displayAlways: true, // unneeded iff `read` permission is used for `writer` (currently, 'CONOUT$')
	hideCursor: true,
	writer,
});

// console.warn({ progress });

// progress.log('WiFi Signals (via `log()`)');

// ref: [Infinite loops and SIGINT (aka, "don't block the JS event loop")](https://stackoverflow.com/questions/22594723/how-does-catching-ctrl-c-works-in-node) @@ <https://archive.is/BZRKM>
// ref: [NodeJS ~ SIGINT and loops](https://github.com/nodejs/node/issues/9050)
let index = 0;
// * debounce occasional signal acquisition failure
const maxSequentialFailures = 10;
let sequentialFailures = 0;
let totalFailures = 0;
//
let fetchDelay = 100; // ms
let fetchIntervalID = 0;
const fetchFn = async function (myID = fetchIntervalID) {
	// note: interval `fetchDelay` timing self-adjusts for fetch failures
	index = (index < Number.MAX_SAFE_INTEGER) ? index + 1 : index;
	if (index > nReadings) exit_requested = true;
	// console.warn({ index, exit_requested });
	const { signalQuality, wifiInterfaceData } = exit_requested
		? { signalQuality: NaN, wifiInterfaceData: undefined }
		: await (async () => {
			const output = await netshWlanShowInterfaces();
			const wifiInterfaceData = netshOutputToMaps(output)
				?.filter((e) => e.has('Name') && e.has('BSSID'))
				.map((e) => e.set('@', new Date().toISOString()));
			// console.warn({ wifiInterfaceData });
			// wifiInterfaceData?.forEach((e) => arrayForWhat.push(e));
			const signalQuality = Number(wifiInterfaceData?.[0]?.get('Signal')?.match(/\d+/));
			return { signalQuality, wifiInterfaceData };
		})();
	if (!exit_requested && Number.isNaN(signalQuality)) {
		totalFailures += 1;
		if (myID == fetchIntervalID) {
			sequentialFailures += 1;
			progress.log(
				`WARN: fetch failure (myID=${myID}; sequential=${sequentialFailures}; total=${totalFailures}; fetchDelay=${fetchDelay})`,
			);
			clearInterval(fetchIntervalID);
			fetchDelay += 1;
			fetchIntervalID = setInterval(fetchFn, fetchDelay);
			if (sequentialFailures > maxSequentialFailures) exit_requested = true;
		} else {
			progress.log(
				`WARN: fetch failure, unmatched ID (myID=${myID}; intervalID=${fetchIntervalID})`,
			);
		}
	} else sequentialFailures = 0;
	if (!exit_requested && !Number.isNaN(signalQuality)) {
		const dBm = dBmFromQuality(signalQuality);
		const qualityLevel = qualityLevelInfo(dBm);
		// console.warn({ signalQuality, dBm, qualityLevel });
		const prefix = `${wifiInterfaceData?.[0]?.get('@')} :: ${
			// const prefix = `${wifiInterfaceData?.[0]?.get('@')} ::\x1b[m*:: ${
			// const prefix = `${wifiInterfaceData?.[0]?.get('@')} ::😀\u{fe0e}:: ${
			// const prefix = `${wifiInterfaceData?.[0]?.get('@')} ::😀\u{fe0e}:: ${
			// const prefix = `${wifiInterfaceData?.[0]?.get('@')} ${$colors.green('::')}\u{ff0a}:: ${
			wifiInterfaceData?.[0]?.get('Name') ?? 'unknown'
		} @ ${dBm.toFixed(1)} dBm`;
		// const suffix = `${wifiInterfaceData?.[0]?.get('Name')}`;
		progress.update(signalQuality, {
			barSymbolComplete: qualityLevel.signal,
			barSymbolIncomplete: qualityLevel.background,
			progressTemplate: `${prefix} * {percent} * {bar} *`,
		});
	}
	if (exit_requested) {
		progress.complete();
		Deno.exit(0);
	}
};
fetchIntervalID = setInterval(fetchFn, fetchDelay);
