{
  const state = await createProjectAndIntegration('TypeEditorImportXml');
  fs.writeFileSync(path.join(sessionDir, 'state.json'), JSON.stringify(state, null, 2));

  // Open the Type Editor (type artifact canvas)
  await navigateToIntegrationOverview(state.integrationName);
  await addArtifact('Type', 'type');
  await waitForText('Add Type', 30000);
  console.log(`project ready: ${state.projectName} — Type Editor open`);
}
