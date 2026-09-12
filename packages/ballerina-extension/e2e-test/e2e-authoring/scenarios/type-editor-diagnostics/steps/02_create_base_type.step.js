{
  const frame = await getBIWebview();

  // A type must already exist in the project for the redeclared-symbol
  // diagnostic in step 03 to have something to collide with.
  const addTypeBtn = frame.getByRole('button', { name: 'Add Type' });
  await addTypeBtn.waitFor({ state: 'visible', timeout: 120000 });
  await addTypeBtn.click({ force: true });

  // The panel can open on either tab. The tab buttons sit outside the
  // viewport at this window size, so a pointer click (even force:true) is
  // refused — dispatch a real DOM click.
  const openScratchTab = async () => {
    const content = frame.locator('[data-testid="create-from-scratch-tab"]');
    if (await content.isVisible().catch(() => false)) return content;
    await domClick(frame.getByRole('button', { name: 'Create from scratch' }));
    await content.waitFor({ state: 'visible', timeout: 30000 });
    return content;
  };
  await openScratchTab();

  const nameInput = frame.getByRole('textbox', { name: 'Name' }).first();
  await nameInput.waitFor({ state: 'visible', timeout: 30000 });
  await nameInput.fill('Organization');
  console.log('filled type name: Organization');

  // The new-record form starts with no field rows — add one so the record is
  // not empty.
  await frame.locator('[data-testid="add-field-button"]').click();
  const idField = frame.locator('[data-testid="identifier-field"]').last();
  await idField.dblclick();
  await idField.type('id');
  await window.keyboard.press('Escape');

  await frame.locator('[data-testid="type-create-save"]').click({ force: true });
  console.log('clicked Save');

  await frame.locator('[data-testid="type-node-Organization"]').waitFor({ timeout: 60000 });
  console.log('type-node-Organization visible in diagram');
}
