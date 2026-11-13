{
  const frame = await getBIWebview();

  // Url in expression mode, emptied, then helper pane → Variables.
  await domClick(frame.locator('[data-testid="ex-editor-url"] [data-testid="expression-mode"]').first());
  await window.waitForTimeout(1500);
  const urlEditor = frame.locator('[data-testid="ex-editor-url"] .cm-content').first();
  const urlIndex = await urlEditor.evaluate((el) => [...document.querySelectorAll('.cm-content')].indexOf(el));
  await cmFill('', urlIndex);
  await urlEditor.click({ force: true });
  await window.waitForTimeout(2000);
  await frame.getByText('Variables', { exact: true }).last().click({ force: true });
  await frame.getByText('No variables found', { exact: true }).or(frame.locator('[data-testid^="helper-pane-item-"]'))
    .first().waitFor({ state: 'visible', timeout: 30000 });
  await window.waitForTimeout(1500);
  if (await frame.getByText('New Variable', { exact: true }).last().isVisible().catch(() => false)) {
    throw new Error('the connection form offers "+ New Variable" on Url');
  }
  console.log('the Url helper pane offers no "+ New Variable"');

  await window.keyboard.press('Escape');
  await window.waitForTimeout(1000);
  await cmFill('"https://foo.bar/baz"', urlIndex);
  await window.waitForTimeout(1500);
  const url = await urlEditor.innerText();
  if (!url.includes('https://foo.bar/baz')) throw new Error(`Url did not take the value: ${JSON.stringify(url)}`);
  console.log('Url =', url.trim());
}
