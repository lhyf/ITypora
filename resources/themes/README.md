# Local theme bundle

`npm run themes:bundle -- "C:\Users\root\AppData\Roaming\Typora\themes"`
adds the top-level CSS themes from that directory to a local installer. Fonts,
images and CSS imports are embedded for offline use; available font/license
notices are copied into `licenses/`. The original theme directory is unchanged.

Generated `manifest.json`, CSS and notices are ignored by Git. They are local,
user-provided assets, retain their original licenses and are not relicensed
under Itypora's MIT license. This directory remains optional: a build without
a generated manifest includes only Itypora's three original themes.

Bundled themes are installed as editable user copies. Upgrades add new themes,
preserve existing files/selections and do not restore themes the user deleted.
