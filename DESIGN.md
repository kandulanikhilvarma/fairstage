---
name: Fairstage
description: Clear terms and visible pay for interview rounds.
colors:
  blue: "#273bd7"
  blue-dark: "#1d2fae"
  lime: "#d8f35f"
  ink: "#141b33"
  muted: "#535f77"
  ice: "#f2f5fb"
  line: "#dce2ed"
  white: "#fff"
  green: "#166447"
  danger: "#a62437"
  blue-soft: "#edf0ff"
  on-blue-muted: "#e7ebff"
  workspace-bg: "#f7f8fc"
  pale-surface: "#fafbfe"
  field-line: "#c4ccdc"
  focus: "#7888ff"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(2.4rem, 4.5vw, 4.5rem)"
    fontWeight: 800
    lineHeight: 1.16
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(1.9rem, 3vw, 3rem)"
    fontWeight: 800
    lineHeight: 1.16
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 700
    lineHeight: 1.16
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Public Sans, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Public Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 600
rounded:
  field: "7px"
  button: "8px"
  panel: "12px"
  radius: "14px"
  disc: "50%"
spacing:
  compact: "8px"
  control: "12px"
  content: "18px"
  group: "20px"
  panel: "25px"
  section: "30px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.white}"
    rounded: "{rounded.button}"
    padding: "12px 22px"
  button-primary-hover:
    backgroundColor: "{colors.blue-dark}"
  button-lime:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "12px 22px"
  button-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.button}"
    padding: "12px 22px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "12px 22px"
  field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "11px 12px"
  panel:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.panel}"
  status:
    rounded: "5px"
    padding: "4px 9px"
---

# Design System: Fairstage

## Overview

**Creative North Star: "Civic co-op"**

Fairstage uses direct type, blue fields, and clear rows to make interview terms easy to compare. Lime gives actions and prompts a visible place.

Public pages use broad color areas and large headings. The workspace uses compact labels, white panels, and visible dividers. Both surfaces show amounts beside round details.

**Key Characteristics:**

- Blue fields with white content.
- Lime actions and prompts.
- Connected rounds with visible amounts.
- Flat panels with clear borders.

## Colors

Blue and lime give the product its identity. Cool neutrals keep dense records readable.

### Primary

- Civic blue identifies links, primary buttons, amounts, and large public fields. Deep blue is the primary hover color.
- Soft blue marks active navigation, funded states, and round icons.

### Secondary

- Agreement lime fills public calls to action and workspace prompts. Ink text remains visible on lime.

### Tertiary

- Release green identifies released pay.
- Dispute red identifies disputes and errors.

### Neutral

- Ink carries main text and dark actions.
- Muted text carries descriptions and secondary details.

- White carries panels and content on blue.
- Ice carries notices and control groups.
- The workspace background separates panels from the page.
- Pale surfaces carry table headers and the footer.

- Line and field-line separate records and outline fields.
- Focus outlines show keyboard focus.
- Muted text on blue uses the dedicated pale blue value.

**The Action Context Rule.** Use blue actions on neutral surfaces. Use lime actions on blue fields.

## Typography

**Display Font:** Manrope with a sans-serif fallback.

**Body Font:** Public Sans with a sans-serif fallback.

Manrope gives headings and amounts strong shapes. Public Sans keeps terms, controls, and records readable at smaller sizes.

### Hierarchy

- Display uses the fluid first-level scale in the frontmatter.
- Headlines use the fluid second-level scale.
- Titles use the smaller Manrope scale.

- Body text uses Public Sans. Paragraphs have a maximum width of 70ch.
- Labels use compact Public Sans. Navigation uses weight 500; field labels use weight 600.

The public hero has a larger local scale (clamp(3.4rem, 6.6vw, 6rem)). Its line height is 1.06 and its letter spacing is -0.04em.
Workspace headings use 31px. Panel titles use 18px. Secondary text uses 11px to 13px.

**The Amount Rule.** Keep monetary amounts clear within their row. Use Manrope for large summary amounts.

## Layout

The public container centers content at a maximum width of 1220px. Its desktop gutters total 80px.
The hero uses a wider container of 1400px and a grid of 1.4fr to 1fr.
The hero dimensions describe the shipped hero, not a required layout for every page.

The workspace has a 240px sidebar and a flexible main area. Content has a maximum width of 1280px and horizontal padding of 38px.
Panels use compact gaps and repeated padding. The frontmatter records the recurring spacing values, not a strict mathematical scale.

At 900px, the public hero becomes one column. The sidebar becomes a top area with horizontal navigation.
Public gutters total 48px at this width. At 620px, gutters total 36px and workspace padding becomes 18px.
Small screens use single-column forms and statistics. Tables keep horizontal scroll.

## Elevation & Depth

Surfaces are flat at rest. Borders and background colors separate panels from the page.
Buttons gain a soft shadow on hover. The selected role control and mobile menu use light shadows.
The sidecar records their exact CSS values.

**The Flat Panel Rule.** Use borders and color changes to separate record panels. Keep panel backgrounds flat.

## Shapes

Buttons have small rounded corners. Panels and round rows have larger corners.
Fields and navigation have compact corners. The shared radius token applies to pricing panels and the calculator.
Circles enclose round numbers, icons, and avatars. Use stroke SVG icons for actions and navigation.

## Components

### Buttons

Buttons have a minimum height of 48px and a 12px icon gap. Their text uses Public Sans at 14px and weight 600.
Primary buttons use blue. Lime buttons use ink text. Dark buttons use white text.

Secondary buttons use transparent backgrounds and an inset border. Hover fills them with ice.

Small buttons have a minimum height of 40px. Disabled buttons have opacity 0.55 and a wait cursor.
Background and shadow transitions take 0.18s.

### Chips

Status chips use compact rounded rectangles with text labels. Funded states use soft blue; released states use pale green.
Offered states use pale amber. Disputes use pale red. The text names the state so color has secondary meaning.

### Cards / Containers

Panels and statistics use white backgrounds, line borders, and panel corners. Headers separate from content with a thin divider.
Typical panel content uses the panel spacing token. Statistics use 23px by 25px padding.
Panels clip content at their corners. Table wrappers permit horizontal scroll.

### Inputs / Fields

Fields use white backgrounds and a thin field-line border. Their minimum height is 46px.
Labels sit above their fields. Hint text uses the muted color.
Keyboard focus uses a 3px outline with a 4px offset. Error notices use red text and pale red backgrounds.

### Navigation

Public navigation sits in a white header. Links turn blue on hover.
At 900px, a menu button opens vertical navigation below the header.
Workspace navigation uses compact rows with stroke icons. The active route uses blue text on soft blue.

### Round path

The public round path connects numbered circles to white rows. Each row groups its icon, duration, and amount.
The amount sits at the right edge. Lines express round order; a final row states the pay outcome.
Small screens reduce row padding and circle size without removal of the amounts.

## Do's and Don'ts

### Do:

- **Do** use the Action Context Rule for primary actions.
- **Do** keep round amounts beside their terms.
- **Do** pair state colors with text labels.
- **Do** keep keyboard focus visible.
- **Do** honor the reduced-motion preference.
- **Do** keep demo labels beside fictional data.

### Do not:

- **Do not** replace the display font with a system display face.
- **Do not** use text glyphs as action icons.
- **Do not** use hard offset shadows in this visual system.
- **Do not** add decorative eyebrow labels above headings.
