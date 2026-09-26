export type FormatEdit = { start: number; end: number; text: string; selectionStart: number; selectionEnd: number };
export type TableSize = { columns: number; rows: number };
export const tableLimits: TableSize;
export function createMarkdownTable(columns: number, rows: number): string;
export function context(text: string, start: number): { lines: string[]; starts: number[]; row: number; code: { first: number; last: number; fence: string } | null; table: { first: number; last: number } | null; list: boolean; task: boolean; heading: number };
export function formatEdit(command: string, text: string, start: number, end: number, tabSize?: number, tableSize?: TableSize): FormatEdit;
