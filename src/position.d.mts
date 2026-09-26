export function words(text: string): string;
export function blockStarts(keys: string[], lines: string[]): number[];
export function blockAt(starts: number[], line: number): number;
export function count(text: string, key: string): number;
export function nth(text: string, key: string, n: number): number;
