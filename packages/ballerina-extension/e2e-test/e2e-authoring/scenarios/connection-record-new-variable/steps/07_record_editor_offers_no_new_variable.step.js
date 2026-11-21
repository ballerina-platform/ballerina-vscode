{
  const frame = await getBIWebview();
  const overlay = frame.locator('.unq-modal-overlay', { hasText: 'Select fields to construct the record' }).first();

  // Clear host's value so the helper pane opens on it, as in the issue video.
  const hostLine = overlay.locator('.cm-line', { hasText: 'host' }).last();
  await hostLine.click();
  await window.keyboard.press('End');
  await window.keyboard.press('Backspace');
  await window.keyboard.press('Backspace');
  await window.waitForTimeout(2000);

  const variables = frame.getByText('Variables', { exact: true }).last();
  await variables.waitFor({ state: 'visible', timeout: 30000 });
  await variables.click({ force: true });
  // The Variables page is showing (its list or its empty placeholder) before checking its footer.
  await frame.getByText('No variables found', { exact: true }).or(frame.locator('[data-testid^="helper-pane-item-"]'))
    .first().waitFor({ state: 'visible', timeout: 30000 });
  await window.waitForTimeout(1500);
  if (await frame.getByText('New Variable', { exact: true }).last().isVisible().catch(() => false)) {
    throw new Error('the connection record editor offers "+ New Variable"');
  }
  console.log('the record editor helper pane offers no "+ New Variable"');

  // Give host a value and close the record editor.
  await window.keyboard.press('Escape');
  await hostLine.click();
  await window.keyboard.press('End');
  await window.keyboard.type('"proxy.local"');
  await window.waitForTimeout(2500);
  await window.keyboard.press('Escape');
  await overlay.getByRole('button').first().click({ force: true });
  await overlay.waitFor({ state: 'hidden', timeout: 15000 });
  const http1 = await frame.locator('vscode-text-area[name="http1Settings"]').first().evaluate((el) => el.value);
  if (!http1.includes('host: "proxy.local"')) {
    throw new Error(`HTTP1 Settings lost the record value: ${JSON.stringify(http1)}`);
  }
  console.log('record editor closed; HTTP1 Settings:', JSON.stringify(http1));
}
