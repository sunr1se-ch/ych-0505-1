export type JudgeResult = 'perfect' | 'good' | 'miss';

export interface HitResult {
  referenceTime: number;
  hitTime: number;
  delta: number;
  judge: JudgeResult;
  beatIndex: number;
}

export interface ScoringStats {
  combo: number;
  maxCombo: number;
  perfectCount: number;
  goodCount: number;
  missCount: number;
  averageDelta: number;
  totalHits: number;
}

const PERFECT_THRESHOLD = 40;
const GOOD_THRESHOLD = 90;
const WINDOW_MS = 150;
const STORAGE_KEY = 'luogu_beat_best_score';

export class Scoring {
  private hitResults: HitResult[] = [];
  private combo: number = 0;
  private maxCombo: number = 0;
  private perfectCount: number = 0;
  private goodCount: number = 0;
  private missCount: number = 0;
  private totalDeltaAbs: number = 0;
  private matchedBeats: Set<number> = new Set();

  static judge(deltaMs: number): JudgeResult {
    const absDelta = Math.abs(deltaMs);
    if (absDelta <= PERFECT_THRESHOLD) return 'perfect';
    if (absDelta <= GOOD_THRESHOLD) return 'good';
    return 'miss';
  }

  registerHit(hitTime: number, referenceTimes: number[]): HitResult | null {
    if (referenceTimes.length === 0) return null;

    let closestIndex = -1;
    let closestDiff = Infinity;

    for (let i = 0; i < referenceTimes.length; i++) {
      if (this.matchedBeats.has(i)) continue;
      
      const refTime = referenceTimes[i];
      const diff = Math.abs(hitTime - refTime);
      
      if (diff < closestDiff && diff <= WINDOW_MS) {
        closestDiff = diff;
        closestIndex = i;
      }
    }

    if (closestIndex === -1) {
      return null;
    }

    const referenceTime = referenceTimes[closestIndex];
    const delta = hitTime - referenceTime;
    const judge = Scoring.judge(delta);

    this.matchedBeats.add(closestIndex);
    this.totalDeltaAbs += Math.abs(delta);

    if (judge === 'miss') {
      this.missCount++;
      this.combo = 0;
    } else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      
      if (judge === 'perfect') {
        this.perfectCount++;
      } else {
        this.goodCount++;
      }
    }

    const result: HitResult = {
      referenceTime,
      hitTime,
      delta,
      judge,
      beatIndex: closestIndex
    };

    this.hitResults.push(result);
    return result;
  }

  registerMiss(beatIndex: number, referenceTime: number): HitResult {
    if (this.matchedBeats.has(beatIndex)) {
      const existing = this.hitResults.find(h => h.beatIndex === beatIndex);
      if (existing) return existing;
    }

    this.matchedBeats.add(beatIndex);
    this.missCount++;
    this.combo = 0;

    const result: HitResult = {
      referenceTime,
      hitTime: -1,
      delta: 999,
      judge: 'miss',
      beatIndex
    };

    this.hitResults.push(result);
    return result;
  }

  getStats(): ScoringStats {
    const totalHits = this.perfectCount + this.goodCount + this.missCount;
    const judgedHits = this.perfectCount + this.goodCount;
    
    return {
      combo: this.combo,
      maxCombo: this.maxCombo,
      perfectCount: this.perfectCount,
      goodCount: this.goodCount,
      missCount: this.missCount,
      averageDelta: judgedHits > 0 ? this.totalDeltaAbs / judgedHits : 0,
      totalHits
    };
  }

  getHitResults(): HitResult[] {
    return [...this.hitResults];
  }

  reset(): void {
    this.hitResults = [];
    this.combo = 0;
    this.maxCombo = 0;
    this.perfectCount = 0;
    this.goodCount = 0;
    this.missCount = 0;
    this.totalDeltaAbs = 0;
    this.matchedBeats.clear();
  }

  saveBestScore(stats: ScoringStats): boolean {
    const existing = this.loadBestScore();
    const currentScore = this.calculateScore(stats);
    const existingScore = existing ? this.calculateScore(existing) : -1;

    if (currentScore > existingScore) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
      return true;
    }
    return false;
  }

  loadBestScore(): ScoringStats | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as ScoringStats;
      }
    } catch (e) {}
    return null;
  }

  private calculateScore(stats: ScoringStats): number {
    const total = stats.perfectCount + stats.goodCount + stats.missCount;
    if (total === 0) return 0;
    
    const accuracy = (stats.perfectCount * 100 + stats.goodCount * 50) / total;
    const comboBonus = stats.maxCombo * 2;
    const deltaPenalty = stats.averageDelta * 0.5;
    
    return Math.max(0, accuracy + comboBonus - deltaPenalty);
  }

  static getJudgeColor(judge: JudgeResult): string {
    switch (judge) {
      case 'perfect': return '#d4af37';
      case 'good': return '#2ecc71';
      case 'miss': return '#c41e3a';
    }
  }
}
