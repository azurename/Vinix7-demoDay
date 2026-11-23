const [port, url, viewport] = process.argv.slice(2);
const [width, height] = viewport.split(',').map(Number);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
  const target = targets.find(t => t.type === 'page' && t.url === 'about:blank');
  if (!target) throw Error('No isolated browser target');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    if (message.error) request.reject(Error(message.error.message));
    else request.resolve(message.result);
  });
  const cdp = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => reject(Error(`CDP timeout: ${method}`)), 6000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };

  try {
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(Error('CDP socket error')), { once: true });
    });
    const exceptions = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        exceptions.push(details.exception?.description || details.text);
      }
    });
    await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const navigation = await cdp('Page.navigate', { url });
    if (navigation.errorText) throw Error(navigation.errorText);
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (await evaluate(`document.readyState === 'complete' && typeof runVinixAudit === 'function'`).catch(() => false)) {
        console.log(JSON.stringify(await evaluate('runVinixAudit()')));
        return;
      }
      await wait(100);
    }
    const state = await evaluate(`({ url: location.href, ready: document.readyState, scripts: document.scripts.length, title: document.title, audit: typeof runVinixAudit })`);
    throw Error(`Audit page did not load: ${JSON.stringify({ state, exceptions })}`);
  } finally { socket.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
