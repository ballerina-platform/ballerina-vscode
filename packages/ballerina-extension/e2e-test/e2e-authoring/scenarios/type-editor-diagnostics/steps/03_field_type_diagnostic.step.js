{
  const frame = await getBIWebview();

  await frame.getByRole('button', { name: 'Add Type' }).click({ force: true });

  // The tab buttons sit outside the viewport at this window size, so a pointer
  // click (even force:true) is refused — dispatch a real DOM click.
  const content = frame.locator('[data-testid="create-from-scratch-tab"]');
  if (!(await content.isVisible().catch(() => false))) {
    await domClick(frame.getByRole('button', { name: 'Create from scratch' }));
  }
  await content.waitFor({ state: 'visible', timeout: 30000 });
  await frame.getByRole('textbox', { name: 'Name' }).first().fill('DiagnosticsProbe');
  console.log('New Type panel open, name DiagnosticsProbe');

  // add-field-button is a div wrapping a vscode-button — the handler is on the
  // inner button, so a DOM click on the div does nothing; force-click it, and
  // retry because it can be reported outside the viewport while the panel is
  // still laying out.
  const addField = frame.locator('[data-testid="add-field-button"]');
  const addDeadline = Date.now() + 30000;
  while (Date.now() < addDeadline) {
    if (await frame.locator('[data-testid="type-field"]').count()) break;
    await addField.scrollIntoViewIfNeeded().catch(() => {});
    await addField.click({ force: true, timeout: 5000 }).catch(() => {});
    await window.waitForTimeout(1000);
  }
  const idField = frame.locator('[data-testid="identifier-field"]').last();
  await idField.dblclick();
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await window.keyboard.type('probe');

  // Point the field's Type at a type that does not exist in the project.
  const typeField = frame.locator('[data-testid="type-field"]').last();
  await typeField.dblclick();
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await window.keyboard.type('NoSuchTypeHere');
  // The type helper panel opens on focus and covers the form — dismiss it.
  await window.keyboard.press('Escape');
  console.log('filled field type: NoSuchTypeHere');

  // The diagnostic renders through TextField's errorMsg -> ErrorBanner, which
  // carries no data-testid; its only stable marker is the warning codicon.
  // Validation is debounced 250ms and then round-trips to the language server,
  // and the banner can briefly show the message for an intermediate keystroke,
  // so wait for the settled text rather than the first one that appears.
  const banner = content.locator('div:has(> i.codicon-warning)');
  const expected = "undefined type 'NoSuchTypeHere'";
  const deadline = Date.now() + 60000;
  let texts = [];
  while (Date.now() < deadline) {
    texts = (await banner.allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean);
    if (texts.includes(expected)) break;
    await window.waitForTimeout(500);
  }
  if (!texts.includes(expected)) {
    throw new Error(
      `expected the field-type diagnostic ${JSON.stringify(expected)}, got ${JSON.stringify(texts)} — ` +
      'pre-fix this stayed empty because expressionEditor/diagnostics was sent a bare "types.bal" (PR #961)'
    );
  }
  console.log('FIELD TYPE DIAGNOSTIC: ' + JSON.stringify(texts));
}
