{
  const frame = await getBIWebview();

  const saveButton = frame.getByRole('button', { name: 'Save', exact: true });
  await saveButton.waitFor({ state: 'visible', timeout: 15000 });
  await saveButton.click({ force: true });
  console.log('clicked Save on the Service Function form');

  // Saving returns to the service class designer; the Constructor card stays.
  const editInit = frame.locator('[data-testid="edit-method-button-init"]');
  await editInit.waitFor({ state: 'visible', timeout: 60000 });
  console.log('back on the service class designer, Constructor card present');

  const source = await waitForTypesBalContent((s) => /function init\s*\(\s*string greeting/.test(s), 60000);
  console.log('types.bal:\n' + source);
  if (!/function init\s*\(\s*string greeting/.test(source)) {
    throw new Error('init parameter was not written to types.bal');
  }
  console.log('types.bal declares function init(string greeting)');
}
