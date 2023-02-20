// `deno run --allow-run $0`

// spell-checker:ignore (libs) denque (shell/cmd) netsh wlan (WLAN) BSSID

// ToDO: add input checking for ESC/CR/q or Q and swallow

// ref: [How to manage wifi networks from CMD](https://www.windowscentral.com/how-manage-wireless-networks-using-command-prompt-windows-10) @@ <https://archive.is/KAF2I> , <https://archive.is/jz5xy>
// ref: <https://www.kapilarya.com/fix-the-hosted-network-couldnt-be-started-in-windows-10> @@ <https://archive.is/lHhzH>

// ref: <https://www.juniper.net/documentation/en_US/junos-space-apps/network-director3.7/topics/concept/wireless-ssid-bssid-essid.html> @@ <https://archive.is/gtmDY>

import * as Colors from 'https://deno.land/std@0.126.0/fmt/colors.ts';

export const decoder = new TextDecoder(); // default == 'utf=8'
// export const encoder = new TextEncoder(); // *always* 'utf-8'
export const decode = (input?: Uint8Array): string => decoder.decode(input);
// export const encode = (input?: string): Uint8Array => encoder.encode(input);

// import Progress from 'https://cdn.jsdelivr.net/gh/rivy/progress@1d0758f6f7/mod.ts';
import Progress from './../mod.ts';

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
		signal: Colors.bgGreen(' '),
		background: Colors.bgWhite(' '),
	},
	{ dBm: -60, quality: 'good', signal: Colors.bgGreen(' '), background: Colors.bgWhite(' ') },
	{
		dBm: -67,
		quality: 'reliable',
		signal: Colors.bgCyan(' '),
		background: Colors.bgWhite(' '),
	},
	{ dBm: -70, quality: 'weak', signal: Colors.bgMagenta(' '), background: Colors.bgYellow(' ') },
	{ dBm: -80, quality: 'unreliable', signal: Colors.bgRed(' '), background: Colors.bgYellow(' ') },
	{ dBm: -90, quality: 'bad', signal: Colors.bgBrightRed(' '), background: Colors.bgMagenta(' ') },
];

function qualityLevelInfo(dBm: number) {
	return qualityLevels.find((e) => dBm >= e.dBm) ?? qualityLevels[qualityLevels.length - 1];
}

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

try {
	const s: Deno.Signal[] = (isWinOS && ($semver
			.satisfies(Deno.version.deno, '>=1.23.0'))
		? ['SIGBREAK'] as Deno.Signal[]
		: [])
		.concat(['SIGINT']);
	// console.warn('Listen for %s signals', JSON.stringify(s));
	s.forEach((signalType) =>
		Deno.addSignalListener(signalType, () => {
			exit_requested = true;
		})
	);
} catch (_e) {
	// console.warn('Caught exception...', { _e });
}

// console.warn('Script is initialized and starting...');

const nReadings = /* 10 */ Infinity;
const arr: Map<string, string>[] = [];
const goal = 100;
const progress = new Progress({
	title: 'WiFi Signals',
	goal,
	autoComplete: false,
	// hideCursor: true,
});

// progress.log('WiFi Signals (via `log()`)');

// ref: [Infinite loops and SIGINT (aka, "don't block the JS event loop")](https://stackoverflow.com/questions/22594723/how-does-catching-ctrl-c-works-in-node) @@ <https://archive.is/BZRKM>
// ref: [NodeJS ~ SIGINT and loops](https://github.com/nodejs/node/issues/9050)
let index = 0;
const _ = setInterval(async function () {
	// for (let index = 0; !exit_requested && (index < nReadings); index++) {
	index = (index < Number.MAX_SAFE_INTEGER) ? index + 1 : index;
	if (index > nReadings) exit_requested = true;
	// console.warn({ index, exit_requested });
	// ToDO: debounce signalQuality results
	const { signalQuality, wifiInterfaceData } = exit_requested
		? { signalQuality: NaN, wifiInterfaceData: undefined }
		: await (async () => {
			const output = await netshWlanShowInterfaces();
			const wifiInterfaceData = netshOutputToMaps(output)
				?.filter((e) => e.has('Name') && e.has('BSSID'))
				.map((e) => e.set('@', new Date().toISOString()));
			// console.warn({ wifiInterfaceData });
			wifiInterfaceData?.forEach((e) => arr.push(e));
			const signalQuality = Number(wifiInterfaceData?.[0]?.get('Signal')?.match(/\d+/));
			return { signalQuality, wifiInterfaceData };
		})();
	if (!exit_requested && !Number.isNaN(signalQuality)) {
		const dBm = dBmFromQuality(signalQuality);
		const qualityLevel = qualityLevelInfo(dBm);
		// console.warn({ signalQuality, dBm, qualityLevel });
		const prefix = `${wifiInterfaceData?.[0]?.get('@')} :: ${
			wifiInterfaceData?.[0]?.get('Name') ?? 'unknown'
		} @ ${dBm.toFixed(1)} dBm`;
		// const suffix = `${wifiInterfaceData?.[0]?.get('Name')}`;
		progress.update(signalQuality, {
			barSymbolComplete: qualityLevel.signal,
			barSymbolIncomplete: qualityLevel.background,
			progressTemplate: `${prefix} * {percent} * {bar} *`,
		});
	} else {
		progress.complete();
		Deno.exit(0);
	}
	// }
}, 0);
