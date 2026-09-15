{
  await ensureWorkbench();
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const typesBal = path.join(state.integrationDir, 'types.bal');

  // Pre-seed the `Doc` type with a nested nilable record field `meta: Meta?`,
  // matching the committed fixture
  // (e2e-playwright-tests/data/optional_field_access_project). Accessing
  // `documentId` THROUGH the nilable `meta` must use `?.`
  // (`doc.meta?.documentId`) — the nilability-across-navigation case fixed by
  // PR #911. Record type creation is owned by the type-editor scenarios, and
  // the promoted Playwright spec likewise ships the types as a fixture rather
  // than building them through the UI (the type editor cannot enter a nilable
  // custom type like `Meta?` reliably); here we only need the types present so
  // the helper-pane flow (the thing under test) can be driven through the
  // product.
  fs.writeFileSync(typesBal,
    'type Meta record {|\n    string documentId;\n|};\n\n' +
    'type Doc record {|\n    string name;\n    Meta? meta;\n|};\n');
  console.log('seeded types.bal with Meta + Doc (Meta? meta)');

  const seeded = await waitForTypesBalContent((s) => s.includes('Meta? meta;'), 15000);
  if (!seeded.includes('Meta? meta;') || !seeded.includes('string documentId;')) {
    throw new Error('types.bal seeding failed:\n' + seeded);
  }

  // Reload the window so the language server re-indexes the seeded types from
  // disk (a plain disk write to a non-open file does not reliably refresh the
  // completion index in an already-running session).
  await window.reload().catch(() => {});
  await window.waitForTimeout(4000);
  await ensureWorkbench();
  await getBIWebview().catch(() => {});
  console.log('types.bal seeded and window reloaded (Meta + Doc indexed)');
}
