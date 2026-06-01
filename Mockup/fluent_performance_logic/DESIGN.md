---
name: Fluent Performance Logic
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
  on-surface-variant: '#414752'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#717783'
  outline-variant: '#c1c6d4'
  surface-tint: '#005eb1'
  primary: '#004f96'
  on-primary: '#ffffff'
  primary-container: '#0067c0'
  on-primary-container: '#dbe7ff'
  inverse-primary: '#a6c8ff'
  secondary: '#735c00'
  on-secondary: '#ffffff'
  secondary-container: '#fed65b'
  on-secondary-container: '#745c00'
  tertiary: '#17575c'
  on-tertiary: '#ffffff'
  tertiary-container: '#357075'
  on-tertiary-container: '#b6f1f7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d5e3ff'
  primary-fixed-dim: '#a6c8ff'
  on-primary-fixed: '#001c3b'
  on-primary-fixed-variant: '#004787'
  secondary-fixed: '#ffe088'
  secondary-fixed-dim: '#e9c349'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#b1edf2'
  tertiary-fixed-dim: '#96d1d6'
  on-tertiary-fixed: '#002022'
  on-tertiary-fixed-variant: '#074f54'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-xl:
    fontFamily: Inter
    fontSize: 44px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  tabular-nums:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  sidebar-width: 260px
  container-padding: 2rem
  gutter: 1rem
  card-gap: 1.5rem
  compact-row: 0.5rem
---

## Brand & Style

This design system is engineered for high-performance sales environments, blending the precision of enterprise software with the ethereal, layered aesthetic of modern desktop operating systems. The brand personality is **authoritative, transparent, and momentum-driven**. It aims to evoke a sense of "organized power"—where complex data feels light and navigable rather than overwhelming.

The visual style utilizes **Glassmorphism** heavily influenced by Windows 11 "Mica" effects. This involves multi-layered surfaces with varying degrees of translucency and background blur to establish a clear spatial hierarchy. The result is a UI that feels integrated into the desktop environment, prioritizing focus through depth and subtle motion.

## Colors

The palette is anchored by **Trustworthy Corporate Blue**, representing stability and the systematic nature of sales tracking. **Gold/Amber** is reserved for "Gold Sell" events and performance peaks, serving as a high-reward success indicator.

To support the four key metrics, the following semantic assignments are used:
- **Gold Bar & Jewelry:** The secondary Gold (#D4AF37).
- **Product Quantity:** The primary Corporate Blue (#0067C0).
- **1kg Big Bar:** The tertiary Deep Teal (#004B50).
- **General Targets:** Neutral Slate.

The background uses a "Mica" approach: a base of Soft Slate (#F8FAFC) that allows desktop wallpapers or underlying layers to subtly influence the tint through high-radius background blurs.

## Typography

**Inter** is utilized for its exceptional legibility in data-dense environments and its robust support for OpenType features. Because this is a sales tracking tool, **Tabular Figures (tnum)** must be enabled for all data tables and KPI readouts to ensure vertical alignment of digits, facilitating easier comparison across rows.

A tight typographic scale is used to maintain high information density without sacrificing clarity. Labels and auxiliary data utilize uppercase styling with increased letter spacing to differentiate from primary body content. Large display sizes are reserved for "Hero KPIs" and annual targets.

## Layout & Spacing

The layout follows a **Hybrid Fluid Grid** model optimized for desktop viewing. A fixed-width Sidebar Navigation (260px) provides persistent access to global views, while the main content area expands to fill the remaining horizontal space.

Components within the dashboard are arranged on an 8px grid system. For data tables, a "Compact" spacing mode is the default, using 8px vertical padding to maximize visible records. Dashboards utilize a 12-column layout for widgets, allowing for flexible arrangements of radial gauges, line charts, and metric cards. On ultra-wide monitors, content is capped at a maximum width of 1600px to prevent excessive line lengths.

## Elevation & Depth

This design system uses **Tonal Glassmorphism** to define hierarchy. Unlike traditional shadow-heavy designs, depth is created through:

1.  **Backdrop Blurs:** Secondary layers (like sidebars and modals) use a 30px-40px background blur with a 60% white tint.
2.  **Inner Strokes:** All glass containers feature a 1px semi-transparent white top/left border to simulate a "beveled" edge catching light, with a darker 1px stroke on the bottom/right.
3.  **Elevation Tiers:**
    *   **Level 0 (Base):** Mica-effect background.
    *   **Level 1 (Cards):** Translucent white with subtle 4px ambient shadow.
    *   **Level 2 (Modals/Popovers):** Higher opacity, 12px shadow, distinct border stroke.

## Shapes

The shape language is **geometric and professional**. A "Soft" roundedness (4px - 8px) is applied to standard UI elements like input fields, buttons, and table rows to align with the Fluent Design aesthetic. 

- **Buttons & Inputs:** 4px (Soft) for a crisp, functional feel.
- **Data Cards:** 8px (Rounded-lg) to soften the large data containers.
- **Sync Indicators:** Circular (Full) to represent continuous flow and status.

## Components

### Sidebar Navigation
Utilizes the "Acrylic" effect. Icons are outlined (2px stroke), with active states indicated by a primary blue vertical bar on the left edge and a subtle grey fill.

### Data Tables
Tables support inline editing. Hovering over a cell reveals a subtle ghost-border; clicking transforms the cell into an active input field. Zebra striping is achieved via 2% opacity shifts rather than solid color fills.

### KPI Radial Gauges
Used for Gold Sell targets. The track is a light neutral grey, while the progress bar uses the Gold (#D4AF37) gradient. The center of the gauge displays the percentage in `tabular-nums`.

### Buttons
- **Primary:** Solid #0067C0 with white text.
- **Secondary (Action):** Ghost buttons with 1px primary border and glass background.
- **Success:** Solid #D4AF37 for high-value completions.

### Input Fields
Soft Slate background with a bottom-only 2px blue border that animates into view on focus. Labels are persistent in the `label-md` style above the field.

### Sync Status
A small, persistent indicator in the top-right or sidebar footer. A pulsing green dot signifies "Live," while a rotating amber icon indicates an active sync.