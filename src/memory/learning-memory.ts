import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export const learningCategories = ['icp', 'positioning', 'channel', 'creative', 'offer', 'conversion', 'ops'] as const;
export const confidenceLevels = ['hypothesis', 'emerging', 'validated'] as const;
export type LearningCategory = typeof learningCategories[number];
export type Confidence = typeof confidenceLevels[number];

export interface Learning {
  id: string;
  capturedAt: number;
  updatedAt: number;
  category: LearningCategory;
  pattern: string;
  evidence: { refs: string[]; sampleSize?: number };
  confidence: Confidence;
  status: 'open' | 'confirmed' | 'ruled_out';
  testPlan?: string;
  fromSkill?: string;
  supersedes?: string;
  supersededBy?: string;
}

export type NewLearning = Pick<Learning, 'category' | 'pattern' | 'evidence' | 'confidence' | 'testPlan' | 'fromSkill' | 'supersedes'>;

/** Append-only learnings: records are superseded or ruled out, never deleted, so history stays traceable. */
export class LearningMemory {
  private items: Learning[] = [];

  constructor(private file?: string) {}

  private access<T>(write: boolean, action: () => T): T {
    if (!this.file) return action();
    const db = new DatabaseSync(this.file);
    try {
      db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS learnings (id TEXT PRIMARY KEY, record TEXT NOT NULL)');
      if (write) db.exec('BEGIN IMMEDIATE');
      try {
        this.items = (db.prepare('SELECT record FROM learnings ORDER BY rowid').all() as Array<{ record: string }>).map(row => JSON.parse(row.record));
        const result = action();
        if (write) {
          // shortcut: writes transact the small learning history; use targeted row updates if that history becomes large.
          const save = db.prepare('INSERT INTO learnings(id, record) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET record=excluded.record');
          for (const item of this.items) save.run(item.id, JSON.stringify(item));
          db.exec('COMMIT');
        }
        return result;
      } catch (error) { if (write) db.exec('ROLLBACK'); throw error; }
    } finally { db.close(); }
  }

  /** Confidence must match the evidence: this is the rule that keeps invented results out of memory. */
  public add(input: NewLearning, now = Date.now()): Learning {
    return this.access(true, () => {
      const { refs, sampleSize } = input.evidence;
      if (input.confidence === 'validated' && (sampleSize ?? 0) < 30 && refs.length < 2)
        throw new Error('validated needs sampleSize >= 30 or 2+ independent evidence refs; record it as emerging');
      if (input.confidence === 'emerging' && !refs.length) throw new Error('emerging needs at least one evidence ref');
      if (input.confidence === 'hypothesis' && !input.testPlan) throw new Error('hypothesis needs a testPlan (the cheapest test that would settle it)');
      const old = input.supersedes ? this.items.find(item => item.id === input.supersedes) : undefined;
      if (input.supersedes && !old) throw new Error(`Unknown learning to supersede: ${input.supersedes}`);
      if (old?.supersededBy) throw new Error(`Learning already superseded by ${old.supersededBy}`);
      const learning: Learning = { ...input, id: `L-${randomUUID()}`, capturedAt: now, updatedAt: now, status: 'open' };
      if (old) { old.supersededBy = learning.id; old.updatedAt = now; }
      this.items.push(learning);
      return learning;
    });
  }

  public setStatus(id: string, status: 'confirmed' | 'ruled_out', evidenceRef: string, now = Date.now()): Learning {
    return this.access(true, () => {
      const learning = this.items.find(item => item.id === id);
      if (!learning) throw new Error(`Unknown learning: ${id}`);
      learning.status = status;
      learning.evidence.refs.push(evidenceRef);
      learning.updatedAt = now;
      return learning;
    });
  }

  public get(id: string): Learning | undefined {
    return this.access(false, () => this.items.find(item => item.id === id));
  }

  /** Current learnings, strongest first then newest; superseded records are hidden. */
  public list(filter: { category?: LearningCategory; minConfidence?: Confidence } = {}): Learning[] {
    const min = confidenceLevels.indexOf(filter.minConfidence ?? 'hypothesis');
    return this.all()
      .filter(item => !item.supersededBy && (!filter.category || item.category === filter.category) && confidenceLevels.indexOf(item.confidence) >= min)
      .sort((a, b) => confidenceLevels.indexOf(b.confidence) - confidenceLevels.indexOf(a.confidence) || b.capturedAt - a.capturedAt);
  }

  public all(): Learning[] {
    return this.access(false, () => this.items);
  }

  public toJSON(): Learning[] {
    return this.all();
  }

  public fromJSON(data: Learning[]): void {
    if (!Array.isArray(data)) return;
    if (!this.file) { this.items = data; return; }
    // Old JSON snapshots are imports; they must never replace newer database records.
    this.access(true, () => {
      const known = new Set(this.items.map(item => item.id));
      for (const item of data) if (!known.has(item.id)) { this.items.push(item); known.add(item.id); }
    });
  }
}
