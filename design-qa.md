# Design QA — Group master slider

- Source visual truth: `C:\Users\User\.codex\generated_images\01a211c9-b260-7220-b07a-63c6bfbcc4c3\exec-a1e4cf54-af6d-403e-9726-4f765fe33db6.png`
- Implementation screenshot: `D:\[Doc2023]\สร้างเวป เลื่อนได้\implementation-group-slider.png`
- Side-by-side evidence: `D:\[Doc2023]\สร้างเวป เลื่อนได้\design-qa-comparison.png`
- Browser URL: `http://127.0.0.1:4173/?qa=3`
- Viewport: 862 × 823 CSS px, density 1.
- Source pixels: 1326 × 1188. Implementation pixels: 862 × 823. Both were proportionally normalized to a 900 px comparison column without stretching.
- State: full-width calculator card, five allocation segments in the saved local test state, group master moved from 43% to 50%, COGS explicitly set to 100 baht.

## Full-view comparison evidence

The implementation preserves the current product surface, typography, palette, input hierarchy, segment colors, and white calculator container. The new group brackets remain subordinate to the primary allocation bar and align to the master boundary. The implementation contains five saved segments instead of the mock's four, but the component adapts correctly without changing its hierarchy.

## Focused region comparison evidence

The lower allocation region was compared directly because it contains the new interaction. Both source and implementation show two colored brackets, centered group totals, a dark vertical master handle at the shared boundary, and the helper copy beneath it. The implementation additionally demonstrates exact COGS input persistence (`100` baht = `8.33%`).

## Findings

- No actionable P0/P1/P2 mismatch remains.
- Typography: IBM Plex Sans Thai and Kanit hierarchy remains consistent with the existing app; group labels use a compact weight and remain legible.
- Spacing/layout: master handle is aligned to the shared group boundary; labels remain centered inside each group's available width.
- Colors/tokens: blue/orange and green/purple bracket treatments map to the corresponding segment colors.
- Image quality/assets: no new raster imagery is required; the feature consists only of native form controls and existing UI styling.
- Copy/content: group totals, baht amounts, and “ลากเพื่อปรับทั้งกลุ่ม” match the selected direction.

## Primary interactions tested

- Moving the group master from 43% to 50% changed all four subordinate boundaries proportionally.
- Typing COGS `100` retained exactly `100` and recalculated it to `8.33%` instead of rounding the percentage to an integer.
- The saved-state DOM exposed the group summary and master slider with accessible labels.
- Ctrl reassignment selects the nearest existing divider through `snapGroupBoundaryIndex`; automated tests cover moving to multiple candidate dividers and the no-divider fallback.
- The browser-rendered control exposes the instruction “กด Ctrl ค้างเพื่อย้ายจุดเกาะ”, while normal dragging remains the default behavior.
- Global Undo works from both the header button and `Ctrl + Z`; a browser test changed price 3,634 → 777 and restored 3,634.
- Two-tab regression check moved the master repeatedly and retained exactly three rendered segments in both tabs, preventing the reported duplicate-bar state.

## Comparison history

- Initial browser check found that automation filling the amount field did not commit until the native `change` event. Added a short input debounce so typed amounts apply without requiring a blur.
- Post-fix evidence shows COGS `100`, allocation `100 บาท`, and `8.33%` together in the browser-rendered UI.
- Added a persisted `groupBoundaryIndex` so the chosen divider survives local save, room sync, duplicate cards, and shared state serialization.
- Removed redundant full `renderSplit` calls from both master-slider finish events; the live drag already updates the existing DOM, so finishing now only closes the interaction and persists once.
- Added a bounded 50-state Undo history with 700 ms coalescing so one continuous drag becomes one Undo step.

## Follow-up polish

- [P3] Connector lines from the master handle to individual handles could be added later, but the aligned handle and live linked motion already communicate the relationship during use.

## Implementation checklist

- [x] Exact decimal percentages
- [x] Exact typed baht amounts
- [x] Proportional group movement
- [x] Locked segment preservation in calculation logic
- [x] Responsive group summary labels
- [x] Browser interaction verification

final result: passed
