# HealthMap360 interface review and visual refresh

Review date: November 8, 2026 (America/Edmonton). Scope: the existing application,
including sign-in/registration/recovery, Overview, Weekly review and its fictional
demo, map, Reports & data, investigations and detail, alerts, feeds, Data health,
publication review, public reports, resources, Settings and shared forms.

This is an expert-style heuristic/code/visual inspection supported by browser
checks. It is not a user study, a clinical validation, or a WCAG conformance
certification. Aesthetic judgments below are design judgments, not measured user
preferences. Existing authorization and public/private data boundaries remain
unchanged. No user health records or account permissions were modified.

## Assessment

The application already had useful safety and interpretation features: explicit
reporting dates, missing-data states, unassessed observations, provenance/history,
confirmed destructive actions, private publication drafts and a fictional demo.
Its initial presentation made these strengths harder to discover. A long flat
navigation, small low-contrast secondary type, repeated guidance panels and
similar-looking cards gave it a generic administrative-dashboard appearance.
Mobile navigation consumed too much space before reaching a page's content.

The direction is **Field Observatory**: deep ink navigation, warm paper surfaces,
teal actions, restrained mint highlights, editorial section labels, consistent
line icons and tabular numeric typography. Meaningful warning colors retain
written labels. Decoration is limited to brand treatment and the sign-in panel;
charts and controls carry the actual evidence.

## Nielsen's ten heuristics

Severity is a reviewer judgment: 0 = no issue observed, 1 = cosmetic, 2 = moderate
usability friction, 3 = major accessibility/task barrier, 4 = task blocker.
Ratings describe the baseline, not a quantified usability score.

| Heuristic | Baseline finding / severity | Implemented response | Remaining validation |
| --- | --- | --- | --- |
| 1. Visibility of system status | 2: page context and progress competed with general copy; generic data-management badge conveyed little. | Route-aware header and browser title; explicit private-workspace label; preserved loading/error/success announcements, source dates and missing-report states. | Test comprehension of freshness and rule evaluations with analysts. |
| 2. Match with the real world | 2: a flat technical navigation obscured the evidence-to-response sequence. | Observe, Coordinate, Evidence, Publish & manage groups; supporting workflow guide; plain labels retained. | Validate terminology and group membership with intended users. |
| 3. User control and freedom | 2: mobile navigation occupied substantial space; some tables were not keyboard-scrollable. | Native modal mobile menu with Escape/focus restoration; skip link; focusable named table regions; preserved cancellation, restore/archive and explicit publication controls. | Assistive-technology review of every error/cancellation path. |
| 4. Consistency and standards | 2: mixed symbol icons, uneven secondary text and inconsistent page beginnings. | Shared SVG icons, reusable navigation, common tokens, buttons, focus styles, surfaces and section rhythm. Settings title precedes security controls; alert-history option moved near filters. | Monitor future screens for adherence to the shared styles. |
| 5. Error prevention | 1: safeguards were strong but competed visually with other content. | Preserve confirmations, validation and protected actions; keep critical warnings visible; distinguish destructive action styling; do not imply that the map or counts constitute a diagnosis. | Clinical/source/privacy policies remain human responsibilities. |
| 6. Recognition rather than recall | 2: users needed to remember where related tasks lived. | Visible workflow groups, selected-route marker and breadcrumb-like page context; demo and guide accessible from the workspace. | Test findability with new users. |
| 7. Flexibility and efficiency | 2: repeated explanations and broad mobile navigation slowed recurring tasks. | Compact weekly-review shortcut, quick mobile destinations, keyboard skip, chart data tables, preserved URL filters and exports. | Measure time to complete a weekly review against the baseline workflow. |
| 8. Aesthetic and minimalist design | 2: similarly weighted cards and long instructions pushed data down the page. | Stronger heading/metric hierarchy, compact monitoring strip, reduced guidance duplication, disclosure for interpretation/CSV/security details, calmer information surfaces. | Validate density and scan speed with real datasets and users. |
| 9. Error recognition and recovery | 1: retry and actionable errors existed, but their presentation lacked contrast. | Higher-contrast error/success treatments, visible focus, consistent controls; existing actionable API messages and retry paths preserved. | Test service outages, slow networks and complex invalid files with assistive technology. |
| 10. Help and documentation | 2: explanations were scattered across pages. | In-app five-step workspace guide, explicit demo entry and contextual interpretation disclosures; mobile menu includes the guide. | Evaluate whether support requests decline during the pilot. |

The framework is attributed to Jakob Nielsen / Nielsen Norman Group:
https://www.nngroup.com/articles/ten-usability-heuristics/

## CRAP principles

| Principle | Assessment and change |
| --- | --- |
| Contrast | Increase separation between navigation and content, primary and secondary actions, large numbers and explanatory copy. Darken low-contrast text and borders; preserve named assessment/status labels rather than color-only meaning. |
| Repetition | One token palette, icon family, control treatment, numbered metrics, page heading structure, table style and focus indicator across private/public screens. |
| Alignment | Consistent page gutters, chart/card grids, grouped navigation and table spacing. Mobile layouts stack or scroll inside bounded, keyboard-accessible regions. |
| Proximity | Related navigation links form workflow groups; alert filters sit together; account security is grouped with account information; primary results are separated from optional method explanations. |

These principles are associated with Robin Williams, *The Non-Designer's Design
Book*: https://www.peachpit.com/store/non-designers-design-book-9780133966152

## Accessibility evidence and limits

The baseline axe scan covered 36 screen/dialog states, including desktop/mobile
routes and the principal create forms. It found 41 rule/state violation groups affecting 690 element instances (including repeated navigation across pages), with failures in 33 of 36 states. These are repeated instances, not 690 unique design defects. Its main failures were text contrast,
unnamed duplicate landmarks, content outside landmarks and keyboard-inaccessible
scroll regions. The raw scan was retained locally during implementation; browser
test attachments contain the final results.

Implemented improvements:

- Higher-contrast foregrounds, controls, statuses and charts, with explicit text
  alongside color. Native controls keep visible borders and at least 24px target
  dimensions; most actions are 44px high, table actions are 36px.
- A visible-on-focus skip link that focuses the main landmark without changing
  the hash-router URL. Unique labels for navigation/map and table regions.
- Native modal dialog behavior retained, with explicit focus restoration to the
  invoking control after close. Menu/guide and Escape/focus return
  receive dedicated browser tests. A visible focus ring is shared across links,
  buttons, inputs, summaries and scroll regions.
- Keyboard-scrollable tables and explicit column headers; trend and disease
  chart values are also available as text tables. The map's report list remains
  an alternative to selecting geographic markers.
- Reduced-motion rules and forced-colors border/selection support. System fonts
  and bundled SVG icons introduce no external font/image dependency.
- Automated reflow/overflow and accessibility checks cover 1440px, 390px and 320px
  layouts; horizontal scrolling is contained within data-table regions.

Reference target: applicable WCAG 2.2 A/AA criteria, including contrast, keyboard
operation, bypass blocks, focus visibility, reflow, target size and name/role/value.
https://www.w3.org/WAI/WCAG22/quickref/

Automated checks do not establish complete compliance. Screen-reader testing with
VoiceOver/NVDA, browser zoom/text-spacing overrides, OS high-contrast behavior,
map/chart interpretation, dynamic announcements, localization and disabled-user
usability testing still need independent validation. Third-party map tiles are
not loaded during deterministic tests; bundled outlines, reports and application
controls remain testable. No external accessibility certification is claimed.

## Screen-specific decisions

- **Overview:** distinctive first metric, numbered supporting metrics, compact
  review shortcut and monitoring strip; evidence context and chart tables remain
  available without long introductory panels.
- **Weekly review:** consistent surfaces and readable comparison tables; concise
  method banner with full details on demand; fictional-demo status retained.
- **Map:** map/list relationship preserved, named reporting-area landmark and
  explicit source context. External tile failures do not remove the report list.
- **Reports:** table typography/scrolling improved; concise CSV guidance with
  setup requirements on demand. Full-file validation and history are preserved.
- **Investigations:** consistent cards, owner/lifecycle labels, situation updates,
  clear observation table and existing explicit linkage model.
- **Alerts:** page heading first, historical control grouped with filters;
  separate evidence and acknowledgement/resolution action groups.
- **Feeds / Data health:** harmonized source cards, status/error treatment, visible
  metadata and focusable synchronization/source tables.
- **Publication review / public portal:** shared identity with a visibly simpler
  public layout. Warnings, approved-snapshot meaning and privacy boundaries remain.
- **Resources:** readable inventory table and consistent assignment dialog.
- **Settings:** account summary/password form grouped; authenticator details are
  disclosed on demand; location and role tables remain distinct. Mandatory MFA
  enrollment remains enforced before privileged access.
- **Authentication:** a distinctive dark editorial introduction, higher-contrast
  form, account recovery language and landmark coverage.

## Verification record

The revised automated scan passed with zero detected violations across 51 final scan states
(three authentication states, fourteen routes at three widths, five create
dialogs, and the mandatory authenticator-enrollment screen). Keyboard tests also scan the guide and mobile-navigation dialog. They
verify skip navigation on a non-home hash route, focus staying within a modal,
Escape returning focus to the invoking button, and navigation after dismissing
the mobile drawer. The original functional workflows remain in the suite.

A baseline scan is reproducible by setting HEALTHMAP_AUDIT_BASELINE=1; the normal
suite always asserts no violations. It attaches raw results and screenshots.
The native loopback preview was inspected separately with its existing data.
All 156 saved observations, 3,190,006 reported cases and 11 locations were retained.
Final build/lint/unit/workflow and CI results are provided in the implementation
handoff. Formal assistive-technology/user testing remains outstanding as above.

## Maintenance

The main design tokens are in frontend/src/theme.css. Structural component styles
remain in index.css. Navigation groups live in lib/navigation.ts; icons and the
shared guide are local components. The accessibility suite is in
frontend/e2e/zz-ui-accessibility.spec.ts and runs with the existing browser suite.
The axe dependency is development-only. Production data behavior and backend
schema did not change in this iteration.

Local completion checks: production build, ESLint, Prettier and 15 unit tests
passed. All 11 browser workflows passed; the expanded accessibility and keyboard
suite was rerun after the mandatory-enrollment heading improvement and passed
again. Native browser inspection also confirmed the workflow guide and Escape
restoring focus. Public deployment was not performed.
