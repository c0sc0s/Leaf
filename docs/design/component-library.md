# Leaf component library

Source preset: [shadcn Create — b2D1YJR7z](https://ui.shadcn.com/create?preset=b2D1YJR7z).
Generated with shadcn 4.21.0 using the Radix primitive base.

| Setting       | Value                           |
| ------------- | ------------------------------- |
| Style         | Luma (`radix-luma`)             |
| Base / theme  | Zinc / Leaf `#445A51`           |
| Chart palette | Leaf tonal greens               |
| Font          | Geist Variable, bundled locally |
| Icons         | Hugeicons Free                  |
| Radius        | Default                         |
| Menu accent   | Subtle                          |
| Menu color    | Inverted translucent            |

`src/theme.css` contains the light/dark tokens with the Leaf brand override and Tailwind theme. `components.json` configures future component generation. `src/components/ui/` owns buttons, input fields, native selects, textareas, dialogs, menus, tooltips, tabs, toggles, cards, badges and separators. Application controls must compose these components rather than restyle raw elements. `src/components/icons.tsx` exposes the application icon vocabulary using Hugeicons.

`src/styles.css` owns application layout and PDF-specific layers. The title bar stays 52 px tall in both library and reader views; focus mode remains compact. PDF text, page colors and annotation geometry are independent of the application theme. The native file picker input and PDF annotation hit regions retain their browser semantics.

Use semantic colors (`background`, `foreground`, `primary`, `muted`, `border`, `sidebar`) rather than fixed theme colors. Toggle the root `.dark` class together with `data-theme` so Radix portals and PDF appearance stay in sync. The inverted menus carry their own dark tokens, as defined by the preset.

To add a component:

```sh
npx shadcn add <component>
```

Geist and all icons ship inside the app. No external font or icon service is required at runtime. Existing preferences, library data and annotations use their current storage keys.

The shared `--brand` is `#445A51` in both themes. Primary button fills use it directly with white labels. Dark-theme text accents and focus indicators use a lighter tint of this color for readability; hover surfaces use subtle brand tints.
