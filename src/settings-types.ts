export type Preferences = {
  // Width: '0' follows the theme, bare numbers use px, and percentages use a '%' suffix.
  mode: string; size: string; width: string; typewriter: boolean; fontFamily: string;
  theme: string; showStatus: boolean;
  showCount: boolean; readingSpeed: number; spellcheck: boolean; codeLineNumbers: boolean;
  autoSpace: boolean; tabSize: number;
};
export type SettingsSnapshot = { settings: Preferences; themes: { id: string; name: string; css: string; warnings: string[] }[]; themeFolder: string; themeErrors: string[]; initialized: boolean; baseCss: string };
