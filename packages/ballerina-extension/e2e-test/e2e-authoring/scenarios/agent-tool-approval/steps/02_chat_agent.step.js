{
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  await navigateToIntegrationOverview(state.integrationName);
  await addArtifact('Chat Agent Service', 'ai-agent-card');
  const frame = await getBIWebview();
  await frame.locator('div[data-testid="ex-editor-role"]').waitFor({ state: 'visible', timeout: 60000 });
  await cmFill('You are a mail assistant.', 0);
  await cmFill('Send emails the user asks for.', 1);
  await frame.getByRole('textbox', { name: /Agent Name/i }).fill('mailer');
  await domClick(frame.locator('vscode-button:has-text("Create")'));
  // The service designer opens first; its POST chat resource holds the agent node.
  const resource = frame.locator('[data-testid="service-agent-view-resource"]').first();
  await resource.waitFor({ state: 'visible', timeout: 240000 });
  await resource.click({ force: true });
  await frame.locator('#bi-diagram-canvas').waitFor({ state: 'visible', timeout: 240000 });
  // The chat resource shows an agent call; its tools are managed on the agent's own view.
  await frame.locator('[data-testid="open-agent-button"]').first().click({ force: true });
  await frame.locator('[data-testid="agent-node"]').first().waitFor({ timeout: 120000 });
  await frame.locator('[data-testid="agent-add-tool"]').first().waitFor({ timeout: 60000 });
  console.log('created Chat Agent Service with an agent node');
}
