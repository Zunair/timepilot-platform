---
description: Mobile and responsive implementation standards for future native and hybrid surfaces
paths:
  - "mobile/**"
  - "src/**/*.tsx"
---

# TimePilot Platform Mobile Instructions

## Responsive Baseline
- New UI should be verified on mobile and desktop breakpoints.
- Touch interactions must remain usable for booking-critical actions.
- Avoid desktop-only interaction assumptions.

## Mobile Reliability
- Timezone rendering and date handling must match web behavior.
- Notification and deep-link flows should include fallback behavior.
- Offline-sensitive flows should degrade gracefully.

## Accessibility
- Ensure readable typography and contrast on small screens.
- Preserve focus and screen-reader semantics for interactive elements.
