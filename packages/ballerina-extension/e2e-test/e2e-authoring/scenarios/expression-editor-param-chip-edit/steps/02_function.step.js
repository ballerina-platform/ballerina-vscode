{
  const frame = await getBIWebview();
  await frame.getByRole('button', { name: /Add Artifact/i }).click({ force: true });
  const card = frame.locator('#bi-function');
  await card.waitFor({ timeout: 30000 });
  await domClick(card);

  const form = new Form(window, BI_INTEGRATOR_LABEL, frame);
  await form.switchToFormView(false, frame);
  await form.fill({
    values: {
      'Name*Name of the function': { type: 'input', value: 'getFullName' }
    }
  });

  const addParameter = async (paramType, paramName) => {
    const addParam = frame.locator('div:has(i.codicon-add) >> text=Add Parameter').first();
    await addParam.waitFor({ state: 'visible', timeout: 30000 });
    await addParam.click({ force: true });
    await window.waitForTimeout(500);

    // The function's inline parameter row exposes its type field as
    // `arialabel="Type"` (not "Parameter Type" — that label belongs to the
    // separate ParamManager dialog used for class-init parameters).
    const typeField = frame.locator('vscode-text-area[arialabel="Type"] textarea').first();
    await typeField.waitFor({ state: 'visible', timeout: 30000 });
    await typeField.click({ force: true });
    await typeField.fill(paramType);
    await window.waitForTimeout(1500);
    const completion = frame.getByTestId('add-type-completion');
    if (await completion.isVisible().catch(() => false)) {
      await typeField.press('Escape');
    }

    const nameField = frame.getByRole('textbox', { name: /Name.*Name of the parameter/i }).first();
    await nameField.fill(paramName);

    const addButton = frame.getByRole('button', { name: 'Add', exact: true });
    await addButton.waitFor({ state: 'visible', timeout: 15000 });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && await addButton.isDisabled().catch(() => true)) {
      await window.waitForTimeout(500);
    }
    await addButton.click({ force: true });
    await window.waitForTimeout(1000);
  };

  await addParameter('string', 'firstName');
  console.log('added parameter firstName: string');
  await addParameter('string', 'lastName');
  console.log('added parameter lastName: string');

  const returnTypeField = frame.locator('vscode-text-area[arialabel="Return Type"] textarea').first();
  await returnTypeField.waitFor({ state: 'visible', timeout: 15000 });
  await returnTypeField.click({ force: true });
  await returnTypeField.fill('string');
  await window.waitForTimeout(1500);
  await window.keyboard.press('Escape');
  await window.waitForTimeout(500);
  console.log('set return type = string');

  // submitArtifactCreation's logic inlined (that helper lives only in the
  // Playwright test utils, not in this authoring VM context). domClick, not a
  // coordinate click — the full-width footer submit button sits where the
  // floating Copilot orb docks by default and can silently swallow a normal click.
  const submitBtn = frame.getByRole('button', { name: /^Create( Integration)?$/ });
  await submitBtn.waitFor({ state: 'visible', timeout: 60000 });
  await domClick(submitBtn);

  await frame.locator('text=getFullName').first().waitFor({ timeout: 30000 });
  console.log('getFullName function created');

  // "Back" from a just-created artifact's own flow diagram lands on the
  // artifact-type picker, and "back" again from there reaches the actual
  // integration overview ("Add Artifact") that addAutomationArtifact() needs.
  const back = frame.getByTestId('back-button').first();
  await back.waitFor({ state: 'visible', timeout: 15000 });
  await back.click({ force: true });
  await frame.locator('#automation').first().waitFor({ state: 'visible', timeout: 30000 });
  await back.click({ force: true });
  await waitForText('Add Artifact', 30000);
  console.log('back on integration overview');
}
