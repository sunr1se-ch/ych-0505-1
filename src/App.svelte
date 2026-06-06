<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import BeatTimeline from '@/components/BeatTimeline.svelte';
  import { AudioEngine } from '@/engine/AudioEngine';
  import { Scoring, type HitResult, type ScoringStats, type JudgeResult, type SectionRange } from '@/engine/Scoring';
  import referenceBeatsData from '@/data/luogu-a.json';

  const audioEngine = new AudioEngine();
  const scoring = new Scoring();

  let referenceBeats: number[] = referenceBeatsData;
  let currentTime = $state(0);
  let isPlaying = $state(false);
  let isLoaded = $state(false);
  let isLoading = $state(false);
  let hitResults = $state<HitResult[]>([]);
  let stats = $state<ScoringStats>(scoring.getStats());
  let bestScore = $state<ScoringStats | null>(null);
  let upcomingBeats = $state<number[]>([]);
  let volume = $state(0.8);
  let showResultPopup = $state(false);
  let isNewBest = $state(false);
  let lastHitAnimation = $state<{ judge: JudgeResult; delta: number } | null>(null);

  type PracticeMode = 'full' | 'section';
  let practiceMode = $state<PracticeMode>('full');
  let sectionStartBeat = $state<number>(1);
  let sectionEndBeat = $state<number>(referenceBeatsData.length);
  let sectionBoundaryCrossed = $state<'enter' | 'leave' | null>(null);
  let lastInSection = $state<boolean>(true);

  function getCurrentSection(): SectionRange | null {
    if (practiceMode !== 'section') return null;
    return {
      startBeatIndex: sectionStartBeat - 1,
      endBeatIndex: sectionEndBeat - 1
    };
  }

  function isTimeInSection(time: number): boolean {
    const section = getCurrentSection();
    if (!section) return true;
    const startTime = referenceBeats[section.startBeatIndex];
    const endTime = referenceBeats[section.endBeatIndex];
    return time >= startTime && time <= endTime;
  }

  let boundaryCrossedTimeout: number | null = null;

  function checkSectionBoundary(time: number): void {
    const section = getCurrentSection();
    if (!section) {
      lastInSection = true;
      return;
    }

    const inSection = isTimeInSection(time);
    
    if (inSection !== lastInSection) {
      if (boundaryCrossedTimeout) {
        clearTimeout(boundaryCrossedTimeout);
      }
      
      sectionBoundaryCrossed = inSection ? 'enter' : 'leave';
      
      boundaryCrossedTimeout = window.setTimeout(() => {
        sectionBoundaryCrossed = null;
      }, 800);
    }
    
    lastInSection = inSection;
  }

  function validateSection(): boolean {
    const maxBeat = referenceBeats.length;
    if (sectionStartBeat < 1 || sectionStartBeat > maxBeat) return false;
    if (sectionEndBeat < 1 || sectionEndBeat > maxBeat) return false;
    if (sectionStartBeat > sectionEndBeat) return false;
    return true;
  }

  const AUDIO_URL = '/loops/luogu-a.ogg';
  const MISS_THRESHOLD_MS = 120;

  $effect(() => {
    audioEngine.setVolume(volume);
  });

  $effect(() => {
    if (isPlaying && currentTime >= 0) {
      const windowStart = currentTime - 200;
      const windowEnd = currentTime + 1000;
      const section = getCurrentSection();
      upcomingBeats = referenceBeats.filter((t, i) => {
        if (t < windowStart || t > windowEnd) return false;
        if (section && (i < section.startBeatIndex || i > section.endBeatIndex)) return false;
        return true;
      });
    } else {
      upcomingBeats = [];
    }
  });

  $effect(() => {
    const section = getCurrentSection();
    bestScore = scoring.loadBestScore(section);
  });

  onMount(async () => {
    scoring.setSection(getCurrentSection());
    bestScore = scoring.loadBestScore();
    isLoading = true;

    try {
      await audioEngine.loadAudio(AUDIO_URL, referenceBeats);
      isLoaded = true;
    } catch (e) {
      console.warn('Audio load failed, using simulated timing:', e);
      isLoaded = true;
    }

    isLoading = false;

    audioEngine.onTimeUpdate = (time: number) => {
      currentTime = time;
      checkSectionBoundary(time);
      checkMissedBeats(time);
    };

    audioEngine.onBeat = (time: number, index: number) => {
      console.debug('Beat triggered:', index, time);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('touchstart', handleTouch);
  });

  onDestroy(() => {
    audioEngine.destroy();
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('touchstart', handleTouch);
  });

  function checkMissedBeats(time: number): void {
    if (!isPlaying) return;

    for (let i = 0; i < referenceBeats.length; i++) {
      const beatTime = referenceBeats[i];
      const timeSinceBeat = time - beatTime;

      if (timeSinceBeat > MISS_THRESHOLD_MS && timeSinceBeat < MISS_THRESHOLD_MS + 50) {
        const existing = hitResults.find((h) => h.beatIndex === i);
        if (!existing) {
          const miss = scoring.registerMiss(i, beatTime);
          if (miss) {
            hitResults = [...hitResults, miss];
            stats = scoring.getStats();
            showJudgement('miss', 999);
          }
        }
      }
    }
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      handleHit();
    }
  }

  function handleTouch(e: TouchEvent): void {
    e.preventDefault();
    handleHit();
  }

  function handleHit(): void {
    if (!isLoaded) return;

    if (!isPlaying) {
      startTraining();
      return;
    }

    const hitTime = audioEngine.getExactNow();
    const result = scoring.registerHit(hitTime, referenceBeats);

    if (result) {
      hitResults = [...hitResults, result];
      stats = scoring.getStats();
      showJudgement(result.judge, result.delta);
    }
  }

  function showJudgement(judge: JudgeResult, delta: number): void {
    lastHitAnimation = { judge, delta };
    setTimeout(() => {
      lastHitAnimation = null;
    }, 600);
  }

  function startTraining(): void {
    if (!validateSection()) {
      return;
    }

    const section = getCurrentSection();
    scoring.setSection(section);
    scoring.reset();
    hitResults = [];
    stats = scoring.getStats();
    showResultPopup = false;
    isNewBest = false;
    lastInSection = false;
    sectionBoundaryCrossed = null;

    audioEngine.startLoop(0);
    isPlaying = true;
  }

  function stopTraining(): void {
    audioEngine.stop();
    isPlaying = false;

    const finalStats = scoring.getStats();
    if (finalStats.totalHits > 0) {
      const section = getCurrentSection();
      isNewBest = scoring.saveBestScore(finalStats, section);
      bestScore = scoring.loadBestScore(section);
    }

    showResultPopup = true;
  }

  function togglePlay(): void {
    if (!isLoaded) return;

    if (isPlaying) {
      stopTraining();
    } else {
      startTraining();
    }
  }

  function resetStats(): void {
    const section = getCurrentSection();
    scoring.setSection(section);
    scoring.reset();
    hitResults = [];
    stats = scoring.getStats();
    showResultPopup = false;
    currentTime = 0;
    lastInSection = false;
    sectionBoundaryCrossed = null;
    bestScore = scoring.loadBestScore(section);
  }

  function getJudgeLabel(judge: JudgeResult): string {
    switch (judge) {
      case 'perfect': return 'PERFECT';
      case 'good': return 'GOOD';
      case 'miss': return 'MISS';
    }
  }

  function getJudgeTextColor(judge: JudgeResult): string {
    return Scoring.getJudgeColor(judge);
  }

  function formatDelta(delta: number): string {
    if (delta === 999) return '---';
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta.toFixed(0)}ms`;
  }

  function calculateAccuracy(): number {
    const total = stats.perfectCount + stats.goodCount + stats.missCount;
    if (total === 0) return 0;
    return ((stats.perfectCount + stats.goodCount * 0.5) / total) * 100;
  }
</script>

<div class="app-container">
  <header class="app-header">
    <div class="header-decoration left"></div>
    <h1 class="app-title">
      <span class="title-char">锣</span>
      <span class="title-char">鼓</span>
      <span class="title-char">经</span>
      <span class="title-divider">·</span>
      <span class="title-sub">击打时序偏差训练</span>
    </h1>
    <div class="header-decoration right"></div>
  </header>

  <main class="app-main">
    <section class="stats-section">
      <div class="stats-grid">
        <div class="stat-card combo-card">
          <div class="stat-label">当前连击</div>
          <div class="stat-value combo-value" class:combo-active={stats.combo > 0}>
            {stats.combo}
            <span class="combo-x">COMBO</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-label">最高连击</div>
          <div class="stat-value">{stats.maxCombo}</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">平均偏差</div>
          <div class="stat-value delta-value">
            {stats.averageDelta.toFixed(1)}
            <span class="stat-unit">ms</span>
          </div>
        </div>

        <div class="stat-card accuracy-card">
          <div class="stat-label">准确率</div>
          <div class="stat-value">{calculateAccuracy().toFixed(1)}%</div>
        </div>
      </div>

      <div class="judge-counts">
        <div class="judge-count perfect">
          <span class="judge-dot"></span>
          <span class="judge-label">PERFECT</span>
          <span class="judge-number">{stats.perfectCount}</span>
        </div>
        <div class="judge-count good">
          <span class="judge-dot"></span>
          <span class="judge-label">GOOD</span>
          <span class="judge-number">{stats.goodCount}</span>
        </div>
        <div class="judge-count miss">
          <span class="judge-dot"></span>
          <span class="judge-label">MISS</span>
          <span class="judge-number">{stats.missCount}</span>
        </div>
      </div>
    </section>

    {#if lastHitAnimation}
      <div class="hit-animation" style="color: {getJudgeTextColor(lastHitAnimation.judge)}">
        <div class="hit-judge">{getJudgeLabel(lastHitAnimation.judge)}</div>
        {#if lastHitAnimation.delta !== 999}
          <div class="hit-delta">{formatDelta(lastHitAnimation.delta)}</div>
        {/if}
      </div>
    {/if}

    <section class="section-selector-section">
      <div class="section-selector-card">
        <div class="section-selector-header">
          <span class="section-label">练习范围</span>
          {#if isPlaying}
            <span class="section-locked-hint">训练中不可修改</span>
          {/if}
        </div>
        <div class="section-mode-toggle">
          <button
            class="mode-btn {practiceMode === 'full' ? 'active' : ''}"
            class:disabled={isPlaying}
            onclick={() => { if (!isPlaying) practiceMode = 'full'; }}
            disabled={isPlaying}
          >
            全曲
          </button>
          <button
            class="mode-btn {practiceMode === 'section' ? 'active' : ''}"
            class:disabled={isPlaying}
            onclick={() => { if (!isPlaying) practiceMode = 'section'; }}
            disabled={isPlaying}
          >
            段落选练
          </button>
        </div>
        {#if practiceMode === 'section'}
          <div class="section-inputs">
            <div class="input-group">
              <label for="section-start-beat">起始节拍</label>
              <input
                id="section-start-beat"
                type="number"
                min="1"
                max={referenceBeats.length}
                bind:value={sectionStartBeat}
                class="beat-input"
                class:input-error={!validateSection()}
                disabled={isPlaying}
              />
            </div>
            <span class="input-separator">—</span>
            <div class="input-group">
              <label for="section-end-beat">结束节拍</label>
              <input
                id="section-end-beat"
                type="number"
                min="1"
                max={referenceBeats.length}
                bind:value={sectionEndBeat}
                class="beat-input"
                class:input-error={!validateSection()}
                disabled={isPlaying}
              />
            </div>
            <span class="beat-count-hint">
              共 {sectionEndBeat - sectionStartBeat + 1} 拍
            </span>
          </div>
          {#if !validateSection()}
            <div class="validation-error">请输入有效的节拍范围（1-{referenceBeats.length}）</div>
          {/if}
        {/if}
      </div>
    </section>

    <section class="timeline-section">
      <BeatTimeline
        referenceBeats={referenceBeats}
        currentTime={currentTime}
        duration={audioEngine.duration || 8000}
        hitResults={hitResults}
        upcomingBeats={upcomingBeats}
        section={getCurrentSection()}
        sectionBoundaryCrossed={sectionBoundaryCrossed}
      />
    </section>

    <section class="control-section">
      <div class="controls">
        <button 
          class="control-btn play-btn"
          class:playing={isPlaying}
          onclick={togglePlay}
          disabled={isLoading}
        >
          {#if isLoading}
            <span class="loading-spinner"></span>
            <span>加载中...</span>
          {:else if isPlaying}
            <span class="btn-icon">⏹</span>
            <span>停止训练</span>
          {:else}
            <span class="btn-icon">▶</span>
            <span>开始训练</span>
          {/if}
        </button>

        <button 
          class="control-btn reset-btn"
          onclick={resetStats}
          disabled={isPlaying}
        >
          <span class="btn-icon">↺</span>
          <span>重置</span>
        </button>

        <div class="volume-control">
          <span class="volume-icon">🔊</span>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.05" 
            bind:value={volume}
            class="volume-slider"
          />
        </div>
      </div>

      <div class="instruction">
        <span class="key-hint">空格键</span>
        <span class="instruction-text">跟随节奏击打 · 点击开始</span>
      </div>
    </section>

    {#if bestScore}
      <section class="best-score-section">
        <div class="best-score-card">
          <div class="best-score-header">
            <span class="best-badge">🏆 最佳成绩</span>
          </div>
          <div class="best-score-stats">
            <div class="best-stat">
              <span class="best-stat-label">最高连击</span>
              <span class="best-stat-value">{bestScore.maxCombo}</span>
            </div>
            <div class="best-stat">
              <span class="best-stat-label">平均偏差</span>
              <span class="best-stat-value">{bestScore.averageDelta.toFixed(1)}ms</span>
            </div>
            <div class="best-stat">
              <span class="best-stat-label">Perfect</span>
              <span class="best-stat-value gold">{bestScore.perfectCount}</span>
            </div>
          </div>
        </div>
      </section>
    {/if}
  </main>

  {#if showResultPopup}
    <div 
      class="result-overlay" 
      role="button"
      tabindex="0"
      onclick={() => showResultPopup = false}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showResultPopup = false; } }}
    >
      <div 
        class="result-popup" 
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      >
        <div class="result-header">
          {#if isNewBest}
            <div class="new-best-badge">🎉 新纪录！</div>
          {/if}
          <h2 class="result-title">训练结束</h2>
        </div>
        
        <div class="result-stats">
          <div class="result-stat-large">
            <span class="result-stat-label">最高连击</span>
            <span class="result-stat-value">{stats.maxCombo}</span>
          </div>
          <div class="result-stat-large">
            <span class="result-stat-label">平均偏差</span>
            <span class="result-stat-value">{stats.averageDelta.toFixed(1)}ms</span>
          </div>
        </div>

        <div class="result-breakdown">
          <div class="breakdown-item perfect">
            <span class="breakdown-label">PERFECT</span>
            <span class="breakdown-count">{stats.perfectCount}</span>
          </div>
          <div class="breakdown-item good">
            <span class="breakdown-label">GOOD</span>
            <span class="breakdown-count">{stats.goodCount}</span>
          </div>
          <div class="breakdown-item miss">
            <span class="breakdown-label">MISS</span>
            <span class="breakdown-count">{stats.missCount}</span>
          </div>
        </div>

        <div class="result-accuracy">
          <span class="accuracy-label">准确率</span>
          <span class="accuracy-value">{calculateAccuracy().toFixed(1)}%</span>
        </div>

        <div class="result-actions">
          <button class="result-btn primary" onclick={startTraining}>
            再来一次
          </button>
          <button class="result-btn secondary" onclick={() => showResultPopup = false}>
            关闭
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
  position: relative;
}

.app-header {
  text-align: center;
  margin-bottom: 24px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.header-decoration {
  width: 60px;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent-gold), transparent);
  position: relative;
}

.header-decoration::before,
.header-decoration::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 6px;
  height: 6px;
  background: var(--accent-gold);
  transform: translateY(-50%) rotate(45deg);
}

.header-decoration.left::before { left: 0; }
.header-decoration.left::after { right: 0; }
.header-decoration.right::before { left: 0; }
.header-decoration.right::after { right: 0; }

.app-title {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-char {
  background: linear-gradient(135deg, var(--accent-gold) 0%, #f4d03f 50%, var(--accent-gold) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 0 30px rgba(212, 175, 55, 0.3);
}

.title-divider {
  color: var(--accent-red);
  margin: 0 8px;
}

.title-sub {
  font-size: 18px;
  color: var(--text-secondary);
  letter-spacing: 2px;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow-y: auto;
  padding-bottom: 20px;
}

.stats-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--accent-red), var(--accent-gold));
  opacity: 0;
  transition: opacity 0.3s ease;
}

.stat-card:hover::before {
  opacity: 1;
}

.stat-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent-gold);
  box-shadow: 0 8px 32px rgba(212, 175, 55, 0.15);
}

.combo-card {
  border-color: var(--accent-gold);
  background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(212, 175, 55, 0.1) 100%);
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
  letter-spacing: 2px;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.stat-value {
  font-size: 36px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.combo-value {
  color: var(--accent-gold);
  font-size: 48px;
  transition: transform 0.2s ease;
}

.combo-value.combo-active {
  animation: pulse-glow 0.5s ease-in-out infinite;
}

.combo-x {
  font-size: 14px;
  color: var(--text-muted);
  margin-left: 6px;
  letter-spacing: 1px;
}

.delta-value {
  font-family: 'Courier New', monospace;
}

.stat-unit {
  font-size: 16px;
  color: var(--text-muted);
  margin-left: 4px;
}

.accuracy-card .stat-value {
  color: var(--accent-green);
}

.judge-counts {
  display: flex;
  justify-content: center;
  gap: 32px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.judge-count {
  display: flex;
  align-items: center;
  gap: 8px;
}

.judge-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.judge-count.perfect .judge-dot {
  background: var(--accent-gold);
  box-shadow: 0 0 10px var(--accent-gold);
}

.judge-count.good .judge-dot {
  background: var(--accent-green);
  box-shadow: 0 0 10px var(--accent-green);
}

.judge-count.miss .judge-dot {
  background: var(--accent-red);
  box-shadow: 0 0 10px var(--accent-red);
}

.judge-label {
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 1px;
}

.judge-number {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  min-width: 30px;
  text-align: right;
}

.hit-animation {
  position: fixed;
  top: 40%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 100;
  text-align: center;
  pointer-events: none;
  animation: pop-in 0.3s ease-out, fade-up 0.6s ease-out forwards;
}

.hit-judge {
  font-size: 64px;
  font-weight: 900;
  letter-spacing: 8px;
  text-shadow: 0 0 40px currentColor;
}

.hit-delta {
  font-size: 24px;
  margin-top: 8px;
  font-family: 'Courier New', monospace;
}

.timeline-section {
  flex-shrink: 0;
}

.control-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.control-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 32px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  letter-spacing: 2px;
}

.play-btn {
  background: linear-gradient(135deg, var(--accent-red) 0%, #e74c3c 100%);
  color: white;
  box-shadow: 0 4px 20px rgba(196, 30, 58, 0.4);
}

.play-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 30px rgba(196, 30, 58, 0.6);
}

.play-btn:active:not(:disabled) {
  transform: translateY(0);
}

.play-btn.playing {
  background: linear-gradient(135deg, var(--accent-gold) 0%, #f4d03f 100%);
  color: var(--bg-primary);
  box-shadow: 0 4px 20px rgba(212, 175, 55, 0.4);
}

.reset-btn {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.reset-btn:hover:not(:disabled) {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--text-muted);
}

.reset-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon {
  font-size: 18px;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.volume-icon {
  font-size: 18px;
}

.volume-slider {
  width: 100px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--bg-tertiary);
  border-radius: 2px;
  outline: none;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: var(--accent-gold);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 10px var(--accent-gold);
}

.instruction {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
}

.key-hint {
  padding: 6px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-gold);
}

.instruction-text {
  font-size: 14px;
  letter-spacing: 1px;
}

.best-score-section {
  margin-top: auto;
}

.best-score-card {
  background: linear-gradient(135deg, rgba(212, 175, 55, 0.1) 0%, var(--bg-secondary) 100%);
  border: 1px solid var(--accent-gold);
  border-radius: 12px;
  padding: 20px;
  position: relative;
  overflow: hidden;
}

.best-score-card::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -20%;
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(212, 175, 55, 0.15) 0%, transparent 70%);
  pointer-events: none;
}

.best-score-header {
  margin-bottom: 16px;
}

.best-badge {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-gold);
  letter-spacing: 2px;
}

.best-score-stats {
  display: flex;
  justify-content: space-around;
}

.best-stat {
  text-align: center;
}

.best-stat-label {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 1px;
  margin-bottom: 4px;
}

.best-stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.best-stat-value.gold {
  color: var(--accent-gold);
}

.section-selector-section {
  margin-bottom: 8px;
}

.section-selector-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 20px;
  transition: all 0.3s ease;
}

.section-selector-card:hover {
  border-color: var(--accent-gold);
}

.section-selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-label {
  font-size: 12px;
  color: var(--text-muted);
  letter-spacing: 2px;
  text-transform: uppercase;
  font-weight: 600;
}

.section-locked-hint {
  font-size: 11px;
  color: var(--accent-red);
  font-weight: 600;
  animation: pulse-glow 1.5s ease-in-out infinite;
}

.section-mode-toggle {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.mode-btn {
  flex: 1;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  letter-spacing: 1px;
}

.mode-btn:hover:not(:disabled):not(.active) {
  border-color: var(--accent-gold);
  color: var(--text-primary);
}

.mode-btn.active {
  background: linear-gradient(135deg, var(--accent-gold) 0%, #f4d03f 100%);
  border-color: var(--accent-gold);
  color: var(--bg-primary);
  box-shadow: 0 4px 15px rgba(212, 175, 55, 0.3);
}

.mode-btn.disabled,
.mode-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.section-inputs {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input-group label {
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 1px;
}

.beat-input {
  width: 80px;
  padding: 8px 12px;
  font-size: 16px;
  font-weight: 600;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  text-align: center;
  font-family: 'Courier New', monospace;
  transition: all 0.2s ease;
}

.beat-input:focus {
  outline: none;
  border-color: var(--accent-gold);
  box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.2);
}

.beat-input.input-error {
  border-color: var(--accent-red);
  box-shadow: 0 0 0 3px rgba(196, 30, 58, 0.2);
}

.beat-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.input-separator {
  font-size: 18px;
  color: var(--text-muted);
  font-weight: 700;
  padding-bottom: 8px;
}

.beat-count-hint {
  font-size: 12px;
  color: var(--accent-gold);
  font-weight: 600;
  padding-bottom: 8px;
  margin-left: auto;
}

.validation-error {
  margin-top: 8px;
  font-size: 12px;
  color: var(--accent-red);
  font-weight: 600;
}

.result-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(26, 20, 16, 0.9);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fade-in 0.3s ease;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.result-popup {
  background: var(--bg-secondary);
  border: 2px solid var(--border-color);
  border-radius: 20px;
  padding: 40px;
  max-width: 500px;
  width: 90%;
  text-align: center;
  animation: pop-in 0.4s ease-out;
  position: relative;
}

.result-popup::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--accent-red), var(--accent-gold), var(--accent-red));
  border-radius: 20px 20px 0 0;
}

.result-header {
  margin-bottom: 32px;
}

.new-best-badge {
  display: inline-block;
  padding: 8px 20px;
  background: linear-gradient(135deg, var(--accent-gold) 0%, #f4d03f 100%);
  color: var(--bg-primary);
  border-radius: 20px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 2px;
  margin-bottom: 12px;
  animation: pulse-glow 1s ease-in-out infinite;
}

.result-title {
  font-size: 28px;
  color: var(--text-primary);
  letter-spacing: 4px;
}

.result-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 24px;
}

.result-stat-large {
  padding: 20px;
  background: var(--bg-tertiary);
  border-radius: 12px;
}

.result-stat-label {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  letter-spacing: 2px;
  margin-bottom: 8px;
}

.result-stat-value {
  font-size: 36px;
  font-weight: 700;
  color: var(--accent-gold);
}

.result-breakdown {
  display: flex;
  justify-content: space-around;
  margin-bottom: 24px;
  padding: 20px;
  background: var(--bg-tertiary);
  border-radius: 12px;
}

.breakdown-item {
  text-align: center;
}

.breakdown-label {
  display: block;
  font-size: 11px;
  letter-spacing: 2px;
  margin-bottom: 4px;
}

.breakdown-item.perfect .breakdown-label { color: var(--accent-gold); }
.breakdown-item.good .breakdown-label { color: var(--accent-green); }
.breakdown-item.miss .breakdown-label { color: var(--accent-red); }

.breakdown-count {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
}

.result-accuracy {
  margin-bottom: 32px;
}

.accuracy-label {
  display: block;
  font-size: 14px;
  color: var(--text-muted);
  letter-spacing: 2px;
  margin-bottom: 8px;
}

.accuracy-value {
  font-size: 48px;
  font-weight: 900;
  background: linear-gradient(135deg, var(--accent-gold) 0%, #f4d03f 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.result-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.result-btn {
  padding: 14px 32px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  letter-spacing: 2px;
}

.result-btn.primary {
  background: linear-gradient(135deg, var(--accent-red) 0%, #e74c3c 100%);
  color: white;
  box-shadow: 0 4px 20px rgba(196, 30, 58, 0.4);
}

.result-btn.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 30px rgba(196, 30, 58, 0.6);
}

.result-btn.secondary {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.result-btn.secondary:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .app-container {
    padding: 16px;
  }

  .app-title {
    font-size: 20px;
    flex-direction: column;
    gap: 4px;
  }

  .title-sub {
    font-size: 14px;
  }

  .header-decoration {
    display: none;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .stat-card {
    padding: 16px;
  }

  .stat-value {
    font-size: 28px;
  }

  .combo-value {
    font-size: 36px;
  }

  .judge-counts {
    gap: 16px;
    flex-wrap: wrap;
  }

  .controls {
    flex-wrap: wrap;
    justify-content: center;
  }

  .control-btn {
    padding: 14px 24px;
    font-size: 14px;
  }

  .hit-judge {
    font-size: 48px;
  }

  .result-popup {
    padding: 24px;
  }

  .result-stats {
    grid-template-columns: 1fr;
  }
}
</style>
