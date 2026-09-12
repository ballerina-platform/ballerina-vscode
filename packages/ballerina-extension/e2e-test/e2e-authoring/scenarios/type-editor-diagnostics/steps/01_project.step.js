{
  const state = await createProjectAndIntegration('TypeEditorDiagnostics');
  fs.writeFileSync(path.join(sessionDir, 'state.json'), JSON.stringify(state, null, 2));

  await navigateToIntegrationOverview(state.integrationName);

  // The authoring addArtifact() helper force-clicks the card; that silently
  // no-ops on the artifact cards (same reason the committed helper uses
  // domClick). Open the picker and dispatch a real DOM click on the card.
  const frame = await getBIWebview();
  await frame.getByRole('button', { name: /Add Artifact/i }).click({ force: true });
  const typeCard = frame.locator('#type');
  await typeCard.waitFor({ state: 'visible', timeout: 30000 });
  await domClick(typeCard);

  // The type diagram's first load waits on the language server warming up.
  await waitForText('Add Type', 120000);
  console.log(`project ready: ${state.projectName} — Type Editor open`);
}
