Use Samples in the WSO2 Integrator

From the "Get Started" welcome page, open the samples browser via the "Explore"
card, filter and search the list, then use one of the built-in samples and
verify the extracted project's integration overview loads in a new window.

## Steps

| # | Action | Verification |
|---|--------|-------------|
| 1 | Click "Get Started", then click "Explore" on the "Explore Pre-built Integrations and Samples" card | "Browse Samples" heading is visible with an initial results count |
| 2 | Click the "Sample" type filter button | Results count is smaller than the initial "All" count |
| 3 | Click "All" again and type "Hello World" into the search box | Exactly the "Hello World Service" sample card is shown |
| 4 | Click "Use this" on the sample card, confirm the download directory, then choose "New Window" | Downloaded sample opens in a new VS Code window and its integration overview ("Add Artifact") becomes visible |

## Gaps

- The scenario as originally written used older wording ("built in samples
  button", "All button", "use this button") from an earlier `SamplesView`
  implementation in `packages/ballerina-visualizer` (Download button, category
  `<select>`, native `showOpenDialog`). The UI that actually ships today comes
  from the `WSO2.wso2-integrator` prerequisite extension's "Browse Samples"
  page — a "Sample" / "Pre-built Integrations" type filter, a free-text search
  box, a category dropdown, and per-card "Use this" buttons. The steps above
  and the promoted spec target this current implementation.
- "Use this" calls `window.showOpenDialog` for the download directory. The
  harness sets `files.simpleDialog.enable: true`, so this renders as an
  in-workbench dialog reachable via the host workbench page (a
  `getByRole('button', { name: 'Select Folder' })`), not a real native OS
  picker — no extra harness support was needed.
- After extraction, VS Code shows a modal "Where would you like to open the
  project?" with "Current Window" / "New Window". "New Window" was used here:
  it spawns a genuinely new Electron window, picked up via
  `vscode.windows()` (comparing the window count before/after, since
  `firstWindow()` only resolves once). "Current Window" was tried first during
  authoring and left the workspace in a confusing nested-root state (the test
  workspace's own folder is the sample's parent directory), so it was dropped
  in favor of "New Window".
