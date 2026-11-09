{
  // Control: outside connection forms, a field's helper pane still offers "+ New Variable".
  const frame = await getBIWebview();
  await selectFlowNode('Declare Variable', 'Statement');
  await fillFlowNodeForm({
    'Name*Name of the variable': { type: 'input', value: 'greeting' },
    'Type': { type: 'textarea', value: 'string', additionalProps: { clickLabel: true } },
  });
  const expression = frame.locator('[data-testid="side-panel"] .cm-content').last();
  await expression.waitFor({ state: 'visible', timeout: 15000 });
  const expressionIndex = await expression.evaluate((el) => [...document.querySelectorAll('.cm-content')].indexOf(el));
  await cmFill('', expressionIndex);
  await expression.click({ force: true });
  await window.waitForTimeout(2000);
  await frame.getByText('Variables', { exact: true }).last().click({ force: true });
  await frame.getByText('New Variable', { exact: true }).last().waitFor({ state: 'visible', timeout: 30000 });
  console.log('the flow form helper pane offers "+ New Variable"');

  await window.keyboard.press('Escape');
  await window.waitForTimeout(1000);
  await cmFill('"hello"', expressionIndex);
  await window.waitForTimeout(1500);
  await saveOpenFlowNodeForm();
  console.log('saved greeting');
}
