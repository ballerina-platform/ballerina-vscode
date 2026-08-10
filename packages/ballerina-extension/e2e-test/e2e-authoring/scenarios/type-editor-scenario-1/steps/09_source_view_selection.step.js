{
  const frame = await getBIWebview();

  // Open Source from the focused node's three-dots menu
  const menuBtn = frame.locator('[data-testid="type-node-Customer-menu"]');
  await menuBtn.waitFor({ state: 'visible', timeout: 15000 });
  await menuBtn.click();
  const srcItem = frame.getByText('Source', { exact: true });
  await srcItem.waitFor({ state: 'visible', timeout: 10000 });
  await srcItem.click({ force: true });
  console.log('clicked Source on Customer');

  // goToSource opens types.bal in an editor group beside the diagram and sets
  // editor.selection to the type's range
  const tab = window.locator('.tab[aria-label*="types.bal"]').first();
  await tab.waitFor({ state: 'visible', timeout: 30000 });
  console.log('types.bal editor tab visible (opened beside the diagram)');

  // Monaco renders the selection as .selected-text overlay divs
  const selection = window.locator('.monaco-editor .selected-text').first();
  await selection.waitFor({ state: 'attached', timeout: 15000 });
  console.log('editor selection overlay present');

  // Semantic check: focus the editor via its tab (does not alter the
  // selection), copy, and confirm the selected text is the Customer type name
  await vscode.evaluate(({ clipboard }) => clipboard.writeText('SENTINEL'));
  await tab.click();
  await window.waitForTimeout(500);
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
  await window.waitForTimeout(500);
  const clip = await vscode.evaluate(({ clipboard }) => clipboard.readText());
  if (clip === 'SENTINEL' || !clip.includes('Customer')) {
    throw new Error('selected source text mismatch, clipboard: ' + clip);
  }
  console.log('selected code verified via clipboard: ' + clip);
}
