{
  // Control: outside connection forms, a field's helper pane offers "+ New Variable", and the variable
  // it declares is saved before the node being edited and written into the field it was made from.
  const frame = await getBIWebview();
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  await selectFlowNode('Declare Variable', 'Statement');
  await fillFlowNodeForm({
    'Name*Name of the variable': { type: 'input', value: 'greeting' },
    'Type': { type: 'textarea', value: 'string', additionalProps: { clickLabel: true } },
  });
  const cmIndex = (locator) => locator.evaluate((el) => [...document.querySelectorAll('.cm-content')].indexOf(el));
  const expression = frame.locator('[data-testid="side-panel"] .cm-content').last();
  await expression.waitFor({ state: 'visible', timeout: 15000 });
  await cmFill('', await cmIndex(expression));
  await expression.click({ force: true });
  await window.waitForTimeout(2000);
  await frame.getByText('Variables', { exact: true }).last().click({ force: true });
  const newVariable = frame.getByText('New Variable', { exact: true }).last();
  await newVariable.waitFor({ state: 'visible', timeout: 30000 });
  console.log('the flow form helper pane offers "+ New Variable"');

  // The click asks the language server for the form's template before the form opens.
  await newVariable.click();
  // The form is the last one on the page: its modal is rendered after the side panel.
  const formTitle = frame.getByRole('heading', { name: 'New Variable', exact: true });
  await formTitle.waitFor({ state: 'visible', timeout: 30000 });
  const name = frame.getByRole('textbox', { name: /^Name/ }).last();
  await name.waitFor({ state: 'visible', timeout: 30000 });
  const suggested = await name.inputValue();
  if (suggested === 'greeting') throw new Error('the new variable is named after the form it was opened from');
  await name.fill('salutation');
  const value = frame.locator('.cm-content').last();
  await value.waitFor({ state: 'visible', timeout: 15000 });
  await cmFill('"hello"', await cmIndex(value));
  await window.waitForTimeout(1500);
  // The value's own helper pane covers Save. Escape would close the form with it, so click the title.
  await formTitle.click();
  await frame.getByRole('button', { name: 'Save' }).last().click({ timeout: 15000 });
  await formTitle.waitFor({ state: 'hidden', timeout: 60000 });
  console.log(`saved the new variable (suggested name: "${suggested}")`);

  // The field the variable was created from reads it, and the node saves.
  const deadline = Date.now() + 30000;
  let fieldText = '';
  while (Date.now() < deadline) {
    fieldText = await expression.innerText().catch(() => '');
    if (fieldText.includes('salutation')) break;
    await window.waitForTimeout(500);
  }
  if (!fieldText.includes('salutation')) throw new Error(`the field does not read the new variable: "${fieldText}"`);
  // Saving through the form rebuilds it, which must not put back the name the node opened with.
  const outerName = await frame.locator('[data-testid="side-panel"]').getByRole('textbox', { name: /^Name/ }).first().inputValue();
  if (outerName !== 'greeting') throw new Error(`the node lost its name when the new variable was saved: "${outerName}"`);
  await saveOpenFlowNodeForm();

  const sources = fs.readdirSync(state.integrationDir).filter((file) => file.endsWith('.bal'))
    .map((file) => fs.readFileSync(path.join(state.integrationDir, file), 'utf8').replace(/\s+/g, ' '));
  const source = sources.find((text) => text.includes('string greeting')) || '';
  // The new variable is typed `var` here: the Expression of a Declare Variable has no type of its own.
  const declared = source.search(/(var|string) salutation = "hello";/);
  const read = source.indexOf('string greeting = salutation;');
  if (declared < 0 || read < declared) throw new Error(`the variable is not declared before the node that reads it:\n${sources.join('\n')}`);
  await window.waitForTimeout(5000);
  const status = await window.locator('.statusbar-item').evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-label') || '').filter((label) => /^(Errors|Warnings|No Problems)/.test(label)));
  if (status.some((label) => label.startsWith('Errors'))) throw new Error(`the project does not compile: ${status}`);
  // The next step adds to the diagram, which redraws more than once as the two saves land: wait until
  // its add buttons have stayed for three seconds.
  const addButtons = frame.locator('[data-testid^="link-add-button"]');
  const settleBy = Date.now() + 60000;
  for (let steadyFor = 0; steadyFor < 3000 && Date.now() < settleBy; ) {
    steadyFor = (await addButtons.count()) > 0 ? steadyFor + 500 : 0;
    await window.waitForTimeout(500);
  }
  console.log(`saved greeting reading salutation; no compile errors (${status.join(', ')})`);
}
