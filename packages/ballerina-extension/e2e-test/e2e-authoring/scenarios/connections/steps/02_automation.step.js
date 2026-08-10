{
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  await navigateToIntegrationOverview(state.integrationName);
  await addAutomationArtifact();
  console.log('created Automation artifact');
}
