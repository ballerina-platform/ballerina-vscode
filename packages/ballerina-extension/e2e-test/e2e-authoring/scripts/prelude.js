// Loaded into the authoring daemon VM context.

globalThis.guestFrame = null;

globalThis.ensureWorkbench = async () => {
  if (!window || window.isClosed?.()) {
    // Opening the newly created project reloads the VS Code window. Playwright's
    // firstWindow() does NOT re-fire for a reload (only for a brand-new window),
    // so it would hang until timeout. Prefer an already-open window from the
    // app's window list, falling back to firstWindow only if none is open yet.
    const deadline = Date.now() + 60000;
    let picked = null;
    while (Date.now() < deadline) {
      const open = (vscode.windows?.() || []).filter((w) => !w.isClosed?.());
      if (open.length) { picked = open[open.length - 1]; break; }
      await new Promise((r) => setTimeout(r, 500));
    }
    window = picked || (await vscode.firstWindow({ timeout: 60000 }));
    await window.waitForLoadState('domcontentloaded').catch(() => {});
    extendedPage = new ExtendedPage(window);
  }
  return window;
};

globalThis.waitForGuest = async (viewName = BI_INTEGRATOR_LABEL, timeout = 30000) => {
  await ensureWorkbench();
  const deadline = Date.now() + timeout;
  let lastError = 'unknown';
  while (Date.now() < deadline) {
    try {
      const frame = await switchToIFrame(viewName, window, 5000);
      if (frame) {
        guestFrame = frame;
        return frame;
      }
      lastError = `switchToIFrame(${viewName}) returned no frame`;
    } catch (error) {
      lastError = error.message;
    }
    try {
      const webview = window.locator('iframe.webview.ready').last();
      if (await webview.isVisible({ timeout: 1000 }).catch(() => false)) {
        const outer = await (await webview.elementHandle()).contentFrame();
        const child = outer?.childFrames().find((frame) => {
          try {
            return frame.url().includes('vscode-webview') || frame.url().includes('fake.html');
          } catch {
            return false;
          }
        }) ?? outer?.childFrames()[0] ?? outer;
        if (child) {
          await child.waitForLoadState().catch(() => {});
          guestFrame = child;
          return child;
        }
      }
    } catch (error) {
      lastError = error.message;
    }
    await window.waitForTimeout(500);
  }
  throw new Error(`BI webview not ready: ${lastError}`);
};

globalThis.getBIWebview = async (timeout = 30000) => waitForGuest(BI_INTEGRATOR_LABEL, timeout);

globalThis.snapshot = async (filter) => {
  const frame = await getBIWebview();
  const raw = await frame.locator('body').ariaSnapshot();
  if (!filter) return raw;
  const re = filter instanceof RegExp ? filter : new RegExp(filter, 'i');
  return raw.split('\n').filter((line) => re.test(line)).join('\n');
};

globalThis.hostSnapshot = async () => {
  await ensureWorkbench();
  return window.locator('body').ariaSnapshot();
};

globalThis.waitForText = async (text, timeout = 30000) => {
  await ensureWorkbench();
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const snap = await snapshot().catch(() => '');
    if (snap.includes(text)) return snap;
    await window.waitForTimeout(500);
  }
  throw new Error(`waitForText("${text}") timed out after ${timeout}ms`);
};

globalThis.guestClick = async (locator) => {
  await locator.waitFor({ state: 'visible', timeout: 30000 });
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click({ force: true });
};

globalThis.domClick = async (locator) => {
  // Mode-switcher labels can render outside the viewport at this window
  // size — dispatch a DOM click instead of a pointer click.
  await locator.waitFor({ state: 'attached', timeout: 15000 });
  await locator.evaluate((el) => el.click());
};

globalThis.guestFill = async (locator, text) => {
  await locator.waitFor({ state: 'visible', timeout: 30000 });
  await locator.click({ force: true });
  await locator.fill('').catch(async () => {
    await window.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  });
  await window.keyboard.type(text);
};

globalThis.cmFill = async (text, index = 0) => {
  const frame = await getBIWebview();
  await frame.evaluate(({ text, index }) => {
    const els = document.querySelectorAll('.cm-content');
    const el = els[index];
    if (!el) throw new Error(`CodeMirror editor not found at index ${index}`);
    const view = el.cmView?.view;
    if (!view) throw new Error('CodeMirror view instance not found');
    view.focus();
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }, { text, index });
};

globalThis.listTestIds = async () => {
  const frame = await getBIWebview();
  return frame.locator('[data-testid]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-testid')).filter(Boolean).sort()
  );
};

globalThis.recordSelectorGap = (description, preferredTestId) => {
  const out = path.join(sessionDir, 'selector-gaps.md');
  fs.appendFileSync(out, `- ${description} -> \`${preferredTestId}\`\n`);
  return out;
};

// Style shared by both the configurable chip and the variable chip in the
// multi-mode expression / prompt editors — a blue inline CM widget with the
// fw-bi-variable icon.
globalThis.CHIP_BACKGROUND_STYLE = 'rgba(59, 130, 246';
globalThis.CHIP_ICON_SELECTOR = 'i.fw-bi-variable';

globalThis.assertBlueChip = async (chip, label) => {
  const style = await chip.getAttribute('style');
  if (!style || !style.includes(CHIP_BACKGROUND_STYLE)) {
    throw new Error(`${label} chip is not blue: ${style}`);
  }
  if ((await chip.locator(CHIP_ICON_SELECTOR).count()) === 0) {
    throw new Error(`${label} chip missing variable icon`);
  }
};

// The diagram library doesn't reliably react to Playwright's native
// click/force-click on a node's text — the event dispatches without error
// but the node's onClick handler doesn't always fire. A full synthetic
// pointer-event sequence (matching the diagram's own add-button click
// pattern) is what it actually needs to register reliably.
globalThis.diagramClick = async (locator) => {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  await locator.evaluate((el) => {
    for (const type of ['pointerover', 'mouseover', 'mouseenter', 'pointerenter', 'pointerdown', 'mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
  });
};

// A single retry after diagramClick can still leave the panel closed under
// real CI load (the same swallowed-click issue diagramClick itself works
// around, just needing more than one attempt) — confirmed by a real failure
// in the promoted spec where two clicks in a row both failed to open the
// mode switcher. Keep re-clicking the node until it actually appears rather
// than giving up after one retry.
globalThis.reopenRecordNode = async (node, recordMode) => {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await recordMode.isVisible().catch(() => false)) return;
    await diagramClick(node);
    await window.waitForTimeout(1500);
  }
  await recordMode.waitFor({ state: 'visible', timeout: 15000 });
};

// Focusing the record preview editor is what opens the Record Configuration
// modal, but the click/focus can be swallowed while the panel is
// re-rendering after a mode switch — retry with real delays until the modal
// actually appears, rather than a single click with no fallback.
//
// BUG FOUND VIA TRACE INSPECTION (promoted spec CI run): the retry loop's own
// click on the mode-switcher tab timed out because the side panel had fully
// closed mid-retry (e.g. a stray force-click landing on the canvas behind a
// stale/duplicate testid match). Once the panel is closed, clicking the mode
// tab can never reopen it — only re-clicking the diagram node can. Take the
// node locator too so the loop can recover instead of burning the whole
// deadline retrying a closed panel.
globalThis.openRecordConfigModal = async (nodeLocator, recordModeLocator) => {
  const frame = await getBIWebview();
  const overlay = frame.locator('.unq-modal-overlay').last();
  const modalMarker = overlay.getByText('Select fields to construct the record');
  // Generous deadline: under real system load a single supposedly-instant
  // JS evaluate() has been observed to stall for ~30s (confirmed via
  // Playwright trace inspection, not a logic issue).
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (await modalMarker.isVisible({ timeout: 1000 }).catch(() => false)) break;
    if (!(await recordModeLocator.isVisible().catch(() => false))) {
      // Panel closed entirely — reopen it via the diagram node before trying
      // to click the (currently nonexistent) mode tab.
      await diagramClick(nodeLocator).catch(() => {});
      await window.waitForTimeout(1000);
    }
    await recordModeLocator.evaluate((el) => el.click()).catch(() => {});
    await window.waitForTimeout(1000);
    const preview = frame.locator('[data-testid="ex-editor-expression"] textarea, [data-testid="ex-editor-expression"] input, [data-testid="ex-editor-expression"] .cm-content').last();
    await preview.click({ force: true, timeout: 5000 }).catch(() => {});
    await preview.evaluate((el) => el.focus()).catch(() => {});
    await window.waitForTimeout(1500);
  }
  await modalMarker.waitFor({ timeout: 15000 });
  return overlay;
};

globalThis.waitForEndpoint = async (url, timeout = 60000, opts = {}) => {
  const deadline = Date.now() + timeout;
  const body = opts.bodyFile ? fs.readFileSync(opts.bodyFile) : opts.body;
  while (Date.now() < deadline) {
    const result = await new Promise((resolve) => {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(
        u,
        { method: opts.method || 'GET', headers: opts.headers || {}, timeout: 5000 },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
        }
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      if (body !== undefined) req.write(body);
      req.end();
    });
    if (result && result.status > 0) return result;
    await window.waitForTimeout(1000);
  }
  throw new Error(`waitForEndpoint("${url}") timed out after ${timeout}ms`);
};
