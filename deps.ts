import cliSpinners from 'https://esm.sh/cli-spinners@2.7.0';

export { bgGreen, bgWhite } from 'https://deno.land/std@0.126.0/fmt/colors.ts';
export { sprintf } from 'https://deno.land/std@0.126.0/fmt/printf.ts';
export { writeAllSync } from 'https://deno.land/std@0.126.0/streams/conversion.ts';

export { default as cliSpinners } from 'https://esm.sh/cli-spinners@2.7.0';
// export { default as GraphemeSplitter } from 'https://esm.sh/grapheme-splitter@1.0.4';
export { default as stringWidth } from 'https://esm.sh/string-width@5.1.2';

//=== LCM of all cliSpinners frame sizes

const gcd = (a: number, b: number): number => (b == 0) ? a : gcd(b, a % b);
const lcm = (a: number, b: number) => a / gcd(a, b) * b;
const lcmOfAll = (ns: number[]) => ns.reduce(lcm, 1);
// const rng = (lo, hi) => [...Array(hi - lo + 1)].map((_, i) => lo + i);
/* const lcmRng = (lo, hi) => lcmAll (rng (lo, hi)) */
// const ns = [2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 15, 17, 23, 24, 26, 29, 30, 35, 56, 92, 256];

const cliSpinnerNames = Object.keys(cliSpinners);
const cliSpinnerFrameSizes = cliSpinnerNames.map((name) =>
	(cliSpinners as any)[name].frames.length
);

// ToDO: remove calculation time by precalculating, using result as a numeric constant, and adding test (using this algorithm) to verify correctness
export const cliSpinnersFrameLCM = lcmOfAll(
	[...new Set(cliSpinnerFrameSizes)].sort((a, b) => a - b).filter((e) => e != null),
);
