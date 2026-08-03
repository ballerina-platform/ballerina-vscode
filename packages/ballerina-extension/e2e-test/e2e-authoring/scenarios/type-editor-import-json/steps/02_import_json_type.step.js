{
  const frame = await getBIWebview();

  // Step 2: Click "Add Type" to open the type creation panel
  const addTypeBtn = frame.getByRole('button', { name: 'Add Type' });
  await addTypeBtn.waitFor({ timeout: 15000 });
  await addTypeBtn.click({ force: true });
  console.log('clicked Add Type');

  // Step 3-4: Verify both tabs appear and click "Import"
  const createFromScratchTab = frame.getByRole('tab', { name: 'Create from scratch' });
  await createFromScratchTab.waitFor({ timeout: 10000 });
  const importTab = frame.getByRole('tab', { name: 'Import' });
  await importTab.waitFor({ timeout: 10000 });
  await importTab.click();
  console.log('switched to Import tab');

  // Step 5: Verify Import tab content visible
  const importContent = frame.locator('[data-testid="import-tab"]');
  await importContent.waitFor({ timeout: 10000 });

  // Step 7-8: Fill the Name field (vscode-text-field renders an accessible textbox)
  const nameInput = frame.getByRole('textbox', { name: 'Name' });
  await nameInput.waitFor({ timeout: 10000 });
  await nameInput.fill('PersonJson');
  console.log('filled type name: PersonJson');

  // Step 9-10: Paste JSON into the textarea inside vscode-text-area
  const jsonTextarea = frame.locator('vscode-text-area textarea').first();
  await jsonTextarea.waitFor({ timeout: 10000 });
  await jsonTextarea.click();
  await jsonTextarea.fill('{"name": "John", "age": 30, "city": "New York"}');
  console.log('pasted JSON');

  // Step 12-13: Verify Import button is enabled and click it
  const importBtn = frame.getByRole('button', { name: 'Import' });
  await importBtn.waitFor({ state: 'visible', timeout: 10000 });
  const isDisabled = await importBtn.isDisabled();
  if (isDisabled) throw new Error('Import button is still disabled after filling name and JSON');
  await importBtn.click({ force: true });
  console.log('clicked Import');

  // Step 14-15: Wait for diagram to reload and verify type node
  const typeNode = frame.locator('[data-testid="type-node-PersonJson"]');
  await typeNode.waitFor({ timeout: 30000 });
  console.log('type-node-PersonJson visible in diagram');
}
