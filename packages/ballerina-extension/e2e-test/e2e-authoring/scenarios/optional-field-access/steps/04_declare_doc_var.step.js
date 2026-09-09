{
  const frame = await getBIWebview();

  // Declare Variable node: doc : Doc = { name: "sample", meta: () }. `meta` is a
  // nilable record field (Meta?), set to nil here. This gives us a record-typed
  // variable whose nested `meta` field we can drill into from the next node's
  // helper pane.
  await selectFlowNode('Declare Variable', 'Statement');
  await fillFlowNodeForm({
    'Name*Name of the variable': { type: 'input', value: 'doc' },
    'Type': { type: 'textarea', value: 'Doc', additionalProps: { clickLabel: true } }
  });
  await dismissHelperPanel();
  console.log('Declare Variable form open, name=doc type=Doc');

  const expr = frame.locator('[data-testid="side-panel"] .cm-content').last();
  await expr.waitFor({ state: 'visible', timeout: 15000 });
  await expr.click({ force: true });
  await window.waitForTimeout(500);
  await cmFill('{name: "sample", meta: ()}', (await frame.locator('.cm-content').count()) - 1);
  await window.waitForTimeout(1000);
  await dismissHelperPanel();
  console.log('expression set to {name: "sample", meta: ()}');

  await saveOpenFlowNodeForm();

  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const automationBal = path.join(state.integrationDir, 'automation.bal');
  const deadline = Date.now() + 30000;
  let source = '';
  while (Date.now() < deadline) {
    source = fs.existsSync(automationBal) ? fs.readFileSync(automationBal, 'utf8') : '';
    if (/Doc\s+doc\s*=\s*\{\s*name:\s*"sample",\s*meta:\s*\(\)\s*\}/.test(source)) break;
    await window.waitForTimeout(1000);
  }
  if (!/Doc\s+doc\s*=\s*\{\s*name:\s*"sample",\s*meta:\s*\(\)\s*\}/.test(source)) {
    throw new Error(`automation.bal missing 'Doc doc = {name: "sample", meta: ()}':\n${source}`);
  }
  console.log('automation.bal verified: Doc doc = {name: "sample", meta: ()}');
}
