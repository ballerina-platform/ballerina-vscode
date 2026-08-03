{
  const frame = await getBIWebview();

  // Open a Declare Variable form (do not save yet — steps 04–05 share it)
  await selectFlowNode('Declare Variable', 'Statement');
  await fillFlowNodeForm({
    'Name*Name of the variable': { type: 'input', value: 'greeting' }
  });
  console.log('Declare Variable form open, name=greeting');
  console.log('form testids:', JSON.stringify(await listTestIds().catch(() => [])));

  // Discover the expression field's floating controls (Expand Editor etc.)
  const titles = await frame.locator('[title]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('title')).filter(Boolean)
  );
  console.log('titled controls:', JSON.stringify([...new Set(titles)]));

  // Focus the Expression editor first — floating buttons render on focus
  const expr = frame.locator('[data-testid="side-panel"] .cm-content').last();
  await expr.waitFor({ state: 'visible', timeout: 15000 });
  await expr.click();
  await window.waitForTimeout(1000);

  const expandBtn = frame.locator('[title="Expand Editor"]').last();
  await expandBtn.waitFor({ state: 'visible', timeout: 15000 });
  await expandBtn.click({ force: true });
  console.log('clicked Expand Editor');
  await window.waitForTimeout(1500);
  console.log('expanded snapshot:\n' + (await snapshot('Expand|Minimize|Expression|textbox|Save').catch(() => '')));

  // Type in the expanded editor (last .cm-content should belong to the modal)
  const cmCount = await frame.locator('.cm-content').count();
  console.log('cm-content count in expanded mode:', cmCount);
  await cmFill('"Hello World"', cmCount - 1);
  await window.waitForTimeout(500);

  // Collapse via the Minimize control
  const minimize = frame.locator('[title="Minimize"], [title="Minimize Editor"]').last();
  await minimize.waitFor({ state: 'visible', timeout: 15000 });
  await minimize.click({ force: true });
  console.log('clicked Minimize');
  await window.waitForTimeout(1500);

  // Verify the inline field preserved the value
  const deadline = Date.now() + 15000;
  let inline = '';
  while (Date.now() < deadline) {
    inline = await frame.locator('[data-testid="side-panel"] .cm-content').last().innerText().catch(() => '');
    if (inline.includes('Hello World')) break;
    await window.waitForTimeout(500);
  }
  if (!inline.includes('Hello World')) {
    throw new Error(`inline expression did not preserve expanded-editor value, got: "${inline}"`);
  }
  console.log('inline expression preserved after collapse:', inline.trim());
}
