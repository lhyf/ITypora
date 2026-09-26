export type Preserver = { baseline(before: string): void; merge(after: string): string };
export function createPreserver(source: string): Preserver;
export function blocks(lines: string[]): Int32Array;
