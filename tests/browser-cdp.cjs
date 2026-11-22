const [port, expectedUrl] = process.argv.slice(2);
(async () => {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
  const target = targets.find(t => t.type === 'page' && t.url.startsWith(expectedUrl));
  if (!target) throw Error('No matching local browser target');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  try {
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('CDP wait expired')), 18000);
      const finish = callback => value => { clearTimeout(timer); callback(value); };
      socket.addEventListener('error', finish(() => reject(Error('CDP socket error'))), { once: true });
      socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        if (message.error || message.result?.exceptionDetails) finish(reject)(Error('CDP evaluation failed'));
        else finish(resolve)(message.result.result.value);
      });
      socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
        awaitPromise: true, returnByValue: true, expression: `new Promise(resolve => {
          const started = Date.now();
          const timer = setInterval(() => {
            const text = document.querySelector('#audit-results')?.textContent;
            let value = text ? JSON.parse(text) : { phase: 'not-started' };
            if (!value.phase || Date.now() - started > 12000) { clearInterval(timer); resolve(value); }
          }, 50);
        })`,
      }})), { once: true });
    });
    console.log(JSON.stringify(result));
  } finally { socket.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
