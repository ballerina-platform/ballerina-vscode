{
  const frame = await getBIWebview();

  // The init guards come from getFunctionFromSource: the name is fixed and the
  // return type field is not rendered at all.
  const nameField = frame.getByRole('textbox', { name: /Function Name/ }).first();
  if ((await nameField.inputValue()) !== 'init') throw new Error('function name is not init');
  if ((await nameField.getAttribute('readonly')) === null) throw new Error('init name field is editable');
  if ((await frame.getByRole('textbox', { name: /Return Type/ }).count()) !== 0) {
    throw new Error('return type field is rendered for init');
  }
  console.log('init guards hold: name=init readonly, no return type field');

  // ParamManager's add affordance is a LinkButton, not a <button>.
  const addParam = frame.locator('div:has(i.codicon-add) >> text=Add Parameter').first();
  await addParam.waitFor({ state: 'visible', timeout: 30000 });
  await addParam.click({ force: true });
  console.log('clicked Add Parameter');

  // FormExpressionEditor exposes its label through `arialabel` on the
  // vscode-text-area host; the editable node is the shadow-DOM textarea.
  const typeField = frame.locator('vscode-text-area[arialabel="Parameter Type"] textarea').first();
  await typeField.waitFor({ state: 'visible', timeout: 30000 });
  await typeField.click({ force: true });
  await typeField.fill('string');
  await window.waitForTimeout(2000);
  const completion = frame.getByTestId('add-type-completion');
  if (await completion.isVisible().catch(() => false)) {
    await typeField.press('Escape');
  }
  console.log('filled Parameter Type = string');

  const paramName = frame.getByRole('textbox', { name: /Parameter Name/ }).first();
  await paramName.fill('greeting');
  console.log('filled Parameter Name = greeting');

  // Add stays disabled until the form validates the typed values; a force
  // click before then silently no-ops and leaves the editor open.
  const addButton = frame.getByRole('button', { name: 'Add', exact: true });
  await addButton.waitFor({ state: 'visible', timeout: 15000 });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && await addButton.isDisabled().catch(() => true)) {
    await window.waitForTimeout(500);
  }
  await addButton.click({ force: true });

  const paramRow = frame.getByTestId('greeting-item');
  await paramRow.waitFor({ state: 'visible', timeout: 30000 });
  console.log('greeting-item param row rendered');
}
