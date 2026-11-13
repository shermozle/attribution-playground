export const ENDPOINTS = { US: 'https://api2.amplitude.com/2/httpapi', EU: 'https://api.eu.amplitude.com/2/httpapi' };

export async function sendEvents({ apiKey, region, events, accepted = new Set(), onProgress = () => {}, fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  if (!apiKey?.trim()) throw new Error('Add a project API key first.');
  if (!ENDPOINTS[region]) throw new Error('Choose US or EU.');
  const pending = events.filter(e => !accepted.has(e.insert_id));
  for (let offset = 0; offset < pending.length; offset += 40) {
    const batch = pending.slice(offset, offset + 40);
    for (let attempt = 0; attempt < 4; attempt++) {
      let response;
      try {
        response = await fetchImpl(ENDPOINTS[region], { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: apiKey.trim(), events: batch }), signal: AbortSignal.timeout(20000) });
      } catch {
        if (attempt === 3) throw new Error('Could not reach Amplitude. Check your network, ad blocker and region, then retry. The same insert IDs will be reused.');
        await sleep(1000 * 2 ** attempt); continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 3) { await sleep(1000 * 2 ** attempt); continue; }
      let body;
      try { body = await response.json(); } catch { throw new Error(`Amplitude returned HTTP ${response.status} without a readable response. Retry with the same run.`); }
      if (!response.ok || body.code !== 200 || body.events_ingested !== batch.length) {
        // A rejected batch may be partially accepted. Retrying keeps stable insert_ids for server deduplication.
        const hint = response.status === 400 ? 'Check the API key, schema enforcement and event fields.' : response.status === 413 ? 'Batch too large.' : 'Check your project and data region.';
        throw new Error(`Amplitude response ${response.status}: ${body.events_ingested ?? 0}/${batch.length} confirmed in this batch. ${hint} Retry keeps the same insert IDs.`);
      }
      batch.forEach(e => accepted.add(e.insert_id));
      onProgress(accepted.size, events.length);
      break;
    }
  }
  return accepted;
}
