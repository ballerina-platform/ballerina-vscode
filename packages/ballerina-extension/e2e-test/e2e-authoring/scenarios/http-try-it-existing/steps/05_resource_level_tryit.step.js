{
  // Resource-level Try It: navigate to a specific resource's flow diagram
  // and click ITS OWN "Try It" button (tooltip "Try Resource"), rather than
  // the Service Designer's service-level one. Requires the service to
  // ALREADY be running (true here, left running by steps 02-04) — otherwise
  // this races with the auto-start "Test with Try It Client?" debug-session
  // hook, which rebuilds the generic multi-resource notebook and discards
  // the resourceMetadata scoping (confirmed the hard way: same click on a
  // NOT-yet-running service produced the full 5-resource notebook instead of
  // a single-resource one).
  await ensureWorkbench();
  const frame = await getBIWebview();

  // Navigate back to the service's resource list, then into "secure".
  const breadcrumb = frame.getByText('HTTP Service - /', { exact: false }).first();
  await breadcrumb.click({ force: true });
  await window.waitForTimeout(1500);
  const secureRow = frame.getByText('secure', { exact: false }).first();
  await secureRow.waitFor({ timeout: 15000 });
  await secureRow.click({ force: true });
  await window.waitForTimeout(2000);

  const hurlPath = path.join(e2eRoot, 'e2e-playwright-tests', 'data', 'http_try_it_existing_project', 'target', 'TryIt.hurl');
  const before = fs.statSync(hurlPath).mtimeMs;

  const tryResourceBtn = frame.locator('vscode-button[title="Try Resource"]').first();
  await tryResourceBtn.waitFor({ timeout: 15000 });
  await tryResourceBtn.click({ force: true });
  await window.waitForTimeout(1500);

  const hurlOption = window.getByRole('option', { name: /Try It.*Hurl Client/ }).first();
  if (await hurlOption.isVisible({ timeout: 5000 }).catch(() => false)) {
    await hurlOption.click({ force: true });
  }

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && fs.statSync(hurlPath).mtimeMs <= before) {
    // Since the previous (executed) service-level notebook was left with
    // unsaved cell-execution state, opening the resource-scoped notebook at
    // the same target/TryIt.hurl path triggers a blocking "Do you want to
    // save the changes..." dialog before it can close/replace that tab.
    // Discard it — the executed cell output isn't something we need to keep.
    const saveDialog = window.locator('.monaco-dialog-box', { hasText: 'Do you want to save the changes' });
    if (await saveDialog.isVisible({ timeout: 300 }).catch(() => false)) {
      await saveDialog.getByRole('button', { name: "Don't Save", exact: true }).click({ timeout: 3000 }).catch(() => {});
    }
    const testBtn = window.locator('.notifications-toasts, .notifications-center').getByRole('button', { name: 'Test', exact: true }).first();
    if (await testBtn.isVisible({ timeout: 300 }).catch(() => false)) {
      await testBtn.click({ timeout: 3000 }).catch(() => {});
    }
    await window.waitForTimeout(500);
  }
  if (fs.statSync(hurlPath).mtimeMs <= before) {
    throw new Error('resource-level Try It did not regenerate target/TryIt.hurl');
  }

  const hurl = fs.readFileSync(hurlPath, 'utf8');
  if (!hurl.includes('GET http://localhost:9090/secure') || hurl.includes('/greeting') || hurl.includes('/search') || hurl.includes('/echo')) {
    throw new Error('resource-level Try It notebook was not scoped to just /secure:\n' + hurl);
  }

  const res = await waitForEndpoint('http://localhost:9090/secure', 15000, { method: 'GET', headers: { 'X-Api-Key': 'X-Api-Key' } });
  if (res.status !== 200 || !res.body.includes('"header":"X-Api-Key"')) {
    throw new Error('unexpected response: ' + JSON.stringify(res));
  }
  console.log('resource-level Try It scoped correctly to /secure, response verified:\n' + hurl);
}
