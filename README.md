# Campaign lab

A static Amplitude demonstration for external campaigns, internal promotion rails, profile properties, persisted item context and attribution models. All products, visitors and costs are fictional. No customer notes or credentials are bundled.

## Run locally

Requires Node 22+; no package installation or build dependencies.

```sh
npm test
npm start
```

Open http://localhost:4173. `npm run build` creates the deployable `dist/` directory. Relative asset paths support GitHub Pages repository subpaths.

## Present

1. Play a journey and inspect its payloads. A single `Promotion Impression` holds multiple `products` objects. A click has one object; purchases contain only bought products, without promotion fields.
2. Compare multi-item, mismatched-product and expired journeys in Property lab. Local calculations are educational previews, not Amplitude queries.
3. Add an Amplitude project API key and US/EU region. The browser stores the key in localStorage. No secret or admin key is needed. No events are sent until **Send prepared events** is clicked.
4. Send one journey to expose the schema. Enable object-array splitting for `products` (Array / Any) in Amplitude. Because splitting applies to new ingestion, generate a fresh dataset afterward.
5. Configure the two item-bound persisted properties described in Reporting guide; use `products.item_id` consistently across impression, click, and purchase. Check split child-property support in the target project.
6. Prepare 48 synthetic visitors, optionally with synthetic daily ad metrics. Review expected outcomes, send, and filter charts by `demo_run_id` over the displayed date range. The default population has 40 orders, 48 purchased items: 24 click-through, 8 view-through-only, 16 unattributed under a 14-day Most recent rule.
7. Copy the generated Global Agent prompt to create a notebook in the selected project. If the data was already sent from another browser or an earlier version, enter its exact `demo_run_id` in **Existing run ID** on the notebook tab. This overrides locally prepared data; clear the field to use the local run again. The agent discovers event dates and queries counts for existing runs. Copy and download stay disabled until a real run ID is available. The prompt requests actual charts and clearly flags unsupported manual setup instead of inventing results.

The first-touch selector creates tagged landing URLs. Opening one captures its explicit UTM parameters on the first `Campaign Landed` event. The generated journeys then include subsequent campaign touches. This uses HTTP V2 directly for reproducible timestamps and explicit property placement, not SDK autocapture. The storefront is a scripted demonstrator; production visibility measurement would need its own implementation.

## Data semantics

- `user_properties` are deliberately sent as snapshots on each synthetic event, including current UTMs and `last_clicked_promo`. They illustrate profile state, not an automatic 14-day TTL.
- `products.campaign_code` is shared by impression/click objects. Separate `impression_campaign` / `click_campaign` fields support independent eligibility. They are never copied onto Purchase by the browser.
- `purchaseOutcomes` previews product matching and rolling lookback eligibility for the simple fixture journeys. It is not an implementation of Amplitude's allocation engine for arbitrary repeated campaigns. Check actual results in Amplitude.
- `Purchase.revenue` is an order total in AUD. Report it as a numeric property sum. Item revenue is `price × quantity`; never repeat whole-order revenue across each item.
- Synthetic `Daily Ad Metrics` uses separate device IDs, matching UTMs and numeric `ad_metrics.*` fields. It does not connect to advertising accounts. Real imports use Amplitude's Google/Facebook source connectors. Aggregate ad metrics cannot identify individual external ad viewers.
- Source events span roughly 18 days in the 48-visitor dataset, with purchases yesterday. Match project timezone and report dates. Session IDs are explicit epoch milliseconds.
- The sender uses batches of 40 and at most four attempts for transient failures. Insert IDs stay stable on retries. Confirmed batches are saved per hashed destination (region + key). A partial response remains unconfirmed and is retried with the same IDs; Amplitude's deduplication window is finite, so retry promptly and verify ambiguous partial ingestion before rerunning days later.
- Local dataset/payloads and settings persist in this browser. Exported JSON and notebook prompts omit the API key. The site loads optional Google Fonts; events are transmitted only to the selected Amplitude host. Avoid credentials in UTM URLs.

## Deployment

The Actions workflow tests, builds and publishes `dist/` to GitHub Pages on `main`. Select GitHub Actions as the repository's Pages source. Pull requests run tests/build without deploying.

## Validation

`npm test` covers item identity, view-through exclusion, mismatched products, multi-item revenue, 14-day expiration, session allocation, population totals, cost isolation, stable IDs, partial ingestion, retries and notebook scoping. Browser verification covers navigation, journey steps, property controls, generated data, prompt generation and responsive layout. No real Amplitude ingestion is validated without a supplied demo project key.

## References

- [Persisted properties](https://amplitude.com/docs/data/persisted-properties)
- [Verification](https://amplitude.com/docs/data/persisted-properties/verify-persisted-properties)
- [Attribution models](https://amplitude.com/docs/analytics/charts/data-tables/data-tables-attribute-credit)
- [Object arrays](https://amplitude.com/docs/analytics/charts/cart-analysis)
- [Marketing Analytics](https://amplitude.com/docs/analytics/ootb-marketing-analytics)
- [Google Ads source](https://amplitude.com/docs/data/source-catalog/google-ads)
- [Facebook Ads source](https://amplitude.com/docs/data/source-catalog/facebook-ads)
- [Notebooks](https://amplitude.com/docs/analytics/notebooks)
- [HTTP V2](https://amplitude.com/docs/apis/analytics/http-v2)

Documentation reviewed 13 November 2026. Project capabilities and permissions can affect setup.
