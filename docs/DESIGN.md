# Design brief — The Private Press

OmniQR is a small digital print shop. Each code is presented as a proof pulled from a quiet print room: warm stock, forest ink, a terracotta registration mark, crop corners, and compact production metadata. The user's OmniQR mark sits beside a restrained editorial wordmark. Content icons share one 24-unit outline grid and a 1.55px stroke.

## Tokens

| Role | Fallback | OKLCH enhancement |
| --- | --- | --- |
| Paper | `#F5F0E6` | `oklch(96% .018 82)` |
| Ink | `#193A32` | `oklch(31% .045 168)` |
| Clay accent | `#BA4C32` | `oklch(54% .16 35)` |
| Surface | `#FFFDF8` | `oklch(99% .009 85)` |
| Quiet rule | `#D8D1C4` | `oklch(86% .018 82)` |
| Supporting text | `#676F65` | `oklch(47% .025 145)` |

Semantic roles are `--paper`, `--ink`, `--muted`, `--line`, `--surface`, `--soft`, and `--accent`. Five named palettes—Linen, Night Shift, Terracotta Press, Olive Grove, and Ink—are paired with System. The user accent picker sets the accent token while retaining the selected palette. Dark palettes use a light logo mark.

## Type and layout

Georgia is the editorial display face, Segoe UI is the control and reading face, and Consolas is used for proof data. This local system stack needs no remote font request. Fluid type uses `clamp()` from compact labels through the page display. Spacing tokens use a 4px base and 8px multiples (4, 8, 12, 16, 24, 32, 48, 64). Radii are 3, 8, and 16px; rules are one-pixel hairlines; paper cards use a diffuse shadow plus a small hard registration offset.

Motion uses 150ms and 240ms transitions with an ease-out curve. View Transitions are progressive enhancement; reduced-motion disables reveal and transition effects. Tap actions keep short press feedback. A faint four-pixel stock grid gives paper texture without a remote texture image.

## Components and responsive behavior

The generator remains the hero. Desktop places content and styling beside a sticky QR proof. Phones place the live proof above the form, then expose a thumb-zone action bar and style bottom sheet. A full-height mobile navigation sheet uses safe areas, focus containment, Escape, swipe-to-close, and history handling. The footer groups product, resources, and privacy links around a quiet developer credit and trust strip.

Below-the-fold explainers use numbered print steps and native accessible FAQ disclosure rows. Controls preserve 44px touch targets, inputs stay at 16px minimum to avoid iOS focus zoom, and the layout is capped at large desktop widths. High contrast, forced colors, reduced motion, and standalone display modes have explicit rules.

The brand source is cropped to its QR emblem, trimmed to its visible alpha bounds, and contained without distortion. PWA icons use a paper ground; the maskable icon's mark stays well inside the central safe area. OG artwork uses the same paper, forest, and clay palette.
