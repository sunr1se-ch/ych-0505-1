export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private startTime: number = 0;
  private pauseTime: number = 0;
  private _isPlaying: boolean = false;
  private _duration: number = 0;
  private animationFrameId: number | null = null;
  private lastBeatIndex: number = -1;
  private referenceBeats: number[] = [];

  onTimeUpdate: ((time: number) => void) | null = null;
  onBeat: ((time: number, index: number) => void) | null = null;
  onEnded: (() => void) | null = null;

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get duration(): number {
    return this._duration;
  }

  async loadAudio(url: string, referenceBeats: number[] = []): Promise<void> {
    this.referenceBeats = referenceBeats;
    
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    this._duration = this.audioBuffer.duration * 1000;
  }

  setReferenceBeats(beats: number[]): void {
    this.referenceBeats = beats;
    this.lastBeatIndex = -1;
  }

  startLoop(offsetMs: number = 0): void {
    if (!this.audioContext || !this.audioBuffer) return;

    this.stop();

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.loop = true;

    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 1.0;

    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);

    const offsetSec = offsetMs / 1000;
    this.startTime = this.audioContext.currentTime - offsetSec;
    this.pauseTime = 0;
    this._isPlaying = true;
    this.lastBeatIndex = -1;

    this.sourceNode.onended = () => {
      if (this._isPlaying && this.onEnded) {
        this.onEnded();
      }
    };

    this.sourceNode.start(0, offsetSec);
    this.startTimeUpdate();
  }

  stop(): void {
    this._isPlaying = false;
    this.stopTimeUpdate();
    
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch (e) {}
      this.sourceNode = null;
    }
    
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
  }

  pause(): void {
    if (!this._isPlaying || !this.audioContext) return;
    
    this.pauseTime = this.getCurrentTime();
    this._isPlaying = false;
    this.stopTimeUpdate();
    
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (e) {}
    }
  }

  resume(): void {
    if (this._isPlaying || !this.audioBuffer) return;
    
    this.startLoop(this.pauseTime);
  }

  getCurrentTime(): number {
    if (!this.audioContext || !this._isPlaying) {
      return this.pauseTime;
    }
    const elapsed = (this.audioContext.currentTime - this.startTime) * 1000;
    return this._duration > 0 ? elapsed % this._duration : elapsed;
  }

  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  private startTimeUpdate(): void {
    const update = () => {
      if (!this._isPlaying) return;
      
      const currentTime = this.getCurrentTime();
      
      if (this.onTimeUpdate) {
        this.onTimeUpdate(currentTime);
      }

      this.checkBeatTriggers(currentTime);
      
      this.animationFrameId = requestAnimationFrame(update);
    };
    update();
  }

  private stopTimeUpdate(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private checkBeatTriggers(currentTime: number): void {
    if (this.referenceBeats.length === 0 || !this.onBeat) return;

    const tolerance = 15;
    
    for (let i = 0; i < this.referenceBeats.length; i++) {
      const beatTime = this.referenceBeats[i];
      const diff = currentTime - beatTime;
      
      if (diff >= 0 && diff < tolerance && i > this.lastBeatIndex) {
        this.lastBeatIndex = i;
        this.onBeat(beatTime, i);
        break;
      }
      
      if (currentTime < beatTime - tolerance) {
        break;
      }
    }

    if (currentTime < 100 && this.lastBeatIndex >= this.referenceBeats.length - 1) {
      this.lastBeatIndex = -1;
    }
  }

  getExactNow(): number {
    if (!this.audioContext) return performance.now();
    return this.getCurrentTime();
  }

  destroy(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
