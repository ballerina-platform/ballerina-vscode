{
  const frame = await getBIWebview();

  // PR #953: init is rendered as a FunctionCard under its own "Constructor"
  // section instead of the old read-only "Constructor: init" link.
  const constructorHeading = frame.getByText('Constructor', { exact: true });
  await constructorHeading.waitFor({ state: 'visible', timeout: 30000 });
  console.log('Constructor section heading present');

  const editInit = frame.locator('[data-testid="edit-method-button-init"]');
  await editInit.waitFor({ state: 'visible', timeout: 30000 });
  console.log('edit-method-button-init present');

  await editInit.locator('i').click({ force: true });
  console.log('clicked init edit action');

  // The card's edit action opens the Service Function form.
  const functionName = frame.getByRole('textbox', { name: /Function Name/ }).first();
  await functionName.waitFor({ state: 'visible', timeout: 30000 });
  console.log('Service Function form open');
}
