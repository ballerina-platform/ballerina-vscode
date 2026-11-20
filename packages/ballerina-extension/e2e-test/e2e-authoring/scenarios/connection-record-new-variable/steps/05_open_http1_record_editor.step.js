{
  const frame = await getBIWebview();

  await cmFill('"https://foo.bar/baz"', 0);
  await window.waitForTimeout(1000);
  console.log('filled Url');

  const http1 = frame.locator('vscode-text-area[name="http1Settings"] textarea');
  await http1.waitFor({ state: 'visible', timeout: 30000 });
  await http1.click({ force: true });

  const overlay = frame.locator('.unq-modal-overlay').last();
  await overlay.getByText('Select fields to construct the record').waitFor({ timeout: 60000 });
  console.log('Record Configuration modal open for HTTP1 Settings');
}
