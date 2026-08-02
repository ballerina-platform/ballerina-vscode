globalThis.addArtifact = async (artifactName, testId) => {
  const frame = await getBIWebview();
  await frame.getByRole('button', { name: /Add Artifact/i }).click({ force: true });
  if (testId) {
    await frame.locator(`[data-testid="${testId}"], #${testId}`).first().click({ force: true });
    return;
  }
  await frame.getByText(artifactName, { exact: true }).last().click({ force: true });
};

globalThis.clickVisibleText = async (frame, text) => {
  const target = frame.getByText(text, { exact: true }).last();
  await target.waitFor({ state: 'attached', timeout: 30000 });
  try {
    await target.click({ force: true, timeout: 5000 });
  } catch {
    await target.evaluate((element) => element.click());
  }
};

globalThis.createHttpServiceWithResource = async (method = 'POST', resourcePath = 'upload') => {
  await addArtifact('HTTP Service', 'http-service-card');
  let frame = await getBIWebview();
  await frame.getByRole('textbox', { name: /Service Base Path/i }).fill('/');
  await frame.getByRole('button', { name: 'Create' }).click({ force: true });
  await waitForText('Add Resource', 60000);

  frame = await getBIWebview();
  await frame.getByRole('button', { name: /Add Resource/i }).first().click({ force: true });
  await clickVisibleText(frame, method);
  const resourceInput = frame.getByRole('textbox', { name: /Resource Path/i })
    .or(frame.locator('[data-testid="resource-path-input"]'))
    .or(frame.locator('input[placeholder*="path/foo"]'));
  await resourceInput.first().fill(resourcePath);
  await clickVisibleText(frame, 'Save');
  await frame.locator('[data-testid="bi-diagram-canvas"]').waitFor({ timeout: 60000 });
  return { method, resourcePath };
};

globalThis.configureUploadResourceIO = async () => {
  const frame = await getBIWebview();
  await frame.getByRole('button', { name: /Configure/i }).click({ force: true });
  await waitForText('Resource Configuration', 30000);

  await frame.getByText('Query Parameter', { exact: true }).click({ force: true });
  await frame.getByRole('textbox', { name: 'Name*' }).last().fill('name');
  await frame.getByRole('button', { name: 'Save' }).first().click({ force: true });
  await waitForText('string name', 30000);

  await frame.getByText('Define Payload', { exact: true }).click({ force: true });
  await waitForText('Define Payload', 30000);
  await frame.locator('textarea').fill('{"content":"hello"}');
  await frame.getByRole('button', { name: 'Import Type' }).click({ force: true });
  await frame.getByRole('heading', { name: 'Payload' }).waitFor({ timeout: 30000 });
  await frame.getByText('UploadPayload', { exact: true }).waitFor({ timeout: 30000 });
  await frame.getByText('payload', { exact: true }).waitFor({ timeout: 30000 });

  await frame.getByRole('button', { name: 'Save' }).last().click({ force: true });
  await frame.locator('[data-testid="bi-diagram-canvas"]').waitFor({ timeout: 60000 });
  await frame.waitForTimeout(3000);
  const mainBal = fs.readFileSync(path.join(newProjectPath, 'main.bal'), 'utf8');
  if (!mainBal.includes('@http:Payload UploadPayload payload') || !mainBal.includes('@http:Query string name')) {
    throw new Error(`Resource configuration was not saved to main.bal:\n${mainBal}`);
  }
  return { queryName: 'name', payloadType: 'UploadPayload' };
};

globalThis.addReturnNodeFromDiagram = async (
  expression = '{key: string `uploads/${name}`, size: payload.content.length()}'
) => {
  const frame = await getBIWebview();
  const isNodePanelOpen = (text) => text.includes('Connections') && text.includes('Return');
  for (let attempt = 0; attempt < 10; attempt++) {
    const addButton = frame.locator('[data-testid="empty-node-add-button-1"]').first();
    if (await addButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await addButton.hover({ force: true }).catch(() => {});
      await addButton.click({ force: true, timeout: 3000 }).catch(() => {});
    }
    await frame.waitForTimeout(1000);
    let current = await snapshot().catch(() => '');
    if (isNodePanelOpen(current)) break;
    const clickedId = await frame.locator('[data-testid]').evaluateAll((elements) => {
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const candidates = elements.filter((element) => {
        const id = element.getAttribute('data-testid') || '';
        return isVisible(element) && (id.startsWith('empty-node-add-button') || id.startsWith('link-add-button'));
      });
      const target = candidates.find((element) => (element.getAttribute('data-testid') || '').startsWith('empty-node-add-button'))
        || candidates[0];
      if (!target) return '';
      for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
        target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
      return target.getAttribute('data-testid') || '';
    });
    await frame.waitForTimeout(1000);
    current = await snapshot().catch(() => '');
    if (isNodePanelOpen(current)) break;
    if (attempt === 9) {
      const finalSnapshot = await snapshot().catch((error) => `snapshot failed: ${error.message}`);
      throw new Error(`Node panel did not open after clicking diagram add button "${clickedId}"\n${finalSnapshot}`);
    }
  }
  await waitForText('Control', 30000);
  await frame.getByText('Return', { exact: true }).click({ force: true });
  await waitForText('Return value.', 30000);

  // Set the expression through the CodeMirror view. keyboard.type loses every
  // '{' to the editor's bracket/helper handling, which leaves Save disabled.
  const cmContent = frame.locator('[data-testid="ex-editor-expression"] .cm-content');
  await cmContent.waitFor({ state: 'attached', timeout: 30000 });
  await cmContent.evaluate((element, text) => {
    const view = element.cmView && element.cmView.view;
    if (!view) throw new Error('CodeMirror view not found in ex-editor container');
    view.focus();
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }, expression);
  const applied = await cmContent.evaluate((element) => element.textContent);
  if (applied !== expression) {
    throw new Error(`Expression editor holds "${applied}", expected "${expression}"`);
  }

  await window.keyboard.press('Escape');
  await frame.getByRole('button', { name: 'Save' }).last().click({ force: true });
  // The panel closing is the real save signal.
  await frame.getByTestId('side-panel').waitFor({ state: 'hidden', timeout: 60000 });
  const mainBal = fs.readFileSync(path.join(newProjectPath, 'main.bal'), 'utf8');
  if (!mainBal.includes('return {key: string `uploads/${name}`, size: payload.content.length()};')) {
    throw new Error(`Return node was not saved to main.bal:\n${mainBal}`);
  }
  return expression;
};

globalThis.openProjectFileInEditor = async (fileName) => {
  await ensureWorkbench();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await window.keyboard.press(`${modifier}+p`);
  await window.waitForTimeout(500);
  await window.keyboard.type(fileName);
  await window.keyboard.press('Enter');
  await window.waitForTimeout(1500);
};

globalThis.runIntegrationAndWaitForUpload = async () => {
  await openProjectFileInEditor('main.bal');
  // executePaletteCommand presses Enter without waiting for the list to
  // filter, so select the command explicitly and confirm the run started.
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+p' : 'Control+Shift+p');
  await window.keyboard.type('BI.project.run');
  await window.locator('.quick-input-list .monaco-list-row', { hasText: 'Run Integration' })
    .first()
    .waitFor({ state: 'visible', timeout: 30000 });
  await window.keyboard.press('Enter');
  await window.locator('.xterm-screen', { hasText: 'Running executable' })
    .first()
    .waitFor({ timeout: 180000 });
  return waitForEndpoint('http://localhost:9090/upload?name=probe.txt', 120000, {
    method: 'POST',
    body: '{"content":"hello"}',
    headers: { 'Content-Type': 'application/json' },
  });
};
