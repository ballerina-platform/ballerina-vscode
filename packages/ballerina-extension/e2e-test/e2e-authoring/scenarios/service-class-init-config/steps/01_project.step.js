{
  const state = await createProjectAndIntegration('ServiceClassInit');
  fs.writeFileSync(path.join(sessionDir, 'state.json'), JSON.stringify(state, null, 2));

  await navigateToIntegrationOverview(state.integrationName);
  await addArtifact('Type', 'type');
  await waitForText('Add Type', 30000);
  console.log(`project ready: ${state.projectName} — Type Editor open`);
}
