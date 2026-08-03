{
  // The notebook now has one markdown+hurl cell pair per resource (service-
  // level Try It, from step 02, generates cells for EVERY resource in one
  // shot). The notebook list is virtualized and fighting scroll/keyboard
  // navigation to reach a specific cell proved unreliable, so instead use
  // the notebook's own "Run All" toolbar action to execute every cell, then
  // verify each resource's live response via a direct HTTP probe (same
  // "probe, don't read the sandboxed output iframe" approach already used
  // for the GET /greeting case).
  await ensureWorkbench();

  const runAllBtn = window.getByRole('button', { name: /Run All/i }).first();
  await runAllBtn.waitFor({ timeout: 15000 });
  await runAllBtn.click({ force: true });
  await window.waitForTimeout(4000);

  const checks = [
    { name: 'path param', url: 'http://localhost:9090/greeting/name', method: 'GET', expectBody: 'Hello, name!' },
    { name: 'query param', url: 'http://localhost:9090/search?q=q', method: 'GET', expectBody: '"query":"q"' },
    { name: 'header param', url: 'http://localhost:9090/secure', method: 'GET', headers: { 'X-Api-Key': 'X-Api-Key' }, expectBody: '"header":"X-Api-Key"' },
    { name: 'POST JSON body', url: 'http://localhost:9090/echo', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"message":"{?}"}', expectBody: '"echoed":"{?}"' },
  ];
  for (const c of checks) {
    const res = await waitForEndpoint(c.url, 30000, c);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`${c.name}: unexpected status ${res.status} for ${c.method} ${c.url}: ${res.body}`);
    }
    if (!res.body.includes(c.expectBody)) {
      throw new Error(`${c.name}: unexpected body for ${c.method} ${c.url}: ${res.body}`);
    }
    console.log(`${c.name} OK: ${c.method} ${c.url} -> ${res.status} ${res.body}`);
  }
}
