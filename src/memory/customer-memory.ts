export interface Persona {
  id: string;
  title: string;
  seniority: string;
  department: string;
  primaryGoals: string[];
  painPoints: string[];
  objections: string[];
  buyingTriggers: string[];
  decisionCriteria: string[];
  searchIntentKeywords: string[];
  preferredContentFormats: string[];
}

export class CustomerMemory {
  private personas: Map<string, Persona> = new Map();

  constructor() {
    this.seedDefaultPersonas();
  }

  private seedDefaultPersonas(): void {
    const cmoPersona: Persona = {
      id: 'aud_b2b_saas_cmo',
      title: 'Chief Marketing Officer / VP Marketing',
      seniority: 'Executive',
      department: 'Marketing',
      primaryGoals: [
        'Hit quarterly qualified pipeline targets with predictable ROI',
        'Lower CAC and increase Marketing Contribution to ARR',
        'Eliminate wasteful ad spend and generic AI marketing slop'
      ],
      painPoints: [
        'Rising paid ad CAC across LinkedIn and Google Search',
        'Difficulty establishing clear multi-touch revenue attribution',
        'Generic AI copywriting tools creating brand dilution and low engagement',
        'Siloed agency teams that take weeks to iterate on campaign data'
      ],
      objections: [
        'Will autonomous AI damage our brand reputation or post low-quality content?',
        'How does the system ensure attribution is not double-counted with our CRM?',
        'Can human marketing leads review and approve high-stakes campaigns before launch?'
      ],
      buyingTriggers: [
        'Missed quarterly pipeline quota by >15%',
        'Mandate from Board/CEO to reduce marketing CAC and demonstrate ROI',
        'Ad creative fatigue causing CPL to double in 30 days'
      ],
      decisionCriteria: [
        'Deterministic GA4 + CRM attribution proof',
        'Multi-level Human-in-the-Loop safety guardrails',
        'Autonomous closed-loop learning from actual pipeline conversion'
      ],
      searchIntentKeywords: [
        'reduce b2b saas cac',
        'autonomous marketing operating system',
        'ai marketing pipeline attribution',
        'anti-slop content generation engine',
        'multi-channel ad fatigue automated optimization'
      ],
      preferredContentFormats: [
        'Data-backed case studies with revenue breakdowns',
        'Architectural teardowns and benchmark comparisons',
        'Interactive ROI calculators & pipeline modeling frameworks'
      ]
    };

    this.personas.set(cmoPersona.id, cmoPersona);
  }

  public getPersona(id: string): Persona | undefined {
    return this.personas.get(id);
  }

  public getAllPersonas(): Persona[] {
    return Array.from(this.personas.values());
  }

  public toJSON(): { personas: Persona[] } {
    return { personas: Array.from(this.personas.values()) };
  }

  public fromJSON(data: { personas: Persona[] }): void {
    if (data.personas) {
      this.personas.clear();
      data.personas.forEach(p => this.personas.set(p.id, p));
    }
  }
}
