{
  const frame = await getBIWebview();

  const addTypeBtn = frame.getByRole('button', { name: 'Add Type' });
  await addTypeBtn.waitFor({ timeout: 60000 });
  await addTypeBtn.click({ force: true });
  console.log('clicked Add Type');

  // The New Type panel can come up on the Import tab; select "Create from
  // scratch" explicitly (it resets the form, so click before filling).
  // (the tab button carries no testid; `create-from-scratch-tab` is its content container)
  const scratchTab = frame.getByRole('button', { name: /Create from scratch/ }).first();
  await scratchTab.waitFor({ state: 'visible', timeout: 30000 });
  await scratchTab.click({ force: true });
  await frame.locator('[data-testid="create-from-scratch-tab"]').waitFor({ state: 'visible', timeout: 30000 });
  await window.waitForTimeout(1000);

  const form = new Form(window, BI_INTEGRATOR_LABEL, frame);
  await form.switchToFormView(false, frame);
  await form.fill({
    values: {
      'Name': { type: 'input', value: 'Greeter' },
      'Kind': { type: 'dropdown', value: 'Service Class' },
    },
  });
  console.log('filled Name=Greeter Kind=Service Class');

  await form.submit('Save', true);
  await window.waitForTimeout(2000);

  const node = frame.locator('[data-testid="type-node-Greeter"]');
  await node.waitFor({ timeout: 60000 });
  console.log('type-node-Greeter visible in diagram');
}
