{
  const frame = await getBIWebview();

  // "Sample" restricts the view to the built-in samples, excluding
  // "Pre-built Integrations" — the resulting count must be strictly smaller
  // than the unfiltered "All" count captured in step 1.
  await guestClick(frame.getByRole('button', { name: 'Sample', exact: true }));
  await window.waitForTimeout(1000);

  const snap = await snapshot();
  const match = snap.match(/(\d+) results?/);
  if (!match) throw new Error(`could not find a results count after filtering by "Sample":\n${snap}`);
  const filteredCount = Number(match[1]);
  console.log(`sample-only count: ${filteredCount} (was ${globalThis.initialSampleCount})`);
  if (!(filteredCount < globalThis.initialSampleCount)) {
    throw new Error(`expected filtered count (${filteredCount}) to be less than initial count (${globalThis.initialSampleCount})`);
  }

  console.log('done: 02_filter_type');
}
