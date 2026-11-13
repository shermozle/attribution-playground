import { purchaseOutcomes } from './model.js';

export function completedRunRecord(dataset, destination, { region, project = '', sentAt = null } = {}) {
  const events = dataset?.events;
  if (!Array.isArray(events) || !events.length || !destination || !dataset.runId) return null;
  const accepted = new Set(dataset.accepted?.[destination] || []);
  if (!events.every(e => e.insert_id && accepted.has(e.insert_id) && e.event_properties?.demo_run_id === dataset.runId)) return null;
  const outcomes = purchaseOutcomes(events);
  return {
    runId: dataset.runId, destination, region, project, sentAt,
    eventCount: events.length,
    start: Math.min(...events.map(e => e.time)), end: Math.max(...events.map(e => e.time)),
    expected: {
      purchases: events.filter(e => e.event_type === 'Purchase').length, items: outcomes.length,
      clickThrough: outcomes.filter(o => o.outcome === 'Click-through').length,
      viewThroughOnly: outcomes.filter(o => o.outcome === 'View-through only').length,
      unattributed: outcomes.filter(o => o.outcome === 'Unattributed').length,
    },
  };
}

export function rememberRun(history, record) {
  if (!record) return history;
  const previous = history.find(r => r.destination === record.destination && r.runId === record.runId);
  // A retry of an unchanged, already-accepted dataset isn't a new send.
  const merged = previous?.eventCount === record.eventCount ? {
    ...previous, ...record, sentAt: previous.sentAt ?? record.sentAt,
    project: record.project || previous.project,
    region: record.region === 'Unknown region' ? previous.region || record.region : record.region,
  } : record;
  return [...history.filter(r => r.destination !== record.destination || r.runId !== record.runId), merged]
    .sort((a,b) => (b.sentAt || b.end) - (a.sentAt || a.end));
}

export function runsForDestination(history, destination) {
  return history.filter(r => !destination || r.destination === destination)
    .sort((a,b) => (b.sentAt || b.end) - (a.sentAt || a.end));
}
