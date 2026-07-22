# Frontend CSS Conventions

> Scope: `baseline/frontend`
>
> Goal: define a practical split between the existing MUI styling system and the existing Tailwind styling system.

---

## 1. Current Direction

This frontend already uses **both** MUI and Tailwind.

The rule for this repository is:

- If a block is **substantially reusing MUI components**, modify styles with **MUI props, `sx`, or theme overrides**.
- If a block is a **developer-owned layout or developer-owned wrapper component**, Tailwind is allowed and often simpler.

Short version:

- **MUI-heavy UI** -> use MUI styling
- **Developer-owned layout / wrapper structure** -> use Tailwind

This is a responsibility rule.

---

## 2. What the Current MUI Theme Supports

Primary files:

- `baseline/frontend/src/themes/index.jsx`
- `baseline/frontend/src/themes/palette.js`
- `baseline/frontend/src/themes/typography.js`
- `baseline/frontend/src/themes/custom-shadows.jsx`
- `baseline/frontend/src/themes/overrides/index.js`

The current theme already supports these concerns:

### 2.1 Color schemes

- light / dark color schemes
- active theme mode switching through `state.themeMode`
- palette-driven colors exposed through MUI theme tokens
- CSS variable output through `cssVariables` in `themes/index.jsx`

This means components can safely use MUI tokens such as:

- `text.primary`
- `text.secondary`
- `background.default`
- `background.paper`
- `divider`
- `grey.*`
- `primary.*`
- `secondary.*`

### 2.2 Typography

- typography is built from `themes/typography.js`
- font family comes from layout state
- base typography decisions should come from MUI variants and theme typography, not ad hoc utility classes

### 2.3 Breakpoints

The current MUI theme defines these breakpoints:

- `xs: 0`
- `sm: 768`
- `md: 1024`
- `lg: 1266`
- `xl: 1440`

These values are aligned with the Tailwind screen settings and should be treated as the canonical responsive scale for the frontend.

### 2.4 Shadows and shared visual tokens

- custom shadows are built in `themes/custom-shadows.jsx`
- common visual tokens such as divider, background, and custom shadows are available through theme variables
- component appearance should prefer these tokens over custom hard-coded CSS values

### 2.5 Global component overrides

The current theme override pipeline already covers these MUI components:

- `Badge`
- `Button`
- `ButtonBase`
- `CardContent`
- `Checkbox`
- `Chip`
- `Drawer`
- `FormHelperText`
- `IconButton`
- `InputLabel`
- `LinearProgress`
- `Link`
- `ListItemButton`
- `ListItemIcon`
- `OutlinedInput`
- `Tab`
- `TableBody`
- `TableCell`
- `TableHead`
- `TableRow`
- `Tabs`
- `Tooltip`
- `Typography`

If you are styling one of these MUI components and the change should be shared widely, the theme override layer is already the correct place to do it.

### 2.6 What MUI should own in this repository

Use MUI styling first for:

- buttons
- text fields
- dialogs
- autocomplete
- tables and cells
- chips
- icon buttons
- typography inside MUI-heavy views
- interaction states such as hover, focus, disabled, selected
- component spacing that is part of the component's visual design

In practice, if you are touching `Dialog`, `TextField`, `Button`, `TableCell`, `Autocomplete`, `Paper`, or `Typography`, default to MUI `sx` or theme.

---

## 3. What the Current Tailwind Setup Supports

Primary files:

- `baseline/frontend/tailwind.config.cjs`
- `baseline/frontend/postcss.config.cjs`
- `baseline/frontend/src/styles/globals.css`
- `baseline/frontend/src/styles/tokens.css`

The current frontend has a real Tailwind pipeline:

- `@tailwind base`
- `@tailwind components`
- `@tailwind utilities`

and Tailwind is loaded globally from `src/index.jsx` through `src/styles/globals.css`.

### 3.1 Standard utility support

The current setup supports normal Tailwind utility classes, including:

- layout: `flex`, `grid`, `block`, `hidden`
- spacing: `p-*`, `px-*`, `py-*`, `m-*`, `gap-*`
- sizing: `w-*`, `h-*`, `min-w-*`, `max-w-*`
- responsive variants: `sm:*`, `md:*`, `lg:*`, `xl:*`
- arbitrary values: `z-[1200]`, `w-[260px]`, `transition-[width,margin]`

### 3.2 Project-specific token support

The current Tailwind config extends theme tokens with project-aware names.

Supported color groups include:

- `primary.*`
- `secondary.*`
- `text`, `text-primary`, `text-secondary`
- `text-muted`
- `divider`
- `grey.100`, `grey.300`
- `surface`
- `surface-subtle`
- `border`

This is why classes such as these work:

- `text-text`
- `text-text-secondary`
- `bg-grey-100`
- `border-divider`
- `bg-surface-subtle`

These values are not random CSS. They are generated from Tailwind config and point at CSS variables or MUI palette variables.

### 3.3 Shared Tailwind token extensions

The current Tailwind setup also extends:

- spacing: `base`
- border radius: `sm`, `md`, `lg`
- shadows: `soft`, `z1`
- font families: `sans`, `display`
- screen breakpoints: `xs`, `sm`, `md`, `lg`, `xl`

### 3.4 What Tailwind should own in this repository

Use Tailwind first for:

- page-level layout wrappers
- developer-owned sections that are not MUI components themselves
- flex and grid arrangement
- responsive container switching
- spacing between blocks
- utility-driven wrappers around MUI components

Good examples:

- table shell layout wrappers
- page header layout wrappers
- custom sections built from plain `div` containers
- developer-defined cards or panels that are not trying to restyle a MUI primitive internally

---

## 4. Rules for Splitting CSS Responsibilities

The purpose of this split is not to avoid mixing libraries completely.
The purpose is to avoid **unclear ownership**.

### 4.1 Use MUI styling when the UI is MUI-owned

Choose MUI props, `sx`, or theme overrides when:

- the element is directly a MUI component
- the visual result depends on MUI states or slots
- the styling uses theme palette, typography, or component variants
- the styling is really part of the component's appearance, not just placement

Examples:

- `DialogActions` padding
- `TextField` height
- `Autocomplete` input alignment
- `Button` background / hover / disabled state
- `Typography` color inside a MUI card or dialog

### 4.2 Use Tailwind when the layout is developer-owned

Choose Tailwind when:

- the block is mostly custom layout structure
- the block is mainly about arranging children
- the wrapper is plain HTML or a developer-owned container
- the goal is fast layout composition rather than MUI component customization

Examples:

- `flex items-center justify-between gap-3`
- responsive grid sections
- page wrappers and alignment helpers
- spacing between custom sections

### 4.3 Avoid unclear mixed ownership

Do not use this pattern unless there is a strong reason:

- MUI component
- plus visual Tailwind tokens
- plus additional `sx`

For example, this is a bad ownership split:

```jsx
<Button className="text-text bg-grey-100" sx={{ borderRadius: 2 }} />
```

Here the component appearance is split across Tailwind and MUI. In this repository, that should be moved under MUI.

### 4.4 Practical decision order

When you change styles, use this order:

1. Ask whether the block is **MUI-owned** or **developer-owned**.
2. If MUI-owned, use MUI props or `sx`.
3. If developer-owned, Tailwind is acceptable.
4. If the same MUI styling repeats broadly, promote it to theme override.
5. If the same layout wrapper repeats broadly, extract a shared component.

---

## 5. Rules for `sx`

In this repository, `sx` is the default local styling tool for MUI-heavy UI.

Use `sx` for:

- local visual fixes on MUI components
- runtime-dependent styling
- small, clear component-scoped changes

Do not use `sx` for:

- large shared design rules that belong in the theme
- layout wrappers that are simpler in Tailwind
- repeated patterns that should become a shared component

---

## 6. Rules for Theme Overrides

Use theme overrides when a visual rule should apply across many MUI instances.

Typical candidates in this codebase:

- default input height
- dialog paper policy
- icon button treatment
- table cell spacing
- typography defaults for shared MUI surfaces

Do not use theme overrides for one-off page tweaks.

---

## 7. Rules for Tailwind Usage

Tailwind is allowed in this repository, but its best use is **layout-first**, not **component-skin-first**.

Preferred Tailwind usage:

- layout containers
- spacing wrappers
- responsive structure
- alignment helpers
- developer-owned custom sections

Use Tailwind more carefully when it starts to control:

- text color
- background color
- border color
- radius
- shadow
- hover or focus styling

Those are not forbidden in absolute terms, because this project already exposes token-based Tailwind colors. But if the element is substantially a MUI component, those choices should still move back to MUI ownership.

---

## 8. Default Policy

The default policy for this repository is:

- **MUI component appearance belongs to MUI**
- **Developer-owned layout can use Tailwind**
- **Repeated MUI visuals go up into theme overrides**
- **Repeated layout wrappers become shared components**

This keeps the current stack practical:

- MUI remains the main source of truth for component styling
- Tailwind remains available for fast custom layout work
- ownership stays readable during maintenance and review
- `text-xs`
- `font-bold`
- `bg-surface-subtle`
- `border-border`
- `hover:bg-white/80`
- `dark:hover:bg-white/10`

These should move to theme tokens, component props, or `sx`.

---

## 10. Practical Review Rules

During review, treat the following as code smells:

- a MUI component with a long `className` full of visual tokens
- the same `sx` object repeated in multiple files
- page files defining component defaults
- utility classes setting text, color, border, shadow, or hover state
- a local style fix that should clearly live in the theme

Use these review rules:

1. If it changes appearance, ask: why is this not in MUI?
2. If it repeats, ask: why is this not a shared component or theme override?
3. If it is a layout wrapper, ask: is utility class usage staying layout-only?

---

## 11. Default Policy

Unless there is a specific exception:

- **Appearance defaults to MUI**
- **Layout may use utility classes**
- **Repeated patterns must be extracted**
- **Global rules must move upward into the theme**

This policy is intentionally conservative. The goal is not to ban utility classes entirely, but to prevent the project from growing a second competing visual system next to MUI.