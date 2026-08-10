{
  const frame = await getBIWebview();
  const panel = frame.locator('[data-testid="side-panel"]').first();

  // Continue editing p (form open from step 06, Expression mode active).
  // Reopen the Record Configuration modal and create a configurable from the
  // helper pane, then reference it in the record value. Keep a node locator
  // on hand too — openRecordConfigModal needs it to reopen the panel via the
  // diagram if it closes entirely mid-retry (the mode tab alone can't do that).
  const node = frame.getByText(/p = \{name/).last();
  const record = frame.locator('[data-testid="primary-mode"]');
  const overlay = await openRecordConfigModal(node, record);

  // Focusing the modal's expression editor opens the helper pane menu
  const modalCm = overlay.locator('.cm-content').last();
  await modalCm.click({ force: true });
  await window.waitForTimeout(2000);
  await frame.getByText('Configurables', { exact: true }).last().waitFor({ timeout: 15000 });
  console.log('helper pane menu visible (Inputs/Variables/Configurables/Functions)');

  // Position the insertion point: SELECT the current "Anne" value (not the
  // whole field, not left empty) via the CM API so the record's surrounding
  // structure `{name: |, age: 30}` stays intact. Creating the configurable
  // while this selection is active replaces exactly that span with the new
  // reference — no manual retype of the full literal needed afterward.
  const modalCmIndex = (await frame.locator('.cm-content').count()) - 1;
  await frame.evaluate(({ index }) => {
    const el = document.querySelectorAll('.cm-content')[index];
    const view = el.cmView.view;
    const text = view.state.doc.toString();
    const start = text.indexOf('"Anne"');
    if (start === -1) { throw new Error(`"Anne" not found in record field: ${text}`); }
    view.dispatch({ selection: { anchor: start, head: start + '"Anne"'.length } });
    view.focus();
  }, { index: modalCmIndex });
  console.log('selected "Anne" value in place (structure preserved)');

  await frame.getByText('Configurables', { exact: true }).last().click({ force: true });
  await window.waitForTimeout(1500);
  const newConfig = frame.getByText('New Configurable', { exact: false }).last();
  await newConfig.waitFor({ state: 'visible', timeout: 15000 });
  await newConfig.click({ force: true });
  await window.waitForTimeout(2000);

  // Fill the inline New Configurable form: name, type, default value
  const nameBox = frame.getByRole('textbox', { name: /Variable Name/i }).last();
  await nameBox.click({ force: true });
  await window.keyboard.type('personName', { delay: 40 });
  await window.keyboard.press('Tab');
  await window.waitForTimeout(400);
  await window.keyboard.type('string', { delay: 40 });
  await window.waitForTimeout(800);
  await window.keyboard.press('Escape');
  const cms = frame.locator('.cm-content');
  const defaultCmIndex = (await cms.count()) - 2;
  await cms.nth(defaultCmIndex).click({ force: true });
  await window.keyboard.type('"Anne"', { delay: 40 });
  await window.waitForTimeout(800);
  await window.keyboard.press('Escape');
  const saveConfig = frame.getByRole('button', { name: 'Save' }).last();
  await saveConfig.waitFor({ state: 'visible', timeout: 10000 });
  await saveConfig.click({ force: true });
  await window.waitForTimeout(2500);
  console.log('created configurable personName');

  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const configSource = fs.readFileSync(path.join(state.integrationDir, 'config.bal'), 'utf8');
  if (!configSource.includes('configurable string personName = "Anne"')) {
    throw new Error(`config.bal missing configurable:\n${configSource}`);
  }
  console.log('config.bal contains configurable');

  // The blue chip appears at the selected position — wait generously since
  // render timing varies. NOTE: closing and reopening the modal as a
  // fallback was tried and found HARMFUL in the promoted e2e suite — it
  // re-fetches the node's last SAVED value, discarding the in-progress
  // (unsaved) configurable insertion and reverting the field back to the
  // original "Anne" literal. A direct, longer wait is safer than a
  // "recovery" path that destroys the edit.
  const chip = overlay.locator('.cm-content span[contenteditable="false"]', { hasText: 'personName' }).first();
  await chip.waitFor({ state: 'visible', timeout: 30000 });
  await assertBlueChip(chip, 'configurable');
  console.log('chip rendered blue at the exact insertion point');

  // Verify the record's surrounding structure survived the insertion —
  // the field should read {name: personName, age: 30}, not a bare token
  const modalText = await overlay.locator('.cm-content').last().innerText();
  const normalized = modalText.replace(/\s+/g, ' ').trim();
  if (!normalized.includes('name:') || !normalized.includes('personName') || !normalized.includes('age: 30')) {
    throw new Error(`record structure not preserved after cursor insert: ${JSON.stringify(modalText)}`);
  }
  console.log('record structure preserved:', JSON.stringify(modalText));

  await overlay.locator('vscode-button, button').first().click({ force: true });
  await window.waitForTimeout(1000);
  await dismissHelperPanel();
  await saveOpenFlowNodeForm();
  console.log('saved p with configurable reference (no manual retype needed)');

  const source = fs.readFileSync(path.join(state.integrationDir, 'automation.bal'), 'utf8');
  if (!source.includes('Person p = {name: personName, age: 30}')) {
    throw new Error(`automation.bal missing configurable reference:\n${source}`);
  }
  console.log('automation.bal: Person p = {name: personName, age: 30}');
}
