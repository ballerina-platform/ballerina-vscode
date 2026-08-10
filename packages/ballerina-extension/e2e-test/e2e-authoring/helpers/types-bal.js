// Polls the current session's generated types.bal until `predicate` matches
// or the timeout elapses, returning whatever content was last read.
globalThis.waitForTypesBalContent = async (predicate, timeoutMs = 30000, pollMs = 1000) => {
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const typesBal = path.join(state.integrationDir, 'types.bal');
  const deadline = Date.now() + timeoutMs;
  let source = '';
  while (Date.now() < deadline) {
    source = fs.existsSync(typesBal) ? fs.readFileSync(typesBal, 'utf8') : '';
    if (predicate(source)) break;
    await window.waitForTimeout(pollMs);
  }
  return source;
};
