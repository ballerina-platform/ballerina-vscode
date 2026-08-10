{
  const frame = await getBIWebview();

  // The New Type panel is already open (step 04 opened it via the explorer "+").
  const nameInput = frame.getByRole('textbox', { name: 'Name' }).first();
  await nameInput.waitFor({ state: 'visible', timeout: 15000 });
  await nameInput.fill('Order');
  console.log('filled type name: Order');

  // Add a field "customer"; double-clicking its type opens the helper panel
  await frame.locator('[data-testid="add-field-button"]').click();
  const idField = frame.locator('[data-testid="identifier-field"]').last();
  await idField.dblclick();
  await idField.type('customer');
  const typeField = frame.locator('[data-testid="type-field"]').last();
  await typeField.dblclick();
  console.log('opened helper panel from type field');

  // In the helper panel, use "Create New Type" — opens a nested type editor popup
  const createNewTypeBtn = frame.getByRole('button', { name: 'Create New Type' });
  await createNewTypeBtn.waitFor({ state: 'visible', timeout: 15000 });
  await createNewTypeBtn.click();
  console.log('clicked Create New Type');

  // Fill the popup (scoped to the modal overlay — testids are duplicated
  // between the main panel and the popup) and save it. force: true because
  // the overlay intercepts a plain click.
  const overlay = frame.locator('.unq-modal-overlay').last();
  const popupName = overlay.getByRole('textbox', { name: 'Name' }).last();
  await popupName.waitFor({ state: 'visible', timeout: 15000 });
  await popupName.fill('Address');
  const popupSave = overlay.locator('[data-testid="type-create-save"]').last();
  await popupSave.click({ force: true });
  console.log('saved new type Address from popup');

  // The popup closes and the new type is auto-assigned to the field
  await frame.locator('.unq-modal-overlay').first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  const fieldValue = await frame.getByRole('textbox', { name: 'Text field' }).last().evaluate((el) => el.value);
  if (fieldValue !== 'Address') throw new Error(`expected field type "Address", got "${fieldValue}"`);
  console.log('field type auto-assigned: Address');

  // Reopen the helper panel and verify the created type is listed, then
  // select it explicitly (scenario steps 9-10). Click only inside the overlay:
  // a bare getByText would hit the Address node in the diagram behind it.
  await typeField.dblclick();
  const overlay2 = frame.locator('.unq-modal-overlay');
  const addressOption = overlay2.getByText('Address', { exact: true }).first();
  await addressOption.waitFor({ state: 'visible', timeout: 15000 });
  console.log('helper panel lists Address under Current Integration');
  await addressOption.click({ force: true });
  // The field value re-renders after selection — poll instead of reading once
  const commitDeadline = Date.now() + 15000;
  let committed = '';
  while (Date.now() < commitDeadline) {
    committed = await frame.getByRole('textbox', { name: 'Text field' }).last().evaluate((el) => el.value);
    if (committed === 'Address') break;
    await window.waitForTimeout(500);
  }
  if (committed !== 'Address') throw new Error(`expected committed type "Address", got "${committed}"`);
  console.log('selected Address from helper panel');

  // Add another field "note" and mark it optional via the toggle next to the
  // type field (icon flips from descriptionForeground to button-background)
  await frame.locator('[data-testid="add-field-button"]').click();
  const noteField = frame.locator('[data-testid="identifier-field"]').last();
  await noteField.dblclick();
  await noteField.type('note');
  const optionalBtn = frame.locator('vscode-button[title="Set as an Optional Field"]').last();
  await optionalBtn.waitFor({ state: 'visible', timeout: 15000 });
  const inactiveCount = await optionalBtn.locator('g[fill="var(--vscode-descriptionForeground)"]').count();
  if (!inactiveCount) throw new Error('optional icon not in inactive colour before click');
  await optionalBtn.click();
  const activeDeadline = Date.now() + 10000;
  let activeCount = 0;
  while (Date.now() < activeDeadline) {
    activeCount = await optionalBtn.locator('g[fill="var(--vscode-button-background)"]').count();
    if (activeCount) break;
    await window.waitForTimeout(300);
  }
  if (!activeCount) throw new Error('optional icon colour did not change to active after click');
  console.log('added field "note", optional toggle active (icon colour changed)');

  // Save the Order type and verify diagram nodes + link
  const saveBtn = frame.locator('[data-testid="type-create-save"]').first();
  await saveBtn.click({ force: true });
  console.log('clicked Save');
  await frame.locator('[data-testid="type-node-Order"]').waitFor({ timeout: 30000 });
  await frame.locator('[data-testid="type-node-Address"]').waitFor({ timeout: 15000 });
  await frame.locator('[data-testid="node-link-Order/customer-Address"]').waitFor({ timeout: 15000 });
  console.log('Order and Address nodes plus Order/customer->Address link visible');

  // Verify generated source
  const source = await waitForTypesBalContent((s) => s.includes('Order') && s.includes('Address'));
  if (!source.includes('type Order record')) throw new Error('types.bal missing Order record:\n' + source);
  if (!source.includes('type Address record')) throw new Error('types.bal missing Address record:\n' + source);
  if (!source.includes('Address customer')) throw new Error('types.bal missing Order.customer: Address field:\n' + source);
  if (!source.includes('note?')) throw new Error('types.bal missing optional field "note?":\n' + source);
  console.log('types.bal verified: Order, Address, customer field, optional note field present');
}
