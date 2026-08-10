{
  const yamlPath = path.join(e2eRoot, 'e2e-playwright-tests', 'connections', 'resources', 'petstore.yaml');
  if (!fs.existsSync(yamlPath)) throw new Error(`fixture yaml not found: ${yamlPath}`);

  let frame = await getBIWebview();
  const home = frame.locator('[data-testid="home-button"]');
  if (await home.isVisible({ timeout: 2000 }).catch(() => false)) {
    await home.click({ force: true });
  }
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  await navigateToIntegrationOverview(state.integrationName);
  frame = await getBIWebview();

  await frame.getByRole('button', { name: /Add Artifact/i }).click({ force: true });
  await frame.locator('[data-testid="function-card-Connection"], #connection').first().click({ force: true });
  await window.waitForTimeout(2000);
  console.log('opened Add Connection popup from architecture diagram');

  frame = await getBIWebview();
  await frame.getByText('Connect via API Specification', { exact: false }).first().click({ force: true });
  await window.waitForTimeout(1500);
  console.log('opened Connect via API Specification form (Specification Type defaults to OpenAPI)');

  const nameInput = frame.locator('#connector-name');
  await nameInput.waitFor({ state: 'visible', timeout: 30000 });
  await nameInput.click({ force: true });
  await window.keyboard.type('petstore', { delay: 20 });

  const upload = frame.locator('[data-testid="api-spec-upload"]');
  await upload.click({ force: true });

  const quickInputText = window.locator('.quick-input-widget input[type="text"]').first();
  await quickInputText.waitFor({ state: 'visible', timeout: 30000 });
  await quickInputText.fill(yamlPath);
  await window.waitForTimeout(500);
  await window.keyboard.press('Enter');
  console.log('selected petstore.yaml via native file picker');

  // The fixture lives outside the project directory; VS Code offers to copy
  // it in — accept so the generator has a project-relative path.
  const moveDialog = window.getByRole('dialog', { name: 'Error' }).getByRole('button', { name: 'Yes' });
  // The VS Code confirmation is raised by the extension host after the
  // native file picker has resolved. On cold starts that can take longer
  // than the quick-input interaction itself, so wait for the dialog instead
  // of probing immediately and leaving the form without a selected file.
  if (await moveDialog.isVisible({ timeout: 60000 }).catch(() => false)) {
    await moveDialog.click({ force: true });
    console.log('accepted copying the spec file into the project');
  }
  await frame.getByText('petstore.yaml', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

  const saveConnectorBtn = frame.getByRole('button', { name: 'Save Connector' });
  await saveConnectorBtn.waitFor({ state: 'visible', timeout: 15000 });
  if (!(await saveConnectorBtn.isEnabled().catch(() => false))) {
    throw new Error('Save Connector is disabled after filling name and spec file');
  }
  await saveConnectorBtn.click({ force: true });
  console.log('clicked Save Connector, generating OpenAPI client...');

  const deadline = Date.now() + 120000;
  let generated = false;
  while (Date.now() < deadline) {
    const snap = await snapshot().catch(() => '');
    if (snap.includes('Create Connection') && snap.includes('Save Connection')) { generated = true; break; }
    if (/error/i.test(snap) && snap.includes('Connector Creation Failed')) {
      throw new Error(`connector generation failed:\n${snap}`);
    }
    await window.waitForTimeout(2000);
  }
  if (!generated) throw new Error('timed out waiting for the OpenAPI connector to generate');
  console.log('OpenAPI connector generated, on Create Connection step');

  const saveConnectionBtn = frame.getByRole('button', { name: 'Save Connection' });
  await saveConnectionBtn.waitFor({ state: 'visible', timeout: 15000 });
  await saveConnectionBtn.click({ force: true });
  console.log('clicked Save Connection');

  const deadline2 = Date.now() + 60000;
  let connections = '';
  while (Date.now() < deadline2) {
    connections = fs.readFileSync(path.join(state.integrationDir, 'connections.bal'), 'utf8');
    if (connections.includes('petstoreClient')) break;
    await window.waitForTimeout(1000);
  }
  if (!connections.includes('petstoreClient')) {
    throw new Error(`connections.bal missing generated petstore connector:\n${connections}`);
  }
  console.log('connections.bal contains the generated petstore connector: ' + connections.trim());
}
