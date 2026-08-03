{
  // Same auto-start-and-wait-for-hurl pattern as http-try-it steps 04-05,
  // driven from the Service Designer toolbar Try It button (service is not
  // running yet, since the project was never run in this session).
  await ensureWorkbench();

  globalThis.clickNotificationButton = async (name, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    const btn = window.locator('.notifications-toasts').getByRole('button', { name, exact: true }).first();
    while (Date.now() < deadline) {
      if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        if (await btn.click({ timeout: 4000 }).then(() => true, () => false)) return;
      }
      await window.waitForTimeout(400);
    }
    throw new Error(`Notification action "${name}" not found within ${timeoutMs}ms`);
  };

  const projectPath = path.join(e2eRoot, 'e2e-playwright-tests', 'data', 'http_try_it_existing_project');

  const frame = await getBIWebview();
  await frame.getByText('Try It', { exact: true }).first().waitFor({ timeout: 30000 });
  await frame.getByRole('button', { name: /Try It/ }).first().click({ force: true });
  await window.waitForTimeout(1500);

  const hurlOption = window.getByRole('option', { name: /Try It.*Hurl Client/ }).first();
  if (await hurlOption.isVisible({ timeout: 8000 }).catch(() => false)) {
    await hurlOption.click({ force: true });
  }

  await clickNotificationButton('Run Integration', 30000);
  console.log('clicked Run Integration (Try It auto-start)');

  const hurlPath = path.join(projectPath, 'target', 'TryIt.hurl');
  const deadline = Date.now() + 180000;
  let openedCenterAt = 0;
  while (Date.now() < deadline && !fs.existsSync(hurlPath)) {
    for (const container of ['.notifications-toasts', '.notifications-center']) {
      const testBtn = window.locator(container).getByRole('button', { name: 'Test', exact: true }).first();
      if (await testBtn.isVisible({ timeout: 300 }).catch(() => false)) {
        await testBtn.click({ timeout: 3000 }).catch(() => {});
        break;
      }
    }
    if (await hurlOption.isVisible({ timeout: 300 }).catch(() => false)) {
      await hurlOption.click({ force: true }).catch(() => {});
    }
    if (Date.now() - openedCenterAt > 8000) {
      await extendedPage.executePaletteCommand('Notifications: Show Notifications').catch(() => {});
      openedCenterAt = Date.now();
    }
    await window.waitForTimeout(1000);
  }
  if (!fs.existsSync(hurlPath)) throw new Error('target/TryIt.hurl was not generated');

  const hurl = fs.readFileSync(hurlPath, 'utf8');
  // A plain substring check would also match "GET .../greeting/name", so the
  // request line is checked for an exact match instead.
  if (!hurl.split('\n').some((line) => line.trim() === 'GET http://localhost:9090/greeting')) {
    throw new Error('TryIt.hurl missing GET /greeting cell:\n' + hurl);
  }

  const running = await waitForEndpoint('http://localhost:9090/greeting', 120000, { method: 'GET' });
  if (running.status !== 200 || !running.body.includes('Hello, Ballerina!')) {
    throw new Error('service did not auto-start correctly: ' + JSON.stringify(running));
  }
  // The hurl file write and the notebook tab opening are not atomic — the file
  // can exist a beat before the editor tab renders. Poll instead of a single check.
  const tabDeadline = Date.now() + 15000;
  let host = await hostSnapshot();
  while (Date.now() < tabDeadline && !/tab "TryIt\.hurl/.test(host)) {
    await window.waitForTimeout(500);
    host = await hostSnapshot();
  }
  if (!/tab "TryIt\.hurl/.test(host)) throw new Error('TryIt.hurl notebook tab did not open');

  console.log('Try It auto-started the existing service and built the notebook:\n' + hurl);
}
