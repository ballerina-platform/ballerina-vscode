{
  const frame = await getBIWebview();
  const panel = frame.locator('[data-testid="side-panel"]').first();

  // Node palette → AI category → Agent → Add Agent
  await clickNextDiagramPlus();
  await panel.getByText('AI', { exact: true }).first().click({ force: true });
  await window.waitForTimeout(2000);
  await panel.getByText('Agent', { exact: true }).last().click({ force: true });
  await window.waitForTimeout(2500);
  await panel.getByText('Add Agent', { exact: false }).last().click({ force: true });
  await window.waitForTimeout(4000);

  // AI Agent form: Role/Instructions are Prompt-mode fields, Query is Text
  await panel.getByText('AI Agent', { exact: true }).first().waitFor({ timeout: 30000 });
  await panel.getByText('Instructions', { exact: true }).first().waitFor({ timeout: 15000 });
  await panel.getByText('Query*', { exact: false }).first().waitFor({ timeout: 15000 });
  console.log('AI Agent form open with Role / Instructions / Query fields');
}
