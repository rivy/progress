// spell-checker:ignore (names) Deno
// spell-checker:ignore (shell) stty tput
// spell-checker:ignore (shell/CMD) CONOUT
// spell-checker:ignore (Typescript) ts-nocheck
// spell-checker:ignore (WinAPI) CSTR CWSTR LPCSTR LPCWSTR MBCS

// #DONE: ToDO: add permission gating to avoid...
// ```shell
// ⚠️  ️Deno requests run access to "cmd". Run again with --allow-run to bypass this prompt.
//    Allow? [y/n (y = yes allow, n = no deny)]  n
// ⚠️  ️Deno requests run access to "powershell". Run again with --allow-run to bypass this prompt.
//    Allow? [y/n (y = yes allow, n = no deny)]  n
// ⚠️  ️Deno requests run access to "tput". Run again with --allow-run to bypass this prompt.
//    Allow? [y/n (y = yes allow, n = no deny)]  n
// ```

//===

// * reference 'deno.unstable' to include "unstable" types for `deno check ...` and `deno run --check ...`
// ref: [Deno ~ TS configuration](https://deno.land/manual@v1.31.2/advanced/typescript/configuration) @@ <https://archive.is/SdtbZ>
/// <reference lib="deno.unstable" />
// * alternatively, use `// @ts-nocheck Bypass static errors for missing --unstable.` at the top of the file to disable static checks.

// import type * as DenoUnstable from '../../vendor/deno-unstable.lib.d.ts'; // import Deno UNSTABLE types (fails b/c of duplicate included types)

// import { assert as _assert } from 'https://deno.land/std@0.178.0/testing/asserts.ts';

//=== utils
// import { stringToCSTR, stringToCWSTR, ToUint32 } from './util.ts';

// ref: [JoelOnSoftware ~ Minimum knowledge of Unicode](https://www.joelonsoftware.com/2003/10/08/the-absolute-minimum-every-software-developer-absolutely-positively-must-know-about-unicode-and-character-sets-no-excuses) @@ <>
// ref: [JavaScript character encoding](https://mathiasbynens.be/notes/javascript-encoding) @@ <https://archive.is/yNnof>
// ref: [MSDN ~ Unicode and MBCS support](https://learn.microsoft.com/en-us/cpp/atl-mfc-shared/unicode-and-multibyte-character-set-mbcs-support) @@ <>
// ref: [MSDN ~ string conversions](https://learn.microsoft.com/en-US/sql/relational-databases/collations/collation-and-unicode-support#utf8) @@ <https://archive.is/hZvZx>
// ref: [MSDN ~ LPCSTR](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-dtyp/f8d4fe46-6be8-44c9-8823-615a21d17a61) @@ <https://archive.is/AduZv>)

// stringToCSTR()
/** Convert `s` to a WinOS-compatible NUL-terminated CSTR buffer, *dropping* any internal NUL characters.
 *
 * NOTE: supports *only* ASCII characters, silently **dropping** non-ASCII-compatible code points without error/panic.
 */
export function stringToCSTR(s: string) {
	// CSTR == NUL-terminated string of 8-bit Windows (ANSI) characters; note: ANSI representation of non-ASCII characters is code-page dependent
	// [2023-01] note: JavaScript `TextEncoder()` now only supports 'utf-8' encoding
	// * alternatively, legacy support for code-page encoding is available via `npm:text-encoding` [code @ <https://github.com/inexorabletash/text-encoding>]
	const MAX_ASCII = 127;
	const NUL = 0;
	const length = s.length; // length in UTF-16 code units
	const buffer = new ArrayBuffer((length + 1) * Uint8Array.BYTES_PER_ELEMENT);
	const u8 = new Uint8Array(buffer);
	let bufferIndex = 0;
	for (let i = 0; i <= length; i++) {
		const charCode = s.charCodeAt(i);
		if (!isNaN(charCode) && (charCode <= MAX_ASCII) && (charCode != NUL)) {
			u8[bufferIndex++] = charCode;
		}
	}
	u8[bufferIndex] = 0;
	return u8;
}

// stringToCWSTR()
/** Convert `s` to WinOS-compatible NUL-terminated wide-character string buffer (using UTF-16 encoding), *dropping* any internal NUL characters.
 *
 * Note: assumes/requires WinOS support for UTF-16 (not just UCS-2); ie, requires WinOS >= v5.0/2000.
 */
export function stringToCWSTR(s: string) {
	// CWSTR = a string of 16-bit Unicode characters (aka, wide-characters/WCHAR/wchar_t), which MAY be null-terminated
	// note: WinOS *after* Windows NT uses UTF-16 encoding; WinOS versions *prior* Windows 2000 use UCS-2 (aka UTF-16 w/o surrogate support [ie, BMP-plane-only])
	const NUL = 0;
	const length = s.length; // length in UTF-16 code units
	const buffer = new ArrayBuffer((length + 1) * Uint16Array.BYTES_PER_ELEMENT);
	const u16 = new Uint16Array(buffer);
	let bufferIndex = 0;
	for (let i = 0; i <= length; i++) {
		{
			const charCode = s.charCodeAt(i);
			if (!isNaN(charCode) && (charCode != NUL)) {
				u16[bufferIndex++] = charCode;
			}
		}
	}
	u16[bufferIndex] = 0;
	return u16;
}

// ref: inspired by [Integers and shift operators in JavaScript](https://2ality.com/2012/02/js-integers.html) @@ <https://archive.is/KdYv7>
// ref: [Wikipedia ~ Two's complement](https://en.wikipedia.org/wiki/Two%27s_complement) @@ <https://archive.is/5ROjc>
// NOTE:
// ```js
// // Range of N Bit 2's Complement => [ -1*(2**(N-1)), (2**(N-1))-1 ]
// let i_SAFE = {max: Number.MAX_SAFE_INTEGER, min: Number.MIN_SAFE_INTEGER };
// let u32 = {max: (2**32)-1, min: 0};
// let i32 = {max: (2**31)-1, min: -1*(2**31) };
// let u64 = {max: (2n**64n)-1n, min: 0n};
// let i64 = {max: (2n**63n)-1n, min: -1n*(2n**63n) };
// console.log({i_SAFE, u32, i32, u64, i64})
// ```

const pow2To32 = Math.pow(2, 32);
/** Returns `a mod b`.
 *
 * @param a ~ a numeric expression
 * @param b ~ a numeric expression
 */
function modulo(a: number, b: number) {
	return a - Math.floor(a / b) * b;
}
/** Convert `x` to an integer by dropping the fractional portion.
 *
 * @param x ~ a numeric expression
 */
function ToInteger(x: number) {
	x = Number(x);
	return x < 0 ? Math.ceil(x) : Math.floor(x);
}
/** Convert `x` to an unsigned 32-bit integer, with modulo wrap-around.
 *
 * @param x ~ a numeric expression
 */
export function ToUint32(x: number) {
	return modulo(ToInteger(x), pow2To32);
}

export function byteSizeOfNativeType(type: Deno.NativeType) {
	// spell-checker:ignore () isize
	// ref: <https://github.com/DjDeveloperr/deno/blob/4c0a50ec1e123c39f3f51e66025d83fd8cb6a2c1/ext/ffi/00_ffi.js#L258>
	switch (type) {
		case 'bool':
		case 'u8':
		case 'i8':
			return 1;
		case 'u16':
		case 'i16':
			return 2;
		case 'u32':
		case 'i32':
		case 'f32':
			return 4;
		case 'u64':
		case 'i64':
		case 'f64':
		case 'pointer':
		case 'buffer':
		case 'function':
		case 'usize':
		case 'isize':
			return 8;
		default:
			throw new TypeError(`Unsupported type: ${type}`);
	}
}

//===

const decoder = new TextDecoder(); // default == 'utf-8'
const decode = (input?: Uint8Array): string => decoder.decode(input);

const isWinOS = Deno.build.os === 'windows';

const atImportAllowFFI =
	((await Deno.permissions?.query({ name: 'ffi' }))?.state ?? 'granted') === 'granted';
const atImportAllowRead =
	((await Deno.permissions?.query({ name: 'read' }))?.state ?? 'granted') === 'granted';
const atImportAllowRun =
	((await Deno.permissions?.query({ name: 'run' }))?.state ?? 'granted') === 'granted';

type ConsoleSizeMemoKey = string;
const consoleSizeCache = new Map<ConsoleSizeMemoKey, ConsoleSize | undefined>();

//===

// export async function havePermit(name: Deno.PermissionName) {
// 	const names = [name];
// 	const permits = (await Promise.all(names.map((name) => Deno.permissions?.query({ name })))).map((
// 		e,
// 	) => e ?? { state: 'granted', onchange: null });
// 	const allGranted = !(permits.find((permit) => permit.state !== 'granted'));
// 	return allGranted;
// }

// export async function haveAllPermits(names: Deno.PermissionName[]) {
// 	const permits = (await Promise.all(names.map((name) => Deno.permissions?.query({ name })))).map((
// 		e,
// 	) => e ?? { state: 'granted', onchange: null });
// 	const allGranted = !(permits.find((permit) => permit.state !== 'granted'));
// 	return allGranted;
// }

//===

// export type ConsoleSize = { columns: number; rows: number };
export type ConsoleSize = ReturnType<typeof Deno.consoleSize>;

/** Options for ConsoleSize functions ...
 * * `consoleFileFallback` ~ fallback to use of a "console" file if `rid` and fallback(s) fail ; default = true
 * * `fallbackRIDs` ~ list of fallback resource IDs if initial `rid` fails ; default = `Deno.stderr.rid`
 * * `useCache` ~ cache/memoize prior values ; default = true
 */
export type ConsoleSizeOptions = {
	consoleFileFallback: boolean;
	fallbackRIDs: number[];
	useCache: boolean;
};

//===

/** Get the size of the console used by `rid` as columns/rows.
 * * _`no-throw`_ function (returns `undefined` upon any error [or missing `Deno.consoleSize()`])
 *
 * ```ts
 * const { columns, rows } = denoConsoleSizeNT(Deno.stdout.rid);
 * ```
 *
 * @param rid ~ resource ID
 * @tags no-throw
 */
function denoConsoleSizeNT(rid?: number) {
	// no-throw `Deno.consoleSize(..)`
	// [2020-07] `Deno.consoleSize()` is unstable API (as of v1.2+) => deno-lint-ignore no-explicit-any
	// [2022-11] `Deno.consoleSize()` (now stabilized in v1.27.0+) ignores rid (only testing stdin, stdout, and stderr rid's)
	const fn = Deno.consoleSize as (rid?: number) => ConsoleSize | undefined;
	try {
		// * `Deno.consoleSize()` throws if rid is non-TTY (including redirected streams)
		return fn?.(rid);
	} catch {
		return undefined;
	}
}

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

//===

/** Get the size of the console used by `rid` as columns/rows, using `options`.
 * * _async_
 *
 * ```ts
 * const { columns, rows } = await consoleSize(Deno.stdout.rid, {...});
 * ```
 *
 * @param rid ~ resource ID
 */
export const consoleSize = consoleSizeAsync; // default to fully functional `consoleSizeAsync()`

//=== * sync

// * `consoleSizeSync()` requires the Deno `--unstable` flag to succeed; b/c `Deno.consoleSize()` is unstable API (as of Deno v1.19.0, 2022-02-17)

// consoleSizeSync(rid, options)
/** Get the size of the console used by `rid` as columns/rows, using `options`.
 * * _unstable_ ~ requires the Deno `--unstable` flag for successful resolution (b/c the used `Deno.consoleSize()` function is unstable API [as of Deno v1.19.0, 2022-02-17])
 * * results are cached; cached entries will be ignored/skipped when using the `{ useCache: false }` option
 *
 * ```ts
 * const { columns, rows } = consoleSizeSync(Deno.stdout.rid, {...});
 * ```
 *
 * @param rid ~ resource ID
 * @tags unstable
 */
export function consoleSizeSync(
	rid: number = Deno.stdout.rid,
	options_: Partial<ConsoleSizeOptions> = {},
): ConsoleSize | undefined {
	// ~ 0.75ms for WinOS
	const options = {
		fallbackRIDs: [Deno.stderr.rid],
		consoleFileFallback: true,
		useCache: true,
		...options_,
	};
	if (options.useCache) {
		const memo = consoleSizeCache.get(JSON.stringify({ rid, options }));
		if (memo != undefined) return memo;
	}
	const size = consoleSizeViaDenoAPI(rid, options) ?? consoleSizeViaFFI();
	consoleSizeCache.set(JSON.stringify({ rid, options }), size);
	return size;
}

// consoleSizeViaDenoAPI(rid, options)
/** Get the size of the console used by `rid` as columns/rows, using `options`, via the Deno API.
 * * _unstable_ ~ requires the Deno `--unstable` flag for successful resolution (b/c the used `Deno.consoleSize()` function is unstable API [as of Deno v1.19.0, 2022-02-17])
 *
 * ```ts
 * const { columns, rows } = consoleSizeViaDenoAPI(Deno.stdout.rid, {...});
 * ```
 *
 * @param rid ~ resource ID
 * @tags unstable
 */
export function consoleSizeViaDenoAPI(
	rid: number = Deno.stdout.rid,
	options_: Partial<Omit<ConsoleSizeOptions, 'useCache'>> = {},
): ConsoleSize | undefined {
	const options = { fallbackRIDs: [Deno.stderr.rid], consoleFileFallback: true, ...options_ };
	if (denoConsoleSizeNT == undefined) return undefined;

	let size = denoConsoleSizeNT(rid);

	let fallbackRID;
	while (size == undefined && (fallbackRID = options.fallbackRIDs.shift()) != undefined) {
		// console.warn(`fallbackRID = ${fallbackRID}; isatty(...) = ${Deno.isatty(fallbackRID)}`);
		size = denoConsoleSizeNT(fallbackRID);
	}

	if ((size == undefined) && atImportAllowRead && options.consoleFileFallback) {
		// fallback to size determination from special "console" files
		// ref: https://unix.stackexchange.com/questions/60641/linux-difference-between-dev-console-dev-tty-and-dev-tty0
		const fallbackFileName = isWinOS ? 'CONOUT$' : '/dev/tty';
		const file = denoOpenSyncNT(fallbackFileName);
		// console.warn(`fallbackFileName = ${fallbackFileName}; isatty(...) = ${file && Deno.isatty(file.rid)}`);
		size = file && denoConsoleSizeNT(file.rid);
		file && Deno.close(file.rid);
	}

	return size;
}

// consoleSizeViaFFI()
/** Get the size of the console as columns/rows, via the FFI.
 * * _unstable_ ~ requires the Deno `--unstable` flag for successful resolution (b/c the used `unstable.UnsafePointer` is unstable API, as of Deno v1.19.0 [2023-01-01; rivy])
 *
 * ```ts
 * const { columns, rows } = consoleSizeViaFFI();
 * ```
 *
 * @tags allow-ffi, unstable, winos-only
 */
export function consoleSizeViaFFI(): ConsoleSize | undefined {
	// ~ 1.5 ms
	if (!isWinOS) return undefined; // WinOS-only FFI implementation
	if (!atImportAllowFFI) return undefined;
	let size: ConsoleSize | undefined = undefined;

	const unstable = (() => {
		const u = {
			dlopen: Deno.dlopen,
			UnsafePointer: Deno.UnsafePointer,
			UnsafePointerView: Deno.UnsafePointerView,
		};
		if ((Object.values(u) as (unknown | undefined)[]).every((e) => e != null)) return u;
		return undefined;
	})();
	// console.warn({ unstable });

	if (unstable != null) {
		const dllKernel = (() => {
			try {
				return unstable.dlopen('kernel32.dll', {
					'GetConsoleScreenBufferInfo':
						/* https://learn.microsoft.com/en-us/windows/console/getconsolescreenbufferinfo */ {
							parameters: ['pointer', 'buffer'],
							result: 'u32', // BOOL
						},
					'CreateFileW':
						/* https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew */ {
							parameters: ['pointer', 'u32', 'u32', 'pointer', 'u32', 'u32', 'pointer'],
							result: 'pointer', /* file handle */
						},
					'OpenFile': /* https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-openfile */
						{ parameters: ['pointer', 'pointer', 'u32'], result: 'pointer' },
				});
			} catch {
				return undefined;
			}
		})();

		// console.warn('start CreateFile');
		// ref: <https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew> @@ <https://archive.is/LbyEf>
		const CF_OPEN_EXISTING = 3;
		// ref: <https://github.com/retep998/winapi-rs/blob/5b1829956ef645f3c2f8236ba18bb198ca4c2468/src/um/winnt.rs#L1682>
		// ...
		// pub const GENERIC_READ: DWORD = 0x80000000;
		// pub const GENERIC_WRITE: DWORD = 0x40000000;
		// ...
		// pub const FILE_SHARE_WRITE: DWORD = 0x00000002;
		//...
		const FILE_SHARE_WRITE = 0x00000002;
		const GENERIC_READ = 0x80000000;
		const GENERIC_WRITE = 0x40000000;
		// ref: [Correct use of `CreateFileW()`](https://stackoverflow.com/questions/49145316/why-no-text-colors-after-using-createfileconout-to-redirect-the-console)
		const h = dllKernel?.symbols.CreateFileW(
			unstable.UnsafePointer.of(stringToCWSTR('CONOUT$')), /* lpFileName (a NUL-terminated CWSTR) */
			ToUint32(GENERIC_WRITE | GENERIC_READ), /* dwDesiredAccess */
			ToUint32(FILE_SHARE_WRITE), /* dwShareMode */
			null, /* lpSecurityAttributes (optional) */
			ToUint32(CF_OPEN_EXISTING), /* dwCreationDisposition */
			0, /* dwFlagsAndAttributes */
			null, /* hTemplateFile (optional) */
		) as Deno.PointerValue;
		// console.warn('done CreateFile');

		// NOTE: using `OpenFile()` is functionally equivalent to using `CreateFile()` but increases fn execution time from ~ 1.5 ms to ~ 5.25 ms
		// // ref: <https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-openfile>
		// // ref: <https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-ofstruct>
		// // spell-checker:ignore () OFS_MAXPATHNAME OFSTRUCT
		// const OF_READWRITE = 0x00000002;
		// const OFS_MAXPATHNAME = 128;
		// const OFSTRUCT_SIZE = 1 /* BYTE */ * 2 + 2 /* WORD */ * 3 + OFS_MAXPATHNAME;
		// const ofstruct_buffer = new Uint8Array(OFSTRUCT_SIZE);
		// // console.warn('start OpenFile');
		// const h = dllKernel?.symbols.OpenFile(
		// 	unstable.UnsafePointer.of(stringToCString('CONOUT$')), /* lpFileName (a NUL-terminated CSTR) */
		// 	unstable.UnsafePointer.of(ofstruct_buffer), /* lpReOpenBuff */
		// 	ToUint32(OF_READWRITE), /* uStyle */
		// ) as Deno.PointerValue;
		// _assert(
		// 	ofstruct_buffer[0] <= OFSTRUCT_SIZE,
		// 	`consoleSizeViaFFI(): possible buffer overrun; FFI returned a buffer size (${
		// 		ofstruct_buffer[0]
		// 	}) larger than supplied buffer size (${OFSTRUCT_SIZE})`,
		// );
		// // buffer[buffer.length - 1] = 0; // force `szPathName[]` to end with NUL character
		// // console.warn('done OpenFile', { buffer });

		const FALSE = 0;
		const INVALID_HANDLE = -1;

		// ref: <https://learn.microsoft.com/en-us/windows/console/console-screen-buffer-info-str> @@ <https://archive.is/WYQxW>
		// ref: <https://learn.microsoft.com/en-us/windows/console/console-screen-buffer-info-str> @@ <https://archive.is/WYQxW>
		// ref: [MSDN ~ SHORT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-dtyp/47b1e7d6-b5a1-48c3-986e-b5e5eb3f06d2) @@ <https://archive.is/fKKKq>)
		// ref: [MSDN ~ WORD](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-dtyp/f8573df3-a44a-4a50-b070-ac4c3aa78e3c) @@ <https://archive.is/Llj9A>)
		// CONSOLE_SCREEN_BUFFER_INFO == {
		// 	dwSize: { columns: SHORT, rows: SHORT },
		// 	dwCursorPosition: { column: SHORT, row: SHORT },
		// 	wAttributes: WORD,
		// 	srWindow: { Left: SHORT, Top: SHORT, Right: SHORT, Bottom: SHORT },
		// 	dwMaximumWindowSize: { columns: SHORT, rows: SHORT },
		// }
		const dwSize: Deno.NativeType[] = ['i16', 'i16'];
		const dwCursorPosition: Deno.NativeType[] = ['i16', 'i16'];
		const wAttributes: Deno.NativeType[] = ['u16'];
		const srWindow: Deno.NativeType[] = ['i16', 'i16', 'i16', 'i16'];
		const dwMaximumWindowSize: Deno.NativeType[] = ['i16', 'i16'];
		const CONSOLE_SCREEN_BUFFER_INFO: Deno.NativeType[] = [
			...dwSize,
			...dwCursorPosition,
			...wAttributes,
			...srWindow,
			...dwMaximumWindowSize,
		];
		const CONSOLE_SCREEN_BUFFER_INFO_size = CONSOLE_SCREEN_BUFFER_INFO.flat().reduce(
			(sum, type) => sum += byteSizeOfNativeType(type),
			0,
		);
		const infoBuffer = new Uint8Array(CONSOLE_SCREEN_BUFFER_INFO_size);
		const handle = (unstable.UnsafePointer.value(h) != INVALID_HANDLE) ? h : null;
		// console.warn({ h, handle });
		const result = handle &&
			(dllKernel?.symbols.GetConsoleScreenBufferInfo(handle, infoBuffer) ?? FALSE) != FALSE;
		const ptr = result ? unstable.UnsafePointer.of(infoBuffer) : null;
		const ptrView = ptr && new unstable.UnsafePointerView(ptr);
		const info = ptrView &&
			{
				dwSize: { columns: ptrView.getInt16(0), rows: ptrView.getInt16(2) },
				dwCursorPosition: { column: ptrView.getInt16(4), row: ptrView.getInt16(6) },
				wAttributes: ptrView.getUint16(8),
				srWindow: {
					Left: ptrView.getInt16(10),
					Top: ptrView.getInt16(12),
					Right: ptrView.getInt16(14),
					Bottom: ptrView.getInt16(16),
				},
				dwMaximumWindowSize: { columns: ptrView.getInt16(18), rows: ptrView.getInt16(20) },
			};
		// console.warn('FFI', { buffer, info });
		if (info != null) size = { columns: info.dwSize.columns, rows: info.dwSize.rows };
	}

	return size;
}

//=== * async

// * `consoleSizeAsync()` can succeed without the Deno `--unstable` flag (but requires async to enable falling back to shell executable output when `Deno.consoleSize()` is missing/non-functional)

// consoleSizeAsync(rid, options)
/** Get the size of the console used by `rid` as columns/rows, using `options`.
 * * _async_
 * * results are cached; cache may be disabled via the `{ useCache: false }` option
 * * a fast synchronous method (with fallback to multiple racing asynchronous methods) is used for a robust, yet quick, result
 *
 * ```ts
 * const { columns, rows } = await consoleSizeAsync(Deno.stdout.rid, {...});
 * ```
 *
 * @param rid ~ resource ID
 */
export function consoleSizeAsync(
	rid: number = Deno.stdout.rid,
	options_: Partial<ConsoleSizeOptions> = {},
): Promise<ConsoleSize | undefined> {
	const options = {
		fallbackRIDs: [Deno.stderr.rid],
		consoleFileFallback: true,
		useCache: true,
		...options_,
	};
	if (options.useCache) {
		const memo = consoleSizeCache.get(JSON.stringify({ rid, options }));
		if (memo != undefined) return Promise.resolve(memo);
	}
	// attempt fast API first, with fallback to slower shell scripts
	// * paying for construction and execution only if needed by using `catch()` as fallback and/or `then()` for the function calls
	// ~ 0.5 ms for WinOS or POSIX (for open, un-redirected STDOUT or STDERR, using the fast [Deno] API)
	// ~ 150 ms for WinOS ; ~ 75 ms for POSIX (when requiring use of the shell script fallbacks)
	const promise = Promise
		.resolve(consoleSizeSync(rid, options))
		.then((size) => {
			consoleSizeCache.set(JSON.stringify({ rid, options }), size);
			return size;
		})
		.then((size) => (size != undefined) ? size : Promise.reject(undefined))
		.catch((_) =>
			// shell script fallbacks
			// ~ 25 ms for WinOS ; ~ 75 ms for POSIX
			// * Promise constructors are synchronously eager, but `.then(...)/.catch(...)` is guaranteed to execute on the async stack
			// ref: https://medium.com/@mpodlasin/3-most-common-mistakes-in-using-promises-in-javascript-575fc31939b6 @@ <https://archive.is/JmH5N>
			// ref: https://medium.com/@mpodlasin/promises-vs-observables-4c123c51fe13 @@ <https://archive.is/daGxV>
			// ref: https://stackoverflow.com/questions/21260602/how-to-reject-a-promise-from-inside-then-function
			Promise
				.any([
					consoleSizeViaMode().then((size) =>
						(size != undefined) ? size : Promise.reject(undefined)
					),
					consoleSizeViaPowerShell().then((size) =>
						(size != undefined) ? size : Promise.reject(undefined)
					),
					consoleSizeViaSTTY().then((size) =>
						(size != undefined) ? size : Promise.reject(undefined)
					),
					consoleSizeViaTPUT().then((size) =>
						(size != undefined) ? size : Promise.reject(undefined)
					),
				])
				.then((size) => {
					consoleSizeCache.set(JSON.stringify({ rid, options }), size);
					return size;
				})
				.catch((_) => undefined)
		);

	return promise;
}

// consoleSizeViaMode()
/** Get the size of the console as columns/rows, using the `mode` shell command.
 *
 * ```ts
 * const { columns, rows } = await consoleSizeViaMode();
 * ```
 *
 * @tags winos-only
 */
export function consoleSizeViaMode(): Promise<ConsoleSize | undefined> {
	// ~ 25 ms (WinOS-only)
	if (!isWinOS) return Promise.resolve(undefined); // no `mode con ...` on non-WinOS platforms
	if (!atImportAllowRun) return Promise.resolve(undefined); // requires 'run' permission; note: avoids any 'run' permission prompts

	// const allowRun = (await Deno.permissions?.query({ name: 'run' }))?.state ??
	// 	'granted' === 'granted';

	const output = (() => {
		try {
			const process = Deno.run({
				cmd: ['cmd', '/d/c', 'mode', 'con', '/status'],
				stdin: 'null',
				stderr: 'null',
				stdout: 'piped',
			});
			return (process.output()).then((out) => decode(out)).finally(() => process.close());
		} catch (_) {
			return Promise.resolve(undefined);
		}
	})();

	// ref: <https://superuser.com/questions/680746/is-it-possible-to-fetch-the-current-cmd-window-size-rows-and-columns-in-window>
	// ```text
	// C:> mode con /status
	//
	// Status for device CON:
	// ----------------------
	//     Lines:          45
	//     Columns:        132
	//     Keyboard rate:  31
	//     Keyboard delay: 0
	//     Code page:      65001
	// ```
	const promise = output
		.then((text) =>
			text
				?.split(/\r?\n/)
				.filter((s) => s.length > 0)
				.slice(2, 4)
				.map((s) => s.match(/(\d+)\s*$/)?.[1])
				.filter((s) => s && (s.length > 0)) ?? []
		)
		.then((values) =>
			values.length > 0 ? { columns: Number(values[1]), rows: Number(values[0]) } : undefined
		);
	return promise;
}

// consoleSizeViaPowerShell()
/** Get the size of the console as columns/rows, using `PowerShell`.
 *
 * ```ts
 * const { columns, rows } = await consoleSizeViaPowerShell();
 * ```
 *
 * @tags winos-only
 */
export function consoleSizeViaPowerShell(): Promise<ConsoleSize | undefined> {
	// ~ 150 ms (for WinOS)
	if (!atImportAllowRun) return Promise.resolve(undefined); // requires 'run' permission; note: avoids any 'run' permission prompts
	const output = (() => {
		try {
			const process = Deno.run({
				cmd: [
					'powershell',
					'-nonInteractive',
					'-noProfile',
					'-executionPolicy',
					'unrestricted',
					'-command',
					'$Host.UI.RawUI.WindowSize.Width;$Host.UI.RawUI.WindowSize.Height',
				],
				stdin: 'null',
				stderr: 'null',
				stdout: 'piped',
			});
			return (process.output()).then((out) => decode(out)).finally(() => process.close());
		} catch (_) {
			return Promise.resolve(undefined);
		}
	})();

	const promise = output.then((text) => text?.split(/\s+/).filter((s) => s.length > 0) ?? []).then((
		values,
	) =>
		values.length > 0
			? { columns: Number(values.shift()), rows: Number(values.shift()) }
			: undefined
	);
	return promise;
}

// consoleSizeViaSTTY()
/** Get the size of the console as columns/rows, using the `stty` shell command.
 *
 * ```ts
 * const { columns, rows } = await consoleSizeViaSTTY();
 * ```
 *
 * @tags non-winos-only
 */
export function consoleSizeViaSTTY(): Promise<ConsoleSize | undefined> {
	// * note: `stty size` depends on a TTY connected to STDIN; ie, `stty size </dev/null` will fail
	// * note: On Windows, `stty size` causes odd end of line word wrap abnormalities for lines containing ANSI escapes => avoid
	if (isWinOS) return Promise.resolve(undefined);
	if (!atImportAllowRun) return Promise.resolve(undefined); // requires 'run' permission; note: avoids any 'run' permission prompts
	const output = (() => {
		try {
			const process = Deno.run({
				cmd: ['stty', 'size', 'sane'],
				stdin: 'inherit',
				stderr: 'null',
				stdout: 'piped',
			});
			return (process.output()).then((out) => decode(out)).finally(() => process.close());
		} catch (_) {
			return Promise.resolve(undefined);
		}
	})();

	const promise = output
		.then((text) => text?.split(/\s+/).filter((s) => s.length > 0).reverse() ?? [])
		.then((values) =>
			values.length > 0
				? { columns: Number(values.shift()), rows: Number(values.shift()) }
				: undefined
		);
	return promise;
}

// consoleSizeViaTPUT()
/** Get the size of the console as columns/rows, using the `tput` shell command.
 *
 * ```ts
 * const { columns, rows } = await consoleSizeViaTPUT();
 * ```
 *
 * @tags winos-only
 */
export function consoleSizeViaTPUT(): Promise<ConsoleSize | undefined> {
	// * note: `tput` is resilient to STDIN, STDOUT, and STDERR redirects, but requires two system shell calls
	if (!atImportAllowRun) return Promise.resolve(undefined); // requires 'run' permission; note: avoids any 'run' permission prompts
	const colsOutput = (() => {
		try {
			const process = Deno.run({
				cmd: ['tput', 'cols'],
				stdin: 'null',
				stderr: 'null',
				stdout: 'piped',
			});
			return (process.output()).then((out) => decode(out)).finally(() => process.close());
		} catch (_) {
			return Promise.resolve(undefined);
		}
	})();
	const linesOutput = (() => {
		try {
			const process = Deno.run({
				cmd: ['tput', 'lines'],
				stdin: 'null',
				stderr: 'null',
				stdout: 'piped',
			});
			return (process.output()).then((out) => decode(out)).finally(() => process.close());
		} catch (_) {
			return Promise.resolve(undefined);
		}
	})();

	const promise = Promise
		.all([colsOutput, linesOutput])
		.then(([colsText, linesText]) => [colsText ?? '', linesText ?? ''])
		.then(([cols, lines]) =>
			(cols.length > 0 && lines.length > 0)
				? { columns: Number(cols), rows: Number(lines) }
				: undefined
		);
	return promise;
}

// export function windowSizeViaWMIC(): Promise<ConsoleSize | undefined> { // * in pixels *
// 	if (!isWinOS) return Promise.resolve(undefined); // no `wmic` on non-WinOS platforms
// 	const output = (() => {
// 		try {
// 			const process = Deno.run({
// 				cmd: [
// 					'wmic',
// 					'path',
// 					'Win32_VideoController',
// 					'get',
// 					'CurrentHorizontalResolution,CurrentVerticalResolution',
// 				],
// 				stdin: 'null',
// 				stderr: 'null',
// 				stdout: 'piped',
// 			});
// 			return (process.output()).then((out) => decode(out)).finally(() => process.close());
// 		} catch (_) {
// 			return Promise.resolve(undefined);
// 		}
// 	})();
// 	// ref: <https://superuser.com/questions/270718/get-display-resolution-from-windows-command-line>
// 	// ```text
// 	// C:> wmic path Win32_VideoController get CurrentHorizontalResolution,CurrentVerticalResolution
// 	// CurrentHorizontalResolution  CurrentVerticalResolution
// 	// 2560                         1440
// 	// ```
// 	const promise = output
// 		.then((text) => {
// 			console.warn({ text, text_split: text?.split(/\r*\n/) });
// 			return text?.split(/\r?\n/)[1].split(/\s+/).filter((s) => s && (s.length > 0)) ?? [];
// 		})
// 		.then((values) =>
// 			values.length > 0
// 				? { columns: Number(values.shift()), rows: Number(values.shift()) }
// 				: undefined
// 		);
// 	return promise;
// }

// const consoleSizes = {
// 	consoleSizeViaDeno: await consoleSizeViaDeno(),
// 	consoleSizeViaPowerShell: await consoleSizeViaPowerShell(),
// 	consoleSizeViaSTTY: await consoleSizeViaSTTY(),
// 	consoleSizeViaTPUT: await consoleSizeViaTPUT(),
// };
