/**
 * Laya System 1 Decision Client
 * Connects to the local/remote Laya non-autoregressive decision engine (https://github.com/NandhaKishorM/laya)
 * for research signal filtering.
 *
 * Implements graceful fallback to deterministic heuristics if the Laya HTTP daemon is offline.
 */

export interface LayaResearchFilterResult {
  isRelevant: boolean;
  intent: 'commercial' | 'informational' | 'transactional' | 'navigational';
  confidence: number;
  source: 'laya' | 'heuristic';
}

export class LayaClient {
  private static instance: LayaClient;
  private serverUrl: string;
  private lastHealthCheck: number = 0;
  private isServerHealthy: boolean = false;
  private healthCheckIntervalMs: number = 10000; // 10s health check cache

  private constructor(serverUrl?: string) {
    this.serverUrl = serverUrl || process.env.LAYA_SERVER_URL || 'http://127.0.0.1:8000';
  }

  public static getInstance(serverUrl?: string): LayaClient {
    if (!LayaClient.instance) {
      LayaClient.instance = new LayaClient(serverUrl);
    }
    return LayaClient.instance;
  }

  /**
   * Checks if Laya server daemon is responsive.
   */
  public async isAvailable(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastHealthCheck < this.healthCheckIntervalMs) {
      return this.isServerHealthy;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000); // 1s timeout
      const res = await fetch(`${this.serverUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: 'healthcheck',
          questions: {
            ping: { type: 'noul', instructions: 'Is this a healthcheck?' }
          }
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      this.isServerHealthy = res.ok;
    } catch {
      this.isServerHealthy = false;
    }

    this.lastHealthCheck = now;
    return this.isServerHealthy;
  }

  /**
   * Filters raw research/scraped data for relevance, noise reduction, and intent classification.
   */
  public async filterResearchRelevance(text: string, domainContext: string = 'B2B AI Automation & Healthcare Marketing'): Promise<LayaResearchFilterResult> {
    const isOnline = await this.isAvailable();

    if (isOnline) {
      try {
        const res = await fetch(`${this.serverUrl}/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: `Context: ${domainContext}.\nScraped Data: ${text.slice(0, 1000)}`,
            questions: {
              is_relevant: {
                type: 'noul',
                instructions: 'Is this data genuinely relevant, accurate, and actionable for market or competitor intelligence?'
              },
              intent: {
                type: 'choice',
                instructions: 'What user search or buyer intent does this text address?',
                criteria: {
                  commercial: 'comparing solutions, pricing, providers, vendors, hiring an agency',
                  transactional: 'booking demo, purchase, direct sign-up, implementation inquiry',
                  informational: 'how-to guides, concepts, tutorials, definitions',
                  navigational: 'login pages, company homepages, portal links'
                }
              }
            }
          })
        });

        if (res.ok) {
          const data: any = await res.json();
          const relevanceScore = data?.answers?.is_relevant?.noul ?? 0.5;
          const intent = data?.answers?.intent?.choice || 'commercial';
          const conf = data?.answers?.intent?.probabilities?.[intent] || 0.85;

          return {
            isRelevant: relevanceScore >= 0.70,
            intent: intent as any,
            confidence: Math.round(conf * 100) / 100,
            source: 'laya'
          };
        }
      } catch {
        // Fall back to heuristic
      }
    }

    // Deterministic fallback
    const lower = text.toLowerCase();
    const isSpam = lower.includes('viagra') || lower.includes('casino') || lower.includes('crypto free') || text.length < 20;
    const isCommercial = lower.includes('pricing') || lower.includes('cost') || lower.includes('vs') || lower.includes('best') || lower.includes('agency') || lower.includes('alternative');
    const isTransactional = lower.includes('book') || lower.includes('demo') || lower.includes('hire') || lower.includes('buy');

    return {
      isRelevant: !isSpam,
      intent: isTransactional ? 'transactional' : isCommercial ? 'commercial' : 'informational',
      confidence: 0.80,
      source: 'heuristic'
    };
  }
}
