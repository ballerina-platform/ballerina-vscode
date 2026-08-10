{
  let frame = await getBIWebview();
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));

  // The automation artifact creation flow lands directly in the flow
  // diagram. Go back to the architecture (overview) diagram first so we can
  // exercise the actual navigation the scenario calls out: home -> click
  // the Automation node -> flow diagram.
  const home = frame.locator('[data-testid="home-button"]');
  if (await home.isVisible({ timeout: 5000 }).catch(() => false)) {
    await home.click({ force: true });
  }

  // Home lands on the project overview (list of integrations); drill back
  // into this integration's own overview, which embeds the architecture
  // diagram.
  await navigateToIntegrationOverview(state.integrationName);
  frame = await getBIWebview();

  const automationNode = frame.locator('[data-testid="entry-node-automation"]');
  await automationNode.waitFor({ state: 'visible', timeout: 60000 });
  console.log('architecture diagram shows the Automation entry node');

  await automationNode.click({ force: true });
  await frame.locator('[data-testid="bi-diagram-canvas"], #bi-diagram-canvas').waitFor({ timeout: 60000 });
  console.log('navigated into the Automation flow diagram');
}
