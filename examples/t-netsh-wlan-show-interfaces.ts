// `deno run --allow-run $0`

// spell-checker:ignore (libs) denque (shell/cmd) netsh wlan (WLAN) BSSID

// ref: [How to manage wifi networks from CMD](https://www.windowscentral.com/how-manage-wireless-networks-using-command-prompt-windows-10) @@ <https://archive.is/KAF2I> , <https://archive.is/jz5xy>
// ref: <https://www.kapilarya.com/fix-the-hosted-network-couldnt-be-started-in-windows-10> @@ <https://archive.is/lHhzH>

// ref: <https://www.juniper.net/documentation/en_US/junos-space-apps/network-director3.7/topics/concept/wireless-ssid-bssid-essid.html> @@ <https://archive.is/gtmDY>

import * as Colors from 'https://deno.land/std@0.126.0/fmt/colors.ts';

import { default as Denque } from 'https://esm.sh/denque@2.0.1';
// import { default as Denque } from 'https://cdn.jsdelivr.net/npm/denque@2.0.1/+esm';

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
	const eolRe = '\r?\n';
	const EOL = new RegExp(eolRe);
	const doubleEOL = new RegExp(eolRe + eolRe);
	const elementRx = /^.*[:]\s*\S/;
	const sections = output.split(doubleEOL).filter((e) => e.match(elementRx));
	return sections.map((e) =>
		new Map(
			e
				.split(EOL)
				.reduce((result, e) => {
					if (e.match(elementRx)) result.push(e);
					else result.push(result.pop() + '\n' + e.trimStart());
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

const nReadings = 10;
const arr: Map<string, string>[] = [];
const goal = 100;
const progress = new Progress({ goal, progressTemplate: ':label signal * :percent * :bar * ' });

for (let index = 0; index < nReadings; index++) {
	const output = await netshWlanShowInterfaces();
	const wifiInterfaceData = netshOutputToMaps(output)
		?.filter((e) => e.has('Name') && e.has('BSSID'))
		.map((e) => e.set('@', new Date().toISOString()));
	// console.warn({ wifiInterfaceData });
	wifiInterfaceData?.forEach((e) => arr.push(e));
	const signalQuality = Number(wifiInterfaceData?.[0].get('Signal')?.match(/\d+/));
	const dBm = dBmFromQuality(signalQuality);
	const qualityLevel = qualityLevelInfo(dBm);
	progress.update(signalQuality, {
		label: `${wifiInterfaceData?.[0].get('@')}:${wifiInterfaceData?.[0].get('Name')}:${dBm}`,
		symbolComplete: qualityLevel.signal,
		symbolIncomplete: qualityLevel.background,
	});
}

// const arr = refined?.[0] ?? [];
// const mapped = new Map(arr as [key: string, value: string][]);

// console.log({ arr });

// const q = new Denque([1, 2, 3]);
// const v = q.pop();

// console.log({ q, v });
