---
name: Design System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3c4a42'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#6c7a71'
  outline-variant: '#bbcabf'
  surface-tint: '#006c49'
  primary: '#006c49'
  on-primary: '#ffffff'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#4edea3'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#494bd6'
  on-tertiary: '#ffffff'
  tertiary-container: '#9699ff'
  on-tertiary-container: '#1d17b2'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

The brand personality of this design system is centered on **growth, precision, and vitality**. It targets high-performance teams and individual professionals who value clarity and efficiency. The UI is designed to evoke a sense of calm authority and forward momentum.

The visual style is a blend of **Minimalism** and **Modern Corporate**, utilizing generous white space and high-quality typography to ensure the interface never feels cluttered. To differentiate from standard flat designs, we employ subtle **Glassmorphism** for navigational elements and overlays, adding a layer of depth and sophistication that feels both high-tech and approachable.

## Colors

The palette is anchored by **Emerald (#10B981)** as the primary brand color, replacing all previous amber accents. This shift signifies growth and reliability. To ensure semantic clarity, the **Success** state utilizes a slightly deeper shade, **Emerald 600 (#059669)**, providing the necessary visual weight to distinguish affirmative feedback from standard interactive elements.

The secondary color is a deep **Slate (#0F172A)**, used for text and high-contrast backgrounds to provide a professional foundation. Tertiary accents in **Indigo (#6366F1)** are used sparingly for secondary data visualizations or subtle UI highlights to prevent the Emerald from becoming overwhelming.

## Typography

This design system utilizes **Hanken Grotesk** for headlines to provide a sharp, contemporary edge that feels modern and precise. Its geometric qualities ensure that large-scale titles remain legible and impactful.

For body copy and labels, **Inter** is the workhorse. It is chosen for its exceptional readability on screens and its neutral character, which allows the primary Emerald accents to lead the visual hierarchy. Use negative letter-spacing on larger display sizes to maintain a "tight" editorial feel, and transition to standard spacing for body text to prioritize legibility.

## Layout & Spacing

The layout philosophy follows a **12-column fluid grid** system. Content is contained within a maximum width of 1280px for desktop viewing, centering the experience and preventing line lengths from becoming unreadable.

We utilize an **8px base unit** for all spacing and dimensions. Gutters are fixed at 24px to provide ample breathing room between modules. On mobile devices, the side margins shrink to 16px, and the 12-column grid collapses into a single-column stack, prioritizing vertical flow and thumb-friendly interaction zones.

## Elevation & Depth

Visual hierarchy is established through **Tonal Layers** and subtle **Backdrop Blurs**. Rather than using heavy, dark shadows, this design system uses soft, low-opacity shadows with a slight tint of the primary color (Emerald) to make elements feel integrated into the environment.

*   **Level 1 (Base):** Flat surfaces with subtle 1px borders (#E2E8F0).
*   **Level 2 (Cards/Menus):** Low-contrast outlines combined with a 4px blur shadow.
*   **Level 3 (Modals/Overlays):** Glassmorphic surfaces using a 12px backdrop blur and 80% opacity backgrounds, creating a sense of physical layering without losing the context of the underlying content.

## Shapes

The shape language is **Rounded**, striking a balance between the rigidity of corporate structures and the approachability of modern startups. 

Standard components (Inputs, Buttons) use a **0.5rem (8px)** corner radius. Large containers like cards or content modules use **1rem (16px)**, while distinct floating elements like tooltips or tags use **1.5rem (24px)** to appear more "organic" and distinguishable from the main structural layout.

## Components

### Buttons
Primary buttons are solid **Emerald (#10B981)** with white text. Hover states shift the background to a slightly darker shade. Ghost buttons use an Emerald outline and text, maintaining a clear link to the primary action color without the visual weight of a solid fill.

### Input Fields
Inputs feature a 1px border in Slate-200, which transitions to a 2px **Emerald** border upon focus. Error states override this with a Red-500 border and supportive helper text.

### Chips & Tags
Chips use the **Tertiary Indigo** or a light **Emerald tint** (#D1FAE5) for categorization. They feature high roundedness (rounded-xl) to contrast against the more rectangular nature of the grid.

### Cards
Cards are the primary container for information. They should utilize the Level 2 elevation (soft shadow) and a 16px corner radius. Headlines within cards should always use Hanken Grotesk for clear information architecture.

### Success States
When a user completes an action, success indicators (icons, toast borders) must use **#059669**. This differentiates the "completion" state from the "actionable" Emerald (#10B981) used for buttons.