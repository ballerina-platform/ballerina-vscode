{
  const frame = await getBIWebview();

  // Open the type creation panel from the type diagram
  const addTypeBtn = frame.getByRole('button', { name: 'Add Type' });
  await addTypeBtn.waitFor({ state: 'visible', timeout: 15000 });
  await addTypeBtn.click({ force: true });
  console.log('clicked Add Type');
  await window.waitForTimeout(2000);

  console.log('panel snapshot:\n' + (await snapshot().catch((e) => 'snapshot err: ' + e.message)));
  console.log('testids:', JSON.stringify(await listTestIds().catch(() => [])));

  // Fill the type name (Create from scratch tab is default)
  const nameInput = frame.getByRole('textbox', { name: 'Name' }).first();
  await nameInput.waitFor({ state: 'visible', timeout: 15000 });
  await nameInput.fill('Customer');
  console.log('filled type name: Customer');

  // Add a simple field: name "id", keep/enter type "int"
  const addFieldBtn = frame.locator('[data-testid="add-field-button"]');
  await addFieldBtn.waitFor({ state: 'visible', timeout: 15000 });
  await addFieldBtn.click();
  const idField = frame.locator('[data-testid="identifier-field"]').last();
  await idField.dblclick();
  await idField.type('id');
  console.log('added field: id (default type)');

  // Save the type
  const saveBtn = frame.getByRole('button', { name: 'Save' }).first();
  await saveBtn.waitFor({ state: 'visible', timeout: 15000 });
  await saveBtn.click({ force: true });
  console.log('clicked Save');

  // Verify the type node appears in the diagram
  const typeNode = frame.locator('[data-testid="type-node-Customer"]');
  await typeNode.waitFor({ timeout: 30000 });
  console.log('type-node-Customer visible in diagram');
}
