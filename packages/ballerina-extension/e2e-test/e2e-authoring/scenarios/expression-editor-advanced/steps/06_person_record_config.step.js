{
  const frame = await getBIWebview();

  // Create p:Person with a typed record literal and save. The Record mode
  // switcher only appears when EDITING a saved record-typed variable (the
  // node template must carry the record type), so creation uses the plain
  // expression editor.
  await selectFlowNode('Declare Variable', 'Statement');
  await fillFlowNodeForm({
    'Name*Name of the variable': { type: 'input', value: 'p' },
    'Type': { type: 'textarea', value: 'Person', additionalProps: { clickLabel: true } }
  });
  await dismissHelperPanel();
  const expr = frame.locator('[data-testid="side-panel"] .cm-content').last();
  await expr.click();
  await window.waitForTimeout(500);
  await cmFill('{name: "Anne", age: 30}', (await frame.locator('.cm-content').count()) - 1);
  await window.waitForTimeout(1500);
  await dismissHelperPanel();
  await saveOpenFlowNodeForm();
  console.log('saved p = {name: "Anne", age: 30}');

  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const source = fs.readFileSync(path.join(state.integrationDir, 'automation.bal'), 'utf8');
  if (!source.includes('Person p = {name: "Anne", age: 30}')) {
    throw new Error(`automation.bal missing record declaration:\n${source}`);
  }
  console.log('record literal in source verified');

  // Reopen the node: the mode switcher must offer Record / Expression.
  // CONFIRMED (verified live, 30s wait, clean state, both with and without
  // touching the Expression field): the switcher never renders while the
  // node is being CREATED, even after Type=Person is set — it only mounts
  // once the record-typed field is reopened for editing on a SAVED node.
  // Wait generously here since this is the one point it actually appears.
  const node = frame.getByText(/p = \{name/).last();
  const record = frame.locator('[data-testid="primary-mode"]');
  const expression = frame.locator('[data-testid="expression-mode"]');
  await reopenRecordNode(node, record);
  await expression.waitFor({ state: 'visible', timeout: 5000 });
  const labels = [await record.innerText(), await expression.innerText()];
  console.log('mode switcher labels:', JSON.stringify(labels));
  if (labels[0] !== 'Record' || labels[1] !== 'Expression') {
    throw new Error(`unexpected mode labels: ${JSON.stringify(labels)}`);
  }

  // Switch to Record mode and open the Record Configuration modal by
  // focusing the preview editor (retry-based helper — the click can be
  // swallowed while the panel re-renders after the mode switch)
  const overlay = await openRecordConfigModal(node, record);
  const branchText = await overlay.locator('[data-testid="parameter-branch"]').first().innerText();
  if (!branchText.includes('name') || !branchText.includes('age')) {
    throw new Error(`record field tree incomplete: ${branchText}`);
  }
  console.log('Record Configuration modal open with name/age field tree');

  // Toggling back and forth must not corrupt the value: close modal,
  // switch to Expression mode and confirm the literal is intact
  await overlay.locator('vscode-button, button').first().click({ force: true });
  await window.waitForTimeout(1000);
  await domClick(expression);
  await window.waitForTimeout(1500);
  const cmValue = await frame.locator('[data-testid="side-panel"] .cm-content').first().innerText();
  if (!cmValue.replace(/\s/g, '').includes('{name:"Anne",age:30}'.replace(/\s/g, ''))) {
    throw new Error(`value corrupted after mode toggling: ${JSON.stringify(cmValue)}`);
  }
  console.log('mode toggle preserved the record value');
}
