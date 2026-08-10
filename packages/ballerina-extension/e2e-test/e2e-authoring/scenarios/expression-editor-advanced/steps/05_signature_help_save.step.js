{
  const frame = await getBIWebview();

  // Continue in the open Declare Variable form: set type int, then build a
  // function call through autocomplete. NOTE: the multi-mode expression editor
  // has no '('-triggered signature-help popup — function insertion help is
  // completion-driven (placeholder args from extractArgsFromFunction).
  const form = new Form(window, BI_INTEGRATOR_LABEL, frame);
  await form.fill({
    values: {
      'Type': { type: 'textarea', value: 'int', additionalProps: { clickLabel: true } }
    }
  });
  console.log('type set to int');

  // The Expression field still holds the plain string "Hello World" at this
  // point — a type-mismatch diagnostic must render below the editor.
  const panel = frame.locator('[data-testid="side-panel"]').first();
  const mismatchText = panel.getByText("incompatible types: expected 'int', found 'string'");
  await mismatchText.waitFor({ state: 'visible', timeout: 15000 });
  console.log('verified diagnostic: incompatible types: expected \'int\', found \'string\'');

  await dismissHelperPanel();

  // Append to the existing "Hello World" text rather than clearing and
  // retyping — placing the cursor at the end and typing ".le" triggers the
  // same completion.
  const expr = frame.locator('[data-testid="side-panel"] .cm-content').last();
  await expr.click();
  await window.waitForTimeout(500);
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
  await window.waitForTimeout(300);
  await window.keyboard.type('.le', { delay: 80 });

  // Completion list must appear with the length() candidate. Click the
  // option — Enter can race the list's selection state.
  const option = frame.locator('.cm-tooltip-autocomplete [role="option"]', { hasText: 'length' }).first();
  await option.waitFor({ state: 'visible', timeout: 15000 });
  console.log('completion list visible with length()');
  await option.click({ force: true });

  const deadline = Date.now() + 15000;
  let value = '';
  while (Date.now() < deadline) {
    value = await expr.innerText().catch(() => '');
    if (value.includes('"Hello World".length()')) break;
    await window.waitForTimeout(500);
  }
  if (!value.includes('"Hello World".length()')) {
    throw new Error(`completion did not insert call, got: ${JSON.stringify(value)}`);
  }
  console.log('completion inserted full call:', value.trim());

  await dismissHelperPanel();
  await saveOpenFlowNodeForm();
  console.log('saved Declare Variable greeting');

  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const source = fs.readFileSync(path.join(state.integrationDir, 'automation.bal'), 'utf8');
  if (!source.includes('"Hello World".length()')) {
    throw new Error(`automation.bal missing expected declaration:\n${source}`);
  }
  console.log('automation.bal contains: int greeting = "Hello World".length()');
}
