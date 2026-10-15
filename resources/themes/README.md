# Bundled themes

The following eight user-selected themes ship with ITypora, in addition to
its three original colour schemes:

- Clarity Dark (`clarity-dark.css`)
- Clarity (`clarity.css`)
- GitHub (`github.css`)
- Light Mind Dark (`lightmind-dark.css`)
- Light Mind (`lightmind.css`)
- Matcha Dark (`matcha-dark.css`)
- Matcha (`matcha.css`)
- MorandiGarden (`morandigarden.css`)

The compiled CSS, `manifest.json` and available font/license notices in
`licenses/` are committed so GitHub Actions can package them on every platform
without accessing a developer's local Typora installation. Fonts, images and
CSS imports are embedded for offline use. These themes retain their original
licenses and are not relicensed under ITypora's MIT license.

To regenerate these eight themes from an updated source directory:

```sh
npm run themes:bundle -- "C:\path\to\Typora\themes"
```

The bundler requires all eight entry CSS files, removes obsolete generated CSS
from this directory and leaves the source directory unchanged.

Bundled themes are installed as editable user copies. Upgrades add new themes,
preserve existing files/selections and do not restore themes the user deleted.
