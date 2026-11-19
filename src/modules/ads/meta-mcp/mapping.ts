// Classification of every tool on Meta's Ads MCP server (https://mcp.facebook.com/ads).
// The snapshot says what exists; this file says how the harness may use it. A tool in one but not the
// other fails tests/ads/meta-mcp.test.ts, so nothing is exposed unclassified and nothing is left out.
export interface MetaMcpRule {
  write: boolean;
  /** Argument holding the ad account id. Writes without one are refused, so set it from the live schema. */
  accountParam?: string;
  /** Arguments may carry customer data: only SHA-256 hex is accepted. */
  pii?: true;
  /** Listed but never dispatched. */
  blocked?: string;
  /** Native harness tool covering the same ground. */
  native?: string;
}

const R = (native?: string): MetaMcpRule => ({ write: false, ...(native ? { native } : {}) });
const W = (extra: Omit<MetaMcpRule, 'write'> = {}): MetaMcpRule => ({ write: true, ...extra });

// ponytail: accountParam is unknown until the live tools/list snapshot (bin/meta-mcp-snapshot.js);
// until then every write is refused by assertMetaMcpAllowed. Fill accountParam per tool from that snapshot.
export const metaMcpMapping: Record<string, MetaMcpRule> = {
  // Comprehensive reporting
  ads_get_ad_entities: R('meta_ads_insights'),
  ads_get_opportunity_score: R(),
  ads_insights_advertiser_context: R(),
  ads_insights_anomaly_signal: R('meta_ads_get_performance_and_fatigue'),
  ads_insights_auction_ranking_benchmarks: R(),
  ads_insights_industry_benchmark: R(),
  ads_insights_performance_trend: R('meta_ads_insights'),
  // Ad creation and management
  ads_get_ad_accounts: R('meta_ads_list_accounts'),
  ads_get_ad_account_pages: R(),
  ads_get_pages_for_business: R('meta_ads_list_pages'),
  ads_get_user_pages: R(),
  ads_get_field_context: R(),
  ads_create_campaign: W({ native: 'meta_ads_create_campaign' }),
  ads_create_ad_set: W({ native: 'meta_ads_create_adset' }),
  ads_create_ad: W({ native: 'meta_ads_create_ad' }),
  ads_update_entity: W({ native: 'meta_ads_update_campaign' }),
  ads_activate_entity: W({ blocked: 'Activation is a manual step: review the paused objects and activate them in Ads Manager' }),
  ads_create_creative: W({ native: 'meta_ads_create_creative' }),
  ads_get_creatives: R('meta_ads_list_creative'),
  ads_get_creative_ads: R(),
  ads_get_ad_images: R(),
  ads_get_ad_videos: R(),
  ads_get_ad_preview: R(),
  ads_library_search: R('research_competitor_ads'),
  ads_get_ig_accounts: R('meta_ads_list_instagram_accounts'),
  ads_get_ig_media: R(),
  ads_boost_ig_post: W(),
  ads_get_ad_account_custom_audiences: R('meta_ads_list_audience'),
  ads_get_custom_audience: R('meta_ads_get_audience'),
  ads_get_custom_audience_adsets: R(),
  ads_create_custom_audience: W({ pii: true, native: 'meta_ads_create_audience' }),
  ads_update_custom_audience: W({ native: 'meta_ads_update_audience' }),
  ads_update_custom_audience_users: W({ pii: true, native: 'meta_ads_audience_add_users' }),
  ads_delete_custom_audience: W({ native: 'meta_ads_delete_audience' }),
  // Catalog creation and management
  ads_catalog_create: W({ native: 'meta_ads_create_catalog' }),
  ads_catalog_update_catalog: W({ native: 'meta_ads_update_catalog' }),
  ads_catalog_get_catalogs: R('meta_ads_list_catalog'),
  ads_catalog_get_details: R('meta_ads_get_catalog'),
  ads_catalog_get_diagnostics: R(),
  ads_catalog_get_dynamic_ads_health: R(),
  ads_catalog_get_data_sources: R(),
  ads_catalog_get_product_details: R('meta_ads_list_products'),
  ads_catalog_product_create: W(),
  ads_catalog_update_product: W(),
  ads_catalog_delete_product: W(),
  ads_catalog_get_product_product_sets: R(),
  ads_catalog_search_product: R('meta_ads_list_products'),
  ads_catalog_create_product_set: W({ native: 'meta_ads_create_product_set' }),
  ads_catalog_update_product_set: W({ native: 'meta_ads_update_product_set' }),
  ads_catalog_get_product_sets: R('meta_ads_list_product_set'),
  ads_catalog_get_product_set_details: R('meta_ads_get_product_set'),
  ads_catalog_get_product_set_products: R(),
  ads_catalog_product_set_delete: W({ native: 'meta_ads_delete_product_set' }),
  ads_catalog_create_product_feed: W({ native: 'meta_ads_create_product_feed' }),
  ads_catalog_update_product_feed: W({ native: 'meta_ads_update_product_feed' }),
  ads_catalog_get_product_feed_details: R('meta_ads_get_product_feed'),
  ads_catalog_create_product_feed_upload_session: W({ native: 'meta_ads_upload_feed' }),
  ads_catalog_get_product_feed_upload_sessions: R('meta_ads_list_feed_uploads'),
  ads_catalog_product_feed_delete: W({ native: 'meta_ads_delete_product_feed' }),
  ads_catalog_create_feed_rule: W(),
  ads_catalog_get_feed_rules: R(),
  ads_catalog_product_feed_delete_rule: W(),
  ads_catalog_event_source_get: R(),
  ads_catalog_event_source_get_catalogs: R(),
  ads_catalog_event_source_get_health: R(),
  ads_catalog_event_source_get_recommendations: R(),
  ads_catalog_event_source_connect: W(),
  ads_catalog_event_source_disconnect: W(),
  // Signals and datasets
  ads_get_datasets: R('meta_ads_list_pixels'),
  ads_get_dataset_details: R(),
  ads_get_dataset_stats: R(),
  ads_get_dataset_quality: R(),
  ads_pixel_event_read: R(),
  ads_pixel_event_create: W(),
  ads_pixel_event_update: W(),
  ads_pixel_event_delete: W(),
  ads_pixel_parameter_read: R(),
  ads_pixel_parameter_create: W(),
  ads_pixel_parameter_update: W(),
  ads_pixel_parameter_delete: W(),
  ads_get_customconversions: R(),
  // Help and troubleshooting
  ads_get_errors: R(),
  ads_get_help_article: R(),
  // A/B tests and conversion lift studies
  ads_experiment_list_tests: R(),
  ads_experiment_check_eligibility: R(),
  ads_experiment_abtest_create_test: W(),
  ads_experiment_abtest_get_test: R(),
  ads_experiment_abtest_update_test: W(),
  ads_experiment_lift_create_test: W(),
  ads_experiment_lift_get_test: R(),
  // Activity logs
  ads_account_get_activity_logs: R()
};

const normalize = (value: unknown) => String(value).replace(/^act_/, '');
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /^\+?[\d\s().-]{7,}$/;

// Numeric ids (audience_id, ad_account_id…) look like phone numbers, so `*id` keys are skipped.
function rawPersonalData(value: unknown, key = ''): boolean {
  if (/id$/i.test(key)) return false;
  if (typeof value === 'string') return EMAIL.test(value) || PHONE.test(value.trim());
  if (typeof value === 'number') return PHONE.test(String(value));
  if (Array.isArray(value)) return value.some(item => rawPersonalData(item));
  if (value && typeof value === 'object') return Object.entries(value).some(([k, v]) => rawPersonalData(v, k));
  return false;
}

/** Proxy-specific gates. The generic ads gates (mode, approval, allowlist, ACTIVE, money) still run after this. */
export function assertMetaMcpAllowed(metaName: string, args: { accountId?: string; arguments?: Record<string, unknown> }, rule = metaMcpMapping[metaName]): void {
  if (!rule) throw new Error(`Meta MCP tool ${metaName} is not classified in meta-mcp/mapping.ts`);
  if (rule.blocked) throw new Error(rule.blocked);
  const input = args.arguments ?? {};
  if (rule.write && !rule.accountParam) throw new Error(`Meta MCP write ${metaName} has no accountParam yet; refresh the snapshot and classify it before writing`);
  if (rule.accountParam && args.accountId !== undefined && input[rule.accountParam] !== undefined && normalize(input[rule.accountParam]) !== normalize(args.accountId)) throw new Error(`${rule.accountParam} does not match accountId`);
  if (rule.write && input[rule.accountParam!] === undefined) throw new Error(`Meta MCP write ${metaName} needs arguments.${rule.accountParam}`);
  if (rule.pii && rawPersonalData(input)) throw new Error('Customer data must be SHA-256 hashed before upload; raw emails or phone numbers are refused');
}
