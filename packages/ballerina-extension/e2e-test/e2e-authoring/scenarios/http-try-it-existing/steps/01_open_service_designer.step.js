{
  // The fixture project already has the HTTP service defined in service.bal
  // (no project/service-creation step). The Overview's architecture diagram
  // discovers it from source and renders a "http:Service" node; clicking it
  // opens the Service Designer, which already shows the "Try It" button.
  await ensureWorkbench();
  const frame = await getBIWebview();
  const serviceNode = frame.getByText('http:Service', { exact: false }).first();
  await serviceNode.waitFor({ timeout: 30000 });
  await serviceNode.click({ force: true });
  await window.waitForTimeout(2000);
  await waitForText('Try It', 30000);
  console.log('opened Service Designer for the existing HTTP service');
}
