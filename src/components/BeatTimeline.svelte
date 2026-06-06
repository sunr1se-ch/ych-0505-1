<script lang="ts">
  import type { HitResult } from '@/engine/Scoring';
  import { Scoring } from '@/engine/Scoring';

  let {
    referenceBeats = [] as number[],
    currentTime = 0,
    duration = 8000,
    hitResults = [] as HitResult[],
    upcomingBeats = [] as number[]
  } = $props();

  const visibleWindowMs = 4000;
  const centerOffsetMs = 1000;

  let viewStart = $derived(currentTime - centerOffsetMs);
  let playheadX = 25;
  let perfectZoneWidth = 1.5;
  let goodZoneWidth = 3;

  function getXPosition(timeMs: number): number {
    return ((timeMs - viewStart) / visibleWindowMs) * 100;
  }

  function getBeatClass(timeMs: number): string {
    const hit = hitResults.find((h) => h.referenceTime === timeMs);
    if (hit) {
      return `beat beat-${hit.judge}`;
    }
    if (upcomingBeats.includes(timeMs)) {
      return 'beat beat-upcoming';
    }
    const distance = Math.abs(timeMs - currentTime);
    if (distance < 50) {
      return 'beat beat-current';
    }
    if (timeMs < currentTime) {
      return 'beat beat-past';
    }
    return 'beat beat-future';
  }

  function getHitX(result: HitResult): number {
    return getXPosition(result.hitTime);
  }

  function formatDelta(delta: number): string {
    if (delta > 0) return `+${delta.toFixed(0)}`;
    return delta.toFixed(0);
  }
</script>

<div class="timeline-container">
  <div class="timeline-header">
    <span class="label">过去</span>
    <span class="label center-label">击打区</span>
    <span class="label">未来</span>
  </div>
  
  <div class="timeline-track">
    <div class="timeline-grid">
      {#each Array.from({ length: 9 }) as _, i}
        <div class="grid-line" style="left: {i * 12.5}%"></div>
      {/each}
    </div>

    <div class="beat-marker beat-zone perfect-zone" style="left: 25%; width: {perfectZoneWidth}%"></div>
    <div class="beat-marker beat-zone perfect-zone" style="left: {playheadX - perfectZoneWidth}%; width: {perfectZoneWidth}%"></div>
    <div class="beat-marker beat-zone good-zone" style="left: {playheadX + perfectZoneWidth}%; width: {goodZoneWidth}%"></div>
    <div class="beat-marker beat-zone good-zone" style="left: {playheadX - perfectZoneWidth - goodZoneWidth}%; width: {goodZoneWidth}%"></div>

    <div class="playhead">
      <div class="playhead-line"></div>
      <div class="playhead-glow"></div>
      <div class="playhead-diamond"></div>
    </div>

    {#each referenceBeats as beatTime (beatTime)}
      {@const x = getXPosition(beatTime)}
      {@const hit = hitResults.find((h) => h.referenceTime === beatTime)}
      {#if x >= -5 && x <= 105}
        <div class={getBeatClass(beatTime)} style="left: {x}%">
          <div class="beat-line"></div>
          {#if hit}
            <div class="beat-result" style="color: {Scoring.getJudgeColor(hit.judge)}">
              {hit.judge === 'perfect' ? 'P' : hit.judge === 'good' ? 'G' : 'M'}
            </div>
          {/if}
        </div>
      {/if}
    {/each}

    {#each hitResults as hit (hit.beatIndex + '-' + hit.hitTime)}
      {@const hitX = getHitX(hit)}
      {#if hitX >= -5 && hitX <= 105 && hit.hitTime > 0}
        <div 
          class="hit-marker hit-{hit.judge}" 
          style="left: {hitX}%"
        >
          <div class="hit-delta">{formatDelta(hit.delta)}ms</div>
        </div>
      {/if}
    {/each}
  </div>

  <div class="timeline-footer">
    <span class="time-display">{Math.round(currentTime)} ms</span>
    <span class="time-display">/ {Math.round(duration)} ms</span>
  </div>
</div>

<style scoped>
.timeline-container {
  width: 100%;
  padding: 20px;
  background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
  border: 2px solid var(--border-color);
  border-radius: 12px;
  position: relative;
  overflow: hidden;
}

.timeline-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: 
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 50px,
      rgba(212, 175, 55, 0.03) 50px,
      rgba(212, 175, 55, 0.03) 51px
    );
  pointer-events: none;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 0 8px;
}

.label {
  font-size: 12px;
  color: var(--text-muted);
  letter-spacing: 2px;
}

.center-label {
  color: var(--accent-gold);
  font-weight: 600;
}

.timeline-track {
  position: relative;
  height: 120px;
  background: linear-gradient(90deg, 
    rgba(26, 20, 16, 0.8) 0%, 
    rgba(26, 20, 16, 0.4) 25%,
    rgba(26, 20, 16, 0.2) 50%,
    rgba(26, 20, 16, 0.4) 75%,
    rgba(26, 20, 16, 0.8) 100%
  );
  border-radius: 8px;
  overflow: hidden;
}

.timeline-grid {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.grid-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(74, 61, 48, 0.5);
}

.beat-zone {
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: 0.3;
  border-radius: 2px;
}

.perfect-zone {
  background: var(--accent-gold);
}

.good-zone {
  background: var(--accent-green);
}

.playhead {
  position: absolute;
  top: 0;
  left: 25%;
  width: 3px;
  height: 100%;
  z-index: 10;
}

.playhead-line {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  height: 100%;
  background: var(--accent-red);
  box-shadow: var(--shadow-glow-red);
}

.playhead-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  background: radial-gradient(circle, rgba(196, 30, 58, 0.3) 0%, transparent 70%);
  animation: pulse-glow 1s ease-in-out infinite;
}

.playhead-diamond {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(45deg);
  width: 12px;
  height: 12px;
  background: var(--accent-red);
  box-shadow: var(--shadow-glow-red);
}

.beat {
  position: absolute;
  top: 0;
  width: 4px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translateX(-50%);
  transition: all 0.2s ease;
}

.beat-line {
  width: 3px;
  height: 100%;
  border-radius: 2px;
  transition: all 0.2s ease;
}

.beat-past .beat-line {
  background: var(--text-muted);
  opacity: 0.5;
}

.beat-future .beat-line {
  background: var(--text-secondary);
  opacity: 0.7;
}

.beat-current .beat-line {
  background: var(--accent-gold);
  box-shadow: var(--shadow-glow-gold);
  width: 6px;
}

.beat-upcoming .beat-line {
  background: var(--accent-gold);
  opacity: 0.8;
  animation: pulse-glow 0.5s ease-in-out infinite;
}

.beat-perfect .beat-line {
  background: var(--accent-gold);
  box-shadow: 0 0 15px var(--accent-gold);
}

.beat-good .beat-line {
  background: var(--accent-green);
  box-shadow: 0 0 12px var(--accent-green);
}

.beat-miss .beat-line {
  background: var(--accent-red);
  box-shadow: 0 0 12px var(--accent-red);
}

.beat-result {
  position: absolute;
  top: 8px;
  font-size: 14px;
  font-weight: bold;
  text-shadow: 0 0 10px currentColor;
  animation: pop-in 0.3s ease-out;
}

.hit-marker {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 5;
}

.hit-marker::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 16px;
  height: 16px;
  border-radius: 50%;
  animation: pop-in 0.2s ease-out;
}

.hit-perfect::before {
  background: var(--accent-gold);
  box-shadow: 0 0 20px var(--accent-gold);
}

.hit-good::before {
  background: var(--accent-green);
  box-shadow: 0 0 15px var(--accent-green);
}

.hit-miss::before {
  background: var(--accent-red);
  box-shadow: 0 0 15px var(--accent-red);
}

.hit-delta {
  position: absolute;
  bottom: -24px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  animation: fade-up 0.8s ease-out forwards;
}

.hit-perfect .hit-delta {
  color: var(--accent-gold);
}

.hit-good .hit-delta {
  color: var(--accent-green);
}

.hit-miss .hit-delta {
  color: var(--accent-red);
}

.timeline-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
  padding: 0 8px;
}

.time-display {
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'Courier New', monospace;
}
</style>
