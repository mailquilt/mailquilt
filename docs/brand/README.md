# Mail Quilt logo kit

## Files

### Full logo (symbol + name)

| File | Use it for |
| --- | --- |
| `svg/mailquilt-logo.svg` | Main logo, on light backgrounds |
| `svg/mailquilt-logo-dark.svg` | Main logo, on dark backgrounds |
| `svg/mailquilt-logo-mono-black.svg` | One colour, black: print, badges, single-ink uses |
| `svg/mailquilt-logo-mono-white.svg` | One colour, white, on dark or photo backgrounds |
| `png/mailquilt-logo(-dark)-720.png`, `-1440.png` | PNG copies, transparent background |
| `svg/mailquilt-wordmark(-dark).svg` | The name alone, for tight horizontal spaces |

### Symbol only

| File | Use it for |
| --- | --- |
| `svg/mailquilt-mark.svg` | The symbol, in colour, on light backgrounds |
| `svg/mailquilt-mark-dark.svg` | The symbol, in colour, on dark backgrounds |
| `svg/mailquilt-mark-mono-black.svg` / `-mono-white.svg` | One-colour symbol |
| `png/mailquilt-mark(-dark)-256/512/1024.png` | PNG copies, transparent background |
| `svg/` and `png/mailquilt-avatar-*` | Square icon for the GitHub org avatar, npm profile, social accounts |

### Web and GitHub

| File | Use it for |
| --- | --- |
| `svg/favicon.svg` | Browser favicon; switches to light blocks when the browser is in dark mode |
| `favicon.ico` | Favicon fallback for older browsers (16, 32 and 48 px) |
| `png/apple-touch-icon.png` | iOS home-screen icon (180 px) |
| `png/social-preview.png` | GitHub social preview, 1280 × 640. Upload in the repo's Settings → Social preview |

All lettering is converted to shapes, so the SVGs look the same everywhere, with no font needed. The gap between the envelope and the dotted slot is a real cut-out, so the symbol sits cleanly on any colour.

## Colours and type

- Ink `#111113` (dark backgrounds: `#F0F6FC`)
- Accent `#D4380F`: the envelope and the dot on the i
- "quilt" grey `#71717A` (dark backgrounds: `#8B949E`)
- Font: Space Grotesk Bold, letter-spacing −0.05em

Keep clear space around the logo of at least the height of one block in the symbol, and don't recolour, stretch or rearrange its parts.

## README header (switches with GitHub's light and dark themes)

```html
<p align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="./docs/brand/svg/mailquilt-logo-dark.svg"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="./docs/brand/svg/mailquilt-logo.svg"
    />
    <img
      alt="Mail Quilt"
      src="./docs/brand/svg/mailquilt-logo.svg"
      width="360"
    />
  </picture>
</p>
```

## Website favicon

```html
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```
