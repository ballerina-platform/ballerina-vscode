{
  const frame = await getBIWebview();

  // Reopen p:Person (saved with {name: personName, age: 30} in step 07) and
  // switch to Record mode to reach the Record Configuration modal.
  const node = frame.getByText(/p = \{/).last();
  const record = frame.locator('[data-testid="primary-mode"]');
  await reopenRecordNode(node, record);
  const overlay = await openRecordConfigModal(node, record);
  console.log('Record Configuration modal open');

  // Uncheck the optional "age" field (its checkbox is the only enabled one —
  // the required "name" field's checkbox is disabled)
  const ageCheckbox = overlay.locator('[data-testid="parameter-branch"] vscode-checkbox:not([disabled])').last();
  await ageCheckbox.waitFor({ state: 'visible', timeout: 10000 });
  await ageCheckbox.click({ force: true });
  await window.waitForTimeout(1500);
  const checkedState = await ageCheckbox.getAttribute('aria-checked');
  if (checkedState !== 'false') {
    throw new Error(`age checkbox did not uncheck: aria-checked=${checkedState}`);
  }
  console.log('age checkbox unchecked');

  // The record's Expression value must drop the age entry entirely
  const modalCm = overlay.locator('.cm-content').last();
  const exprText = (await modalCm.innerText()).replace(/\s+/g, ' ').trim();
  if (exprText.includes('age')) {
    throw new Error(`age entry still present after uncheck: ${JSON.stringify(exprText)}`);
  }
  if (!exprText.includes('name:') || !exprText.includes('personName')) {
    throw new Error(`name/personName missing after uncheck: ${JSON.stringify(exprText)}`);
  }
  console.log('expression updated, age entry removed:', JSON.stringify(exprText));

  const panel = frame.locator('[data-testid="side-panel"]').first();
  const declareSave = panel.getByRole('button', { name: 'Save' }).last();
  if (!(await declareSave.isEnabled().catch(() => false))) {
    throw new Error('Declare Variable Save is disabled after unchecking age');
  }

  await overlay.locator('vscode-button, button').first().click({ force: true });
  await window.waitForTimeout(1000);
  await dismissHelperPanel();
  await saveOpenFlowNodeForm();
  console.log('saved p without age field');

  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const deadline = Date.now() + 30000;
  let source = '';
  while (Date.now() < deadline) {
    source = fs.readFileSync(path.join(state.integrationDir, 'automation.bal'), 'utf8');
    if (!source.includes('age: 30')) break;
    await window.waitForTimeout(1000);
  }
  if (source.includes('age')) {
    throw new Error(`automation.bal still references age:\n${source}`);
  }
  if (!source.includes('name: personName')) {
    throw new Error(`automation.bal missing name field:\n${source}`);
  }
  console.log('automation.bal: Person p record literal has no age field');
}
