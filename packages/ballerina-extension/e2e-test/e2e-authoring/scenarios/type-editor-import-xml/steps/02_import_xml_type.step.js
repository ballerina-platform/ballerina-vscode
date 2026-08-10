{
  const frame = await getBIWebview();

  // Step 2: Click "Add Type" to open the type creation panel
  const addTypeBtn = frame.getByRole('button', { name: 'Add Type' });
  await addTypeBtn.waitFor({ timeout: 15000 });
  await addTypeBtn.click({ force: true });
  console.log('clicked Add Type');

  // Step 3-4: Click the Import tab
  const importTab = frame.getByRole('tab', { name: 'Import' });
  await importTab.waitFor({ timeout: 10000 });
  await importTab.click();
  console.log('switched to Import tab');

  // Step 5: Verify Import tab content visible
  const importContent = frame.locator('[data-testid="import-tab"]');
  await importContent.waitFor({ timeout: 10000 });

  // Step 6-7: Change Format dropdown from JSON to XML
  const formatDropdown = frame.locator('vscode-dropdown#format-selector');
  await formatDropdown.waitFor({ timeout: 10000 });
  await formatDropdown.click();
  const xmlOption = frame.locator('vscode-option[value="XML"]');
  await xmlOption.waitFor({ timeout: 5000 });
  await xmlOption.click();
  console.log('format changed to XML');

  // Step 8: Verify Name field is NOT visible for XML format
  const nameInput = frame.getByRole('textbox', { name: 'Name' });
  await nameInput.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  const nameVisible = await nameInput.isVisible().catch(() => false);
  if (nameVisible) throw new Error('Name field should not be visible in XML import mode');
  console.log('confirmed: Name field not visible in XML mode');

  // Step 9-10: Paste XML into the textarea
  const xmlTextarea = frame.locator('vscode-text-area textarea').first();
  await xmlTextarea.waitFor({ timeout: 10000 });
  await xmlTextarea.click();
  await xmlTextarea.fill('<person><name>John</name><age>30</age></person>');
  console.log('pasted XML');

  // Step 12-13: Click Import
  const importBtn = frame.getByRole('button', { name: 'Import' });
  await importBtn.waitFor({ state: 'visible', timeout: 10000 });
  const isDisabled = await importBtn.isDisabled();
  if (isDisabled) throw new Error('Import button is still disabled after filling XML');
  await importBtn.click({ force: true });
  console.log('clicked Import');

  // Step 14-15: Wait for diagram reload; type name is inferred from root element "person"
  const typeNode = frame.locator('[data-testid^="type-node-"]').first();
  await typeNode.waitFor({ timeout: 30000 });
  const testId = await typeNode.getAttribute('data-testid');
  console.log(`type node visible: ${testId}`);
}
