{
  const frame = await getBIWebview();
  const content = frame.locator('[data-testid="create-from-scratch-tab"]');
  const banner = content.locator('div:has(> i.codicon-warning)');
  const bannerTexts = async () =>
    (await banner.allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean);
  const waitForBanner = async (predicate, label) => {
    const deadline = Date.now() + 60000;
    let texts = [];
    while (Date.now() < deadline) {
      texts = await bannerTexts();
      if (predicate(texts)) return texts;
      await window.waitForTimeout(500);
    }
    throw new Error(`${label}; last banners: ${JSON.stringify(texts)}`);
  };

  // Restore a valid type so the only diagnostic left in play is the name's.
  const typeField = frame.locator('[data-testid="type-field"]').last();
  await typeField.dblclick();
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await window.keyboard.type('string');
  await window.keyboard.press('Escape');
  await waitForBanner((texts) => texts.length === 0, 'field-type diagnostic never cleared after setting type back to string');
  console.log('field type diagnostic cleared with type=string');

  // A reserved keyword is not a legal field name.
  const idField = frame.locator('[data-testid="identifier-field"]').last();
  await idField.dblclick();
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await window.keyboard.type('function');
  const expected = '`function` is a reserved keyword';
  const texts = await waitForBanner(
    (t) => t.includes(expected),
    `expected the field-name diagnostic ${JSON.stringify(expected)} — pre-fix this stayed empty (PR #961)`
  );
  console.log('FIELD NAME DIAGNOSTIC: ' + JSON.stringify(texts));

  // Correcting the name clears it — proves the round-trip re-runs and comes
  // back clean, which the pre-fix failing request could never do either.
  await idField.dblclick();
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await window.keyboard.type('probe');
  await waitForBanner((t) => t.length === 0, 'field-name diagnostic never cleared after correcting the name');
  console.log('field name diagnostic cleared after correcting the name');
}
