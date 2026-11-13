export const DAY = 86400000;
export const PRODUCTS = [
  { item_id: 'PHONE-01', item_name: 'Orbit Pro', category: 'Mobile phones', price: 1199, campaign_code: 'INT-PHONE-HERO', position: 1, colour: 'peach' },
  { item_id: 'BUDS-02', item_name: 'Airwave Buds', category: 'Accessories', price: 199, campaign_code: 'INT-BUDS-RAIL', position: 2, colour: 'lavender' },
  { item_id: 'WIFI-03', item_name: 'Home Wi-Fi Hub', category: 'Home internet', price: 299, campaign_code: 'INT-WIFI-RAIL', position: 3, colour: 'mint' },
  { item_id: 'CASE-04', item_name: 'Everyday Case', category: 'Accessories', price: 49, campaign_code: 'INT-CASE-RAIL', position: 4, colour: 'sand' },
];
export const CAMPAIGNS = {
  google: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'summer_mobile_search', utm_content: 'phone_text', utm_term: 'new_phone' },
  facebook: { utm_source: 'facebook', utm_medium: 'paid_social', utm_campaign: 'summer_mobile_social', utm_content: 'phone_video', utm_term: 'prospecting' },
  email: { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'summer_member_email', utm_content: 'member_offer', utm_term: 'members' },
};
export const SCENARIOS = {
  click: { title: 'Click → purchase', detail: 'See three offers, click the phone, buy the phone.', question: 'Which internal promotion led to the purchase?' },
  view: { title: 'View → purchase', detail: 'See the phone offer, browse via navigation, buy without clicking.', question: 'Which advertised products were bought without a promo click?' },
  mismatch: { title: 'See A, buy B', detail: 'See the phone and buds, buy a case that was never advertised.', question: 'Can we avoid giving unrelated banners credit?' },
  multi: { title: 'Two items, two sources', detail: 'Click the phone, later click the buds, buy both in one order.', question: 'Can each item retain its own discovery context?' },
  expired: { title: 'Return after 15 days', detail: 'Click an offer, return after the 14-day window, then buy.', question: 'Why is a profile value still set after persistence expires?' },
  abandon: { title: 'Look, then leave', detail: 'See the rail, click an item, but make no purchase.', question: 'What is the denominator for CTR and conversion?' },
};

function item(product, type) {
  const { item_id, item_name, category, price, campaign_code, position } = product;
  const result = { item_id, item_name, category, price, quantity: 1 };
  if (type === 'impression') Object.assign(result, { campaign_code, impression_campaign: campaign_code, position });
  if (type === 'click') Object.assign(result, { campaign_code, click_campaign: campaign_code, position });
  return result;
}

export function makeJourney(scenario, runId, index = 0, end = Date.now() - 60000, campaignOverride) {
  if (!SCENARIOS[scenario]) throw new Error('Unknown scenario');
  const start = end - (scenario === 'expired' ? 15 * DAY : 2 * DAY) - 600000;
  const userId = `playground-demo-${runId}-${index}`;
  let sequence = 0;
  let profile = { customer_type: index % 2 ? 'Existing customer' : 'New customer', membership_tier: index % 2 ? 'Silver' : 'None' };
  const events = [];
  const add = (event_type, time, session_id, props = {}) => {
    const event = {
      user_id: userId, device_id: `${userId}-device`, event_type, time, session_id,
      insert_id: `${userId}-${sequence}`, event_id: sequence++, platform: 'Web',
      user_properties: { ...profile },
      event_properties: { demo_run_id: runId, demo_scenario: scenario, demo_source: 'attribution-playground', ...props },
    };
    events.push(event); return event;
  };
  const land = (campaign, time, session) => {
    profile = { ...profile, ...campaign, initial_utm_campaign: profile.initial_utm_campaign || campaign.utm_campaign };
    add('Campaign Landed', time, session, { ...campaign, page_path: '/', external_campaign_code: campaign.utm_campaign });
  };
  land(campaignOverride || CAMPAIGNS.google, start, start);
  add('Page Viewed', start + 1000, start, { page_path: '/phones' });
  let current = end - 600000;
  const session = current;
  if (scenario === 'expired') {
    // This impression/click is in the old session; the purchase returns directly 15 days later.
    current = start + 60000;
  } else {
    land(CAMPAIGNS.facebook, current, session);
    current += 1000;
  }
  const exposureSession = scenario === 'expired' ? start : session;
  add('Promotion Impression', current, exposureSession, {
    rail_id: 'home-offers', impression_id: `${userId}-rail-1`,
    products: PRODUCTS.slice(0, scenario === 'mismatch' ? 2 : 3).map(p => item(p, 'impression')),
  });
  current += 2000;
  if (['click', 'multi', 'expired', 'abandon'].includes(scenario)) {
    profile.last_clicked_promo = PRODUCTS[0].campaign_code;
    add('Promotion Clicked', current, exposureSession, { rail_id: 'home-offers', impression_id: `${userId}-rail-1`, products: [item(PRODUCTS[0], 'click')] });
  }
  if (scenario === 'multi') {
    profile.last_clicked_promo = PRODUCTS[1].campaign_code;
    add('Promotion Clicked', current + 2000, exposureSession, { rail_id: 'home-offers', impression_id: `${userId}-rail-1`, products: [item(PRODUCTS[1], 'click')] });
  }
  if (scenario === 'abandon') return events;
  const purchased = scenario === 'mismatch' ? [PRODUCTS[3]] : scenario === 'multi' ? PRODUCTS.slice(0, 2) : [PRODUCTS[0]];
  const purchaseSession = scenario === 'expired' ? end - 60000 : session;
  add('Product Viewed', end - 50000, purchaseSession, { navigation_method: ['view', 'mismatch', 'expired'].includes(scenario) ? 'navigation' : 'promotion', products: purchased.map(p => item(p)) });
  add('Product Added', end - 30000, purchaseSession, { products: purchased.map(p => item(p)) });
  const revenue = purchased.reduce((total, p) => total + p.price, 0);
  add('Purchase', end, purchaseSession, { order_id: `${userId}-order`, currency: 'AUD', revenue, products: purchased.map(p => item(p)) });
  return events;
}

export function buildDataset(runId, count = 48, now = Date.now()) {
  if (!Number.isInteger(count) || count < 6 || count > 240) throw new Error('Choose 6–240 synthetic visitors');
  const scenarios = Object.keys(SCENARIOS);
  const events = Array.from({ length: count }, (_, i) => makeJourney(scenarios[i % scenarios.length], runId, i, now - DAY - Math.floor(i / 6) * 3600000)).flat();
  return events.sort((a, b) => a.time - b.time || a.event_id - b.event_id);
}

export function costEvents(runId, events) {
  // Synthetic campaign-day aggregates. These are not retrieved from advertising accounts.
  const days = new Map();
  for (const event of events.filter(e => e.event_type === 'Campaign Landed')) {
    const p = event.event_properties;
    const date = new Date(event.time).toISOString().slice(0, 10);
    const key = `${date}-${p.utm_campaign}`;
    if (!days.has(key)) days.set(key, { date, p, clicks: 0 });
    days.get(key).clicks++;
  }
  return [...days.entries()].map(([key, { date, p, clicks }]) => {
    const utms = Object.fromEntries(Object.keys(CAMPAIGNS.google).map(k => [k, p[k]]));
    return {
      device_id: `ad-aggregate-${runId}-${key}`, event_type: 'Daily Ad Metrics',
      time: Date.parse(`${date}T12:00:00Z`), session_id: -1, insert_id: `${runId}-cost-${key}`,
      user_properties: utms,
      event_properties: { demo_run_id: runId, demo_source: 'attribution-playground', synthetic_cost: true, currency: 'AUD', ...utms,
        ad_platform: p.utm_source, campaign_id: p.utm_campaign, campaign_name: p.utm_campaign,
        ad_account_id: 'synthetic-demo-account', ad_id: p.utm_content,
        'ad_metrics.impressions': clicks * 80, 'ad_metrics.clicks': clicks, 'ad_metrics.cost': clicks * (p.utm_source === 'google' ? 8 : 5) },
    };
  });
}

export function persistedValue(events, target, { property, allocation = 'Most recent', window = '14d', itemId } = {}) {
  const duration = window === 'session' ? Infinity : Number(window.replace('d', '')) * DAY;
  const wholeSession = ['First known', 'Last known'].includes(allocation);
  if (wholeSession && window !== 'session') throw new Error('First known / Last known require Session expiration');
  const values = events.filter(e => e.user_id === target.user_id &&
    (window !== 'session' || e.session_id === target.session_id) &&
    (wholeSession || e.time <= target.time) && e.time >= target.time - duration)
    .sort((a,b) => a.time - b.time || a.event_id - b.event_id)
    .flatMap(e => {
      const value = itemId ? e.event_properties.products?.find(p => p.item_id === itemId)?.[property] : e.event_properties[property];
      return value === undefined ? [] : [{ value, time: e.time }];
    });
  return (['Original', 'First known'].includes(allocation) ? values[0] : values.at(-1))?.value ?? null;
}

// Educational weights for a simple ordered list of distinct campaign touches, not Amplitude's query engine.
export function attributionWeights(touches, model = 'Linear') {
  if (!touches.length) return [];
  const n = touches.length;
  let weights = Array(n).fill(0);
  if (n === 1) weights[0] = 1;
  else if (model === 'First touch') weights[0] = 1;
  else if (model === 'Last touch') weights[n - 1] = 1;
  else if (model === 'Participation') weights.fill(1);
  else if (model === 'U-shaped') {
    weights = n === 2 ? [.5, .5] : weights.map((_,i) => i === 0 || i === n - 1 ? .4 : .2 / (n - 2));
  } else weights.fill(1 / n);
  return touches.map((campaign, i) => ({ campaign, weight: weights[i] }));
}

export function purchaseOutcomes(events, window = '14d', allocation = 'Most recent') {
  return events.filter(e => e.event_type === 'Purchase').flatMap(e => e.event_properties.products.map(product => {
    const args = { allocation, window, itemId: product.item_id };
    const click = persistedValue(events, e, { ...args, property: 'click_campaign' });
    const impression = persistedValue(events, e, { ...args, property: 'impression_campaign' });
    return { user: e.user_id, scenario: e.event_properties.demo_scenario, item: product.item_id, name: product.item_name,
      revenue: product.price * product.quantity, raw: product.campaign_code ?? null,
      profile: e.user_properties.last_clicked_promo ?? null, click, impression,
      outcome: click ? 'Click-through' : impression ? 'View-through only' : 'Unattributed' };
  }));
}
