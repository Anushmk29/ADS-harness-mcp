import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { adsTools, adsToolMap, type AdsTool, type Platform } from './tools.js';
import { AdsTransport, HierarchyDispatchError, ProviderError, type ProviderOptions } from './transport.js';
import { OperationJournal, payloadHash, transition, type Operation, type OperationBinding } from './journal.js';
import { comparePerformance, analyzeCreative } from './measurement.js';
import { AdsState } from './state.js';
import { assessGA4Readiness, assessGoogleReadiness, assessMetaReadiness, auditGA4Tracking, reconcileMeasurement, validateGA4Report, validateGoogleCampaignType, validateGoogleSearchCampaign, validateMetaCampaign } from './contracts.js';
import { assertMetaMcpAllowed } from './meta-mcp/mapping.js';
import { ga4ReportTemplates, googleReportTemplates, prepareGoogleSearchLaunch, prepareMetaLaunch } from './planning.js';
import { dataDir } from '../../config/paths.js';

export interface AdsOptions extends ProviderOptions {
  storageDir?: string;
  mode?: AdsExecutionMode | 'review' | 'autonomous';
  accounts?: Partial<Record<Platform, string[]>>;
  allowedObjects?: string[];
  maxBudgetPerWrite?: Partial<Record<Platform, number>>;
  verifiedAccounts?: Partial<Record<Platform, string[]>>;
  platforms?: Platform[];
  enableGA4Alpha?: boolean;
  /** Expose Meta's Ads MCP tools as meta_mcp_*; defaults to ADS_META_MCP=on. */
  enableMetaMcp?: boolean;
}
export type AdsExecutionMode = 'off' | 'dry-run' | 'live-with-approval';
const policySchema = z.object({
  mode: z.enum(['off','dry-run','live-with-approval','review','autonomous']).default('dry-run'),
  accounts: z.object({ meta: z.array(z.coerce.string()).optional(), google: z.array(z.coerce.string()).optional(), ga4: z.array(z.coerce.string()).optional() }).default({}),
  verifiedAccounts: z.object({ meta: z.array(z.coerce.string()).optional(), google: z.array(z.coerce.string()).optional(), ga4: z.array(z.coerce.string()).optional() }).default({}),
  allowedObjects: z.array(z.string()).default([]),
  maxBudgetPerWrite: z.object({ meta: z.number().positive().optional(), google: z.number().positive().optional() }).default({})
}).strict();
export class AdsService {
  private transport: AdsTransport;
  private journal?: OperationJournal;
  private state?: AdsState;
  private closed = false;
  private workerId = randomUUID();
  constructor(private options: AdsOptions = {}) {
    const file = process.env.ADS_POLICY_FILE || 'config/ads-module.yaml';
    const policy: Partial<z.infer<typeof policySchema>> = existsSync(file) ? policySchema.parse(YAML.parse(readFileSync(file, 'utf8'))) : {};
    this.options = { ...policy, ...options, mode: this.normalizeMode(options.mode ?? policy.mode) };
    this.transport = new AdsTransport(this.options);
  }
  listTools() {
    return adsTools.filter(tool => (!this.options.platforms || this.options.platforms.includes(tool.platform)) && (tool.action !== 'meta_mcp' || this.metaMcpEnabled())).map(tool => ({ name: tool.name, description: tool.description, platform: tool.platform, write: tool.write,
      parameters: tool.jsonSchema ?? zodToJsonSchema(tool.schema, { target: 'jsonSchema7', $refStrategy: 'none' }), verification: 'implemented-not-live-verified' }));
  }
  /** Allowlisted accounts from config/ads-module.yaml (what the daily KPI snapshot reads). */
  configuredAccounts(): Partial<Record<Platform, string[]>> { return { ...(this.options.accounts ?? {}) }; }
  private metaMcpEnabled(): boolean { return this.options.enableMetaMcp ?? process.env.ADS_META_MCP === 'on'; }
  private store() {
    if (this.closed) throw new Error('Ads service is closed');
    return this.journal ??= new OperationJournal(this.adsDir());
  }
  private records() {
    if (this.closed) throw new Error('Ads service is closed');
    return this.state ??= new AdsState(this.adsDir());
  }
  /** storageDir is the data root; the ads journal and state always live in <root>/ads. */
  private adsDir() {
    const root = this.options.storageDir ?? dataDir(), dir = join(root, 'ads');
    migrateLegacyAdsFiles(root, dir);
    return dir;
  }
  private normalizeMode(mode: AdsOptions['mode']): AdsExecutionMode {
    if (mode === 'review' || mode === 'autonomous') return 'live-with-approval';
    return mode ?? 'dry-run';
  }
  private mode(): AdsExecutionMode { return this.normalizeMode(this.options.mode); }
  private isVerifiedAccount(platform: Platform, accountId: string): boolean {
    const normalize = (value: string) => value.replace(/^act_/, '');
    return Boolean(this.options.verifiedAccounts?.[platform]?.some(value => normalize(value) === normalize(accountId)));
  }
  private requirePlatform(tool: AdsTool) {
    if (this.options.platforms && !this.options.platforms.includes(tool.platform)) throw new Error('Operation belongs to another department');
  }
  private scope(tool: AdsTool, args: any) {
    this.requirePlatform(tool);
    if (tool.action === 'meta_mcp') assertMetaMcpAllowed(tool.resource!, args);
    if (tool.platform !== 'meta' && args.accountId?.startsWith('act_')) throw new Error('Only Meta accepts act_ IDs');
    const accounts = this.options.accounts?.[tool.platform] ?? [];
    const normalize = (s: string) => s.replace(/^act_/, '');
    if (args.accountId && accounts.length && !accounts.some(id => normalize(id) === normalize(args.accountId))) throw new Error('Account/property is outside the configured allowlist');
    if (tool.write && !accounts.some(id => normalize(id) === normalize(args.accountId))) throw new Error('Write account is not in the configured account allowlist');
    if (args.parentId && tool.parent !== 'account' && tool.write && !this.options.allowedObjects?.includes(args.parentId)) throw new Error('Parent Page/business/catalog is not in allowedObjects');
    if (tool.action === 'object_post' && !this.options.allowedObjects?.includes(args.objectId)) throw new Error('Target object must be explicitly listed in allowedObjects');
    const encoded = JSON.stringify(args);
    if (/"(?:access_token|appsecret_proof|refresh_token|client_secret)"\s*:/.test(encoded)) throw new Error('Credentials must not be included in tool arguments');
    if (tool.platform === 'meta' && tool.write && /instagram_explore_feed|messenger_stories|"(?:7d_view|28d_view)"/.test(encoded)) throw new Error('Payload contains a deprecated Meta placement or attribution window');
    if (tool.platform === 'meta' && tool.resource === 'campaigns' && Array.isArray(args.data?.special_ad_categories) && args.data.special_ad_categories.length) throw new Error('Regulated special-ad categories are blocked from self-service activation');
    if (tool.platform === 'google') {
      const refs = encoded.match(/customers\/\d+\//g) ?? [];
      if (refs.some(ref => ref !== `customers/${args.accountId}/`)) throw new Error('Cross-customer resource reference is not allowed');
    }
    const validateWrite = (value: any): void => {
      if (!value || typeof value !== 'object') return;
      if (value.budget_value_type === 'MULTIPLIER') throw new Error('Multiplier budget schedules require an effective amount check; use an absolute budget schedule');
      for (const [key, amount] of Object.entries(value)) {
        if (key === 'status') {
          if (typeof amount !== 'string' || /^\s*\d+\s*$/.test(amount)) throw new Error('Status must use a named provider value, not a numeric enum');
          if (['ACTIVE', 'ENABLED'].includes(amount.trim().toUpperCase())) throw new Error('API activation is disabled in v1; complete the shadow review and activate manually in the provider UI');
        }
        if (['daily_budget','lifetime_budget','budget_value','bid_amount','bid_cap','cost_cap','amountMicros','totalAmountMicros','cpcBidMicros','cpmBidMicros','cpvBidMicros','targetCpaMicros','amount_micros','total_amount_micros','cpc_bid_micros','cpm_bid_micros','cpv_bid_micros','target_cpa_micros'].includes(key)) {
          const number = Number(amount);
          if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${key} must be a positive safe integer in provider currency units`);
          const cap = this.options.maxBudgetPerWrite?.[tool.platform];
          if (cap && number > cap) throw new Error('Budget/bid amount exceeds the configured per-write ceiling');
        }
        validateWrite(amount);
      }
    };
    if (tool.write) validateWrite(args);
  }
  private forcePausedCreation(tool: AdsTool, args: any): any {
    if (tool.platform === 'meta' && tool.action === 'create' && ['campaigns','adsets','ads'].includes(tool.resource ?? '')) args.data.status = 'PAUSED';
    if (tool.platform === 'google' && tool.action === 'mutate' && ['campaigns','adGroups','adGroupAds'].includes(tool.resource ?? '')) {
      for (const operation of args.operations) if (operation.create) operation.create.status = 'PAUSED';
    }
    if (tool.action === 'google_validate_operations' && ['campaigns','adGroups','adGroupAds'].includes(args.resource)) {
      for (const operation of args.operations) if (operation.create) operation.create.status = 'PAUSED';
    }
    if (tool.action === 'launch' || tool.action === 'continue_launch') {
      args.providerPayload.campaign.status = 'PAUSED'; args.providerPayload.campaign.special_ad_categories = []; args.providerPayload.adset.status = 'PAUSED'; args.providerPayload.ad.status = 'PAUSED';
    }
    return args;
  }
  private binding(tool: AdsTool, args: any, hash: string): OperationBinding {
    return {
      provider: tool.platform,
      accountId: String(args.accountId),
      operationId: args.operationId,
      object: String(args.objectId ?? args.parentId ?? tool.resource ?? tool.action),
      payloadHash: hash
    };
  }
  private isReport(tool: AdsTool): boolean {
    return tool.action === 'insights' || tool.action === 'search' || ['runReport','runPivotReport','runRealtimeReport','runFunnelReport'].includes(tool.action);
  }
  private reportMetadata(tool: AdsTool, args: any, data: any, synchronizedAt: string) {
    const range = args.data?.dateRanges?.[0];
    const metricNames = (args.data?.metrics ?? []).map((metric: any) => typeof metric === 'string' ? metric : metric.name);
    const schemaRestrictions = data?.metadata?.schemaRestrictionResponse?.activeMetricRestrictions ?? [];
    const warnings = [
      data?.metadata?.dataLossFromOtherRow && '(other) row data loss',
      data?.metadata?.subjectToThresholding && 'thresholding',
      data?.samplingMetadatas?.length && 'sampling',
      metricNames.some((name: string) => /(?:active|total|new)Users/.test(name)) && 'unique-user metrics may be approximate',
      tool.platform === 'ga4' && Number(data?.rowCount ?? 0) === 0 && 'empty result; verify filters, dates, and data freshness',
      schemaRestrictions.length && 'schema restrictions apply',
      !args.timezone && !args.data?.timezone && 'Account/property timezone must be confirmed',
      !args.currency && !args.data?.currency && 'Account/property currency must be confirmed'
    ].filter(Boolean);
    return {
      source: tool.platform, synchronizedAt,
      period: { since: args.since ?? range?.startDate ?? null, until: args.until ?? range?.endDate ?? null },
      attributionBasis: tool.platform === 'ga4' ? 'GA4-attributed' : 'provider-attributed',
      timezone: args.timezone ?? args.data?.timezone ?? data?.metadata?.timeZone ?? 'ACCOUNT_TIMEZONE', currency: args.currency ?? args.data?.currency ?? data?.metadata?.currencyCode ?? 'ACCOUNT_CURRENCY',
      dataQualityWarnings: warnings, sampling: data?.samplingMetadatas ?? null, thresholded: Boolean(data?.metadata?.subjectToThresholding), otherRow: Boolean(data?.metadata?.dataLossFromOtherRow),
      schemaRestrictions, quota: data?.propertyQuota ?? null, units: tool.platform === 'google' ? { cost_micros: 'micros', conversionValues: 'documented currency units' } : undefined, conversionLag: 'UNKNOWN', minimumDataStatus: 'UNKNOWN', recommendationStatus: warnings.length ? 'INSUFFICIENT_EVIDENCE' : 'READY'
    };
  }
  private dateInZone(timezone: string, offsetDays: number): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(Date.now() + offsetDays * 86_400_000));
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }
  private nextEight(timezone: string): number {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const value = Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
    let minutes = 8 * 60 - (value.hour * 60 + value.minute);
    if (minutes <= 0) minutes += 24 * 60;
    return now.getTime() + minutes * 60_000 - value.second * 1000 - now.getMilliseconds();
  }
  async call(name: string, rawArgs: unknown): Promise<any> {
    if (this.closed) throw new Error('Ads service is closed');
    const tool = adsToolMap.get(name);
    if (!tool) throw new Error(`Unknown ads tool: ${name}`);
    this.requirePlatform(tool);
    if (tool.action === 'meta_mcp' && !this.metaMcpEnabled()) throw new Error('Meta Ads MCP tools are off; set ADS_META_MCP=on');
    if (tool.action === 'runFunnelReport' && !this.options.enableGA4Alpha) throw new Error('GA4 v1alpha funnel reports are disabled; enable only for an explicit unstable-endpoint test');
    const parsed = tool.schema.parse(rawArgs);
    if (tool.action === 'launch') {
      const readiness = this.records().get('meta_readiness', parsed.accountId);
      if (!readiness?.ready) throw new Error('Meta account readiness must be persisted and READY before launch');
      if (!this.isVerifiedAccount('meta', parsed.accountId)) throw new Error('Meta account is not deployment-verified for paused-object tests');
      const plan: any = prepareMetaLaunch(parsed.launchId, parsed.accountId, parsed.spec);
      if (!plan.valid) throw new Error(`Meta launch validation failed: ${plan.errors.join('; ')}`);
      parsed.providerPayload = plan.payload;
      parsed.operationId = parsed.launchId;
    }
    if (tool.action === 'continue_launch') {
      const original = this.store().get(parsed.launchId);
      if (!original || !['ads_launch_meta', 'ads_continue_meta_launch'].includes(original.tool) || original.status !== 'PARTIAL') throw new Error('Only a persisted PARTIAL Meta launch can be continued; UNCERTAIN launches require manual reconciliation');
      if (original.binding.accountId !== parsed.accountId) throw new Error('Partial launch belongs to another account');
      parsed.providerPayload = original.args.providerPayload;
      parsed.existingIds = original.result?.ids ?? {};
    }
    const args = this.forcePausedCreation(tool, parsed);
    if (/"(?:access_token|appsecret_proof|refresh_token|client_secret)"\s*:/.test(JSON.stringify(args))) throw new Error('Credentials must not be included in tool arguments');
    if (tool.action === 'provider_versions') return { status: 'COMPLETED', data: this.records().providerVersions() };
    if (tool.action === 'provider_capabilities') return { status: 'COMPLETED', data: this.records().providerCapabilities(tool.platform) };
    if (tool.action === 'meta_readiness') {
      const data = assessMetaReadiness(args.accountId, args.snapshot);
      this.records().save('meta_readiness', args.accountId, data);
      return { status: 'COMPLETED', data };
    }
    if (tool.action === 'meta_validate') {
      const data = validateMetaCampaign(args.draftId, args.spec);
      this.records().save('meta_campaign_draft', args.draftId, data);
      return { status: 'COMPLETED', data };
    }
    if (tool.action === 'meta_prepare_launch') {
      const data = prepareMetaLaunch(args.launchId, args.accountId, args.spec); this.records().save('meta_launch', args.launchId, data);
      return { status: 'COMPLETED', data };
    }
    if (tool.action === 'google_readiness') {
      const data = assessGoogleReadiness(args.accountId, args.snapshot); this.records().save('google_readiness', args.accountId, data);
      return { status: 'COMPLETED', data };
    }
    if (tool.action === 'google_validate_search') {
      const data = validateGoogleSearchCampaign(args.draftId, args.spec); this.records().save('google_campaign_draft', args.draftId, data);
      return { status: 'COMPLETED', data };
    }
    if (tool.action === 'google_validate_campaign_type') {
      const data = validateGoogleCampaignType(args.draftId, args.campaignType, args.evidence); this.records().save('google_campaign_draft', args.draftId, data);
      return { status: 'COMPLETED', data };
    }
    if (tool.action === 'google_prepare_search') {
      const verified = Boolean(this.records().get('rollout_gate', 'meta_paused_lifecycle')?.verifiedAt);
      const data = prepareGoogleSearchLaunch(args.launchId, args.accountId, args.spec, verified); this.records().save('google_launch', args.launchId, data);
      return { status: 'COMPLETED', data };
    }
    if (tool.action === 'google_report_templates') return { status: 'COMPLETED', data: googleReportTemplates };
    if (tool.action === 'google_validate_operations') {
      this.scope(tool, args);
      const fetchedAt = new Date().toISOString();
      const data = await this.transport.validateGoogleOperations(args.accountId, args.resource, args.operations);
      this.records().save('google_validation', payloadHash('google-validation', { accountId: args.accountId, resource: args.resource, operations: args.operations }), { accountId: args.accountId, resource: args.resource, operations: args.operations, data, fetchedAt });
      return { status: 'COMPLETED', validated: true, fetchedAt, data };
    }
    if (tool.action === 'google_verify_operation') {
      const record = this.store().get(args.operationId);
      if (!record || record.binding.provider !== 'google') throw new Error('Google operation not found');
      if (record.status !== 'DISPATCHED') return record;
      const name = record.result?.name;
      if (typeof name !== 'string') throw new Error('Dispatched operation has no provider operation name');
      const result = await this.transport.getGoogleOperation(record.binding.accountId, name);
      return result.done ? this.store().resolveDispatched(record.id, result, result.error ? 'FAILED' : 'VERIFIED') : record;
    }
    if (tool.action === 'ga4_readiness') {
      const data = assessGA4Readiness(args.accountId, args.snapshot); this.records().save('ga4_readiness', args.accountId, data);
      return { status: 'COMPLETED', data };
    }
    if (tool.action === 'ga4_audit') {
      const data = auditGA4Tracking(args.accountId, args.evidence); this.records().save('ga4_audit', args.accountId, data);
      return { status: 'COMPLETED', data };
    }
    if (tool.action === 'ga4_validate_report') {
      const data = validateGA4Report(args.reportId, args.spec); this.records().save('ga4_report', args.reportId, data);
      return { status: 'COMPLETED', data };
    }
    if (tool.action === 'ga4_run_validated_report') {
      this.scope(tool, args);
      if (args.spec.type === 'funnel' && !this.options.enableGA4Alpha) throw new Error('GA4 v1alpha funnel reports are disabled; enable only for an explicit unstable-endpoint test');
      const validation: any = validateGA4Report(args.reportId, args.spec);
      if (!validation.valid) return { status: 'COMPLETED', data: validation };
      const dimensions = args.spec.dimensions.map((name: string) => ({ name }));
      const metrics = args.spec.metrics.map((name: string) => ({ name }));
      const body = args.spec.type === 'funnel'
        ? { ...args.spec.request, dateRanges: args.spec.dateRanges, limit: args.spec.limit }
        : { ...args.spec.request, dimensions, metrics, ...(args.spec.type === 'realtime' ? {} : { dateRanges: args.spec.dateRanges }), dimensionFilter: args.spec.filters, limit: args.spec.limit };
      if (args.spec.type === 'realtime') delete body.dateRanges;
      const metadata = await this.transport.dispatch(adsToolMap.get('ga4_metadata')!, { accountId: args.accountId });
      const compatibility = await this.transport.dispatch(adsToolMap.get('ga4_checkCompatibility')!, { accountId: args.accountId, data: { dimensions, metrics, dimensionFilter: args.spec.filters } });
      const incompatible = [...(compatibility.dimensionCompatibilities ?? []), ...(compatibility.metricCompatibilities ?? [])].filter((entry: any) => entry.compatibility && entry.compatibility !== 'COMPATIBLE');
      if (incompatible.length) throw new Error(`GA4 report is incompatible: ${incompatible.map((entry: any) => entry.dimensionMetadata?.apiName ?? entry.metricMetadata?.apiName).join(', ')}`);
      const reportTool = adsToolMap.get(({ standard: 'ga4_runReport', pivot: 'ga4_runPivotReport', realtime: 'ga4_runRealtimeReport', funnel: 'ga4_runFunnelReport' } as Record<string, string>)[args.spec.type])!;
      const fetchedAt = new Date().toISOString();
      const report = await this.transport.dispatch(reportTool, { accountId: args.accountId, data: body });
      report._metadata = this.reportMetadata(reportTool, { data: body, timezone: args.timezone, currency: args.currency }, report, fetchedAt);
      const data = { validation, metadata, compatibility, report };
      this.records().save('report', args.reportId, data);
      return { status: 'COMPLETED', data };
    }
    if (tool.action === 'ga4_admin_proposal') {
      const target = adsToolMap.get(args.capability);
      if (!target?.write || target.platform !== 'ga4') throw new Error('Admin proposal capability must be an exposed GA4 write');
      const data = { proposalId: args.proposalId, provider: 'ga4', capability: args.capability, input: args.input, rationale: args.rationale, status: 'DRAFT', approvalRequired: true, createdAt: new Date().toISOString() };
      this.records().save('ga4_admin_proposal', args.proposalId, data);
      return { status: 'COMPLETED', data };
    }
    if (tool.action === 'ga4_report_templates') return { status: 'COMPLETED', data: ga4ReportTemplates };
    if (tool.action === 'create_recommendation') {
      if (args.evidencePeriod.since > args.evidencePeriod.until) throw new Error('Evidence period since must be on or before until');
      const data = { ...args, source: args.provider, synchronizedAt: new Date().toISOString(), period: args.evidencePeriod, attributionBasis: args.provider === 'ga4' ? 'GA4-attributed' : 'provider-attributed', recommendationStatus: args.minimumDataStatus === 'MET' && !args.dataQualityWarnings.length ? 'READY' : 'INSUFFICIENT_EVIDENCE', status: 'DRAFT', approvalRequired: true, automatedExecution: false, createdAt: new Date().toISOString() };
      this.records().save('recommendation', args.recommendationId, data); return { status: 'COMPLETED', data };
    }
    if (tool.action === 'schedule_monitoring') {
      const { DepartmentJobs } = await import('../../departments/jobs.js');
      const jobs = new DepartmentJobs(join(this.options.storageDir ?? dataDir(), 'jobs'));
      const dates = { since: this.dateInZone(args.timezone, -90), until: this.dateInZone(args.timezone, -1) };
      const task = (baseline: boolean) => args.provider === 'meta'
        ? { department: 'ads' as const, capability: 'meta_ads_run_monitoring', input: { accountId: args.accountId, timezone: args.timezone, currency: args.currency, days: baseline ? 90 : 7 } }
        : args.provider === 'google'
          ? { department: 'ads' as const, capability: 'google_ads_search', input: { accountId: args.accountId, timezone: args.timezone, currency: args.currency, query: `${googleReportTemplates.campaign_performance.query} WHERE segments.date ${baseline ? `BETWEEN '${dates.since}' AND '${dates.until}'` : 'DURING LAST_7_DAYS'}` } }
          : { department: 'analytics' as const, capability: 'ga4_run_validated_report', input: { reportId: `${args.scheduleId}-${baseline ? 'baseline' : 'daily'}`, accountId: args.accountId, timezone: args.timezone, currency: args.currency, spec: { type: 'standard', dimensions: ['sessionCampaignId','sessionCampaignName'], metrics: ['sessions','keyEvents','totalRevenue'], dateRanges: [{ startDate: baseline ? '90daysAgo' : '7daysAgo', endDate: 'yesterday' }] } } };
      const existing = new Set(jobs.list().map((job: any) => job.id));
      if (!existing.has(`${args.scheduleId}-baseline`)) jobs.add({ id: `${args.scheduleId}-baseline`, ...task(true), nextRunAt: Date.now() });
      if (!existing.has(`${args.scheduleId}-daily`)) jobs.add({ id: `${args.scheduleId}-daily`, ...task(false), nextRunAt: this.nextEight(args.timezone), intervalMs: 86_400_000 });
      jobs.close();
      const data = { ...args, jobs: [`${args.scheduleId}-baseline`,`${args.scheduleId}-daily`], baselineDays: 90, cadence: 'DAILY', localTime: '08:00', readOnly: true, status: 'ACTIVE', createdAt: new Date().toISOString() };
      this.records().save('schedule', args.scheduleId, data); return { status: 'COMPLETED', data };
    }
    if (tool.action === 'list_records') return { status: 'COMPLETED', data: this.records().list(args.kind) };
    if (tool.action === 'list_operations') return { status: 'COMPLETED', data: this.store().list(args.statuses) };
    if (tool.action === 'reconcile') {
      const data = reconcileMeasurement(args); this.records().save('reconciliation', `${args.since}-${args.until}-${args.currency}`, data);
      return { status: 'COMPLETED', data };
    }
    if (tool.action === 'meta_daily_monitor') {
      this.scope(tool, args);
      const reportTool = adsToolMap.get('meta_ads_insights')!;
      const input = { accountId: args.accountId, level: 'campaign', since: this.dateInZone(args.timezone, -args.days), until: this.dateInZone(args.timezone, -1), fields: ['campaign_id','campaign_name','spend','impressions','clicks','actions','action_values'], breakdowns: [], timeIncrement: 1, timezone: args.timezone, currency: args.currency };
      const fetchedAt = new Date().toISOString();
      const data = await this.transport.dispatch(reportTool, input);
      data._metadata = this.reportMetadata(reportTool, input, data, fetchedAt);
      this.records().save('report', payloadHash(tool.name, args), { tool: tool.name, accountId: args.accountId, data });
      return { status: 'COMPLETED', source: 'live', fetchedAt, data };
    }
    if (tool.action === 'compare' || tool.action === 'analyze') {
      if (args.since && args.since > args.until) throw new Error('since must be on or before until');
      return { status: 'COMPLETED', data: tool.action === 'compare' ? comparePerformance(args) : analyzeCreative(args) };
    }
    this.scope(tool, args);
    if (!tool.write) {
      const fetchedAt = new Date().toISOString();
      const data = await this.transport.dispatch(tool, args);
      if (this.isReport(tool) && data && typeof data === 'object') {
        data._metadata = this.reportMetadata(tool, args, data, fetchedAt);
        this.records().save('report', payloadHash(tool.name, args), { tool: tool.name, accountId: args.accountId, data });
      }
      return { status: 'COMPLETED', source: 'live', fetchedAt, data };
    }
    if (tool.platform === 'google' && tool.action === 'mutate' && !args.validateOnly && args.operations.some((operation: any) => operation.create)) {
      if (!this.isVerifiedAccount('google', args.accountId)) throw new Error('Google account is not deployment-verified for paused-object tests');
      if (!this.records().get('rollout_gate', 'meta_paused_lifecycle')?.verifiedAt || !this.records().get('google_readiness', args.accountId)?.ready) throw new Error('Meta lifecycle and Google account readiness must be verified before Google creation');
      const receipt = this.records().get('google_validation', payloadHash('google-validation', { accountId: args.accountId, resource: tool.resource, operations: args.operations }));
      if (!receipt) throw new Error('Exact Google mutation payload must pass provider validateOnly before approval');
    }
    if (this.mode() === 'off') return { status: 'OFF', tool: name, args, dispatched: false };
    if (this.mode() === 'dry-run') return { status: 'DRY_RUN', tool: name, args, dispatched: false };
    if (!args.operationId) throw new Error('Live writes require a stable operationId; reuse it when resuming the same operation');
    const operationId = args.operationId;
    const hash = payloadHash(name, args);
    let record = this.store().create({ id: operationId, tool: name, args, hash, binding: this.binding(tool, args, hash), status: 'DRAFT', transitions: [{ status: 'DRAFT', at: new Date().toISOString() }] });
    record = this.store().submit(record.id);
    return this.execute(record);
  }
  decide(id: string, approved: boolean): Operation {
    const record = this.store().get(id);
    if (!record) throw new Error('Operation not found');
    this.requirePlatform(adsToolMap.get(record.tool)!);
    return this.store().decide(id, approved);
  }
  owns(id: string): boolean {
    const record = this.store().get(id);
    const tool = record && adsToolMap.get(record.tool);
    return Boolean(tool && (!this.options.platforms || this.options.platforms.includes(tool.platform)));
  }
  async resume(id: string): Promise<any> {
    const record = this.store().get(id);
    if (!record) throw new Error('Operation not found');
    this.requirePlatform(adsToolMap.get(record.tool)!);
    return this.execute(record);
  }
  private async execute(record: Operation): Promise<any> {
    if (record.status === 'DISPATCHED' && !record.result) record = this.store().markExpiredDispatchUncertain(record.id);
    if (record.status !== 'AUTHORIZED') return record;
    if (this.mode() !== 'live-with-approval') return { ...record, status: this.mode() === 'off' ? 'OFF' : 'DRY_RUN', dispatched: false };
    const tool = adsToolMap.get(record.tool)!;
    const args = tool.schema.parse(record.args);
    if (record.hash !== payloadHash(record.tool, args)) throw new Error('Stored operation payload changed');
    const binding = this.binding(tool, args, record.hash);
    if (!record.approval?.approved || JSON.stringify(record.approval, ['provider','accountId','operationId','object','payloadHash']) !== JSON.stringify(binding)) throw new Error('Operation approval does not match the provider payload');
    try {
      this.scope(tool, args);
      // Account-owned objects are checked before mutating them. Other objects require an explicit allowlist.
      if (tool.platform === 'meta' && args.objectId && tool.parent === 'account') await this.transport.verifyMetaObject(args.accountId, args.objectId);
      if (tool.platform === 'meta' && args.objectId && tool.parent && tool.parent !== 'account' && !this.options.allowedObjects?.includes(args.objectId)) throw new Error('Object is not in allowedObjects');
      await this.transport.prepareWrite(tool, args);
    } catch (error) {
      return this.store().failAuthorized(record.id, error instanceof Error ? error.message : String(error));
    }
    const claimed = this.store().claim(record.id, this.workerId);
    if (!claimed) return this.store().get(record.id);
    record = claimed;
    try {
      record.result = ['launch','continue_launch'].includes(tool.action) ? await this.transport.launchMetaHierarchy(args) : await this.transport.dispatch(tool, args);
      if (record.result?.partialFailureError) transition(record, 'PARTIAL');
      else if (['launch','continue_launch'].includes(tool.action)) {
        transition(record, 'VERIFIED');
        this.records().save('rollout_gate', 'meta_paused_lifecycle', { verifiedAt: new Date().toISOString(), operationId: record.id, accountId: record.binding.accountId, result: record.result });
      }
    } catch (error) {
      if (error instanceof HierarchyDispatchError) record.result = error.partial;
      transition(record, error instanceof HierarchyDispatchError ? error.outcome : error instanceof ProviderError && error.status >= 400 && error.status < 500 && error.status !== 408 ? 'FAILED' : 'UNCERTAIN');
      record.error = error instanceof Error ? error.message : String(error);
    }
    return this.store().finish(record, this.workerId) ? record : this.store().get(record.id);
  }
  close() { this.closed = true; this.journal?.close(); this.state?.close(); void this.transport.close().catch(() => {}); }
}

/** Older servers wrote the ads journal to the data root while the CLI used <root>/ads. Move it once; never merge two live journals. */
const warnedLegacy = new Set<string>();
function migrateLegacyAdsFiles(root: string, dir: string) {
  for (const name of ['operations.sqlite', 'control.sqlite']) {
    const legacy = join(root, name);
    if (!existsSync(legacy)) continue;
    if (!existsSync(join(dir, name))) {
      mkdirSync(dir, { recursive: true });
      for (const suffix of ['', '-wal', '-shm']) if (existsSync(legacy + suffix)) renameSync(legacy + suffix, join(dir, name) + suffix);
    } else if (!warnedLegacy.has(legacy)) {
      warnedLegacy.add(legacy);
      console.warn(`[ads] legacy ${legacy} ignored; ${join(dir, name)} is the journal. Inspect and delete the legacy file.`);
    }
  }
}
