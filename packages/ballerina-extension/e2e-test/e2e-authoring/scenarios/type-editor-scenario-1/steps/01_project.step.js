{
  const state = await createProjectAndIntegration('TypeExplorerNav');
  fs.writeFileSync(path.join(sessionDir, 'state.json'), JSON.stringify(state, null, 2));
  console.log(`project ready: ${state.projectName} / ${state.integrationName} — integration overview open`);
}
