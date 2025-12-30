// src/playback/playback.ts

/**
 * TTS Playback Engine using Web Speech API
 * Reads comments aloud sequentially with play/pause/stop controls
 */

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentIndex: number;
  totalComments: number;
}

export class PlaybackEngine {
  private synthesis: SpeechSynthesis;
  private utterance: SpeechSynthesisUtterance | null = null;
  private comments: Array<{ text: string; author: string | null }> = [];
  private currentIndex: number = 0;
  private playbackSpeed: number = 1.0;
  private onStateChange: ((state: PlaybackState) => void) | null = null;
  private onCommentChange: ((index: number) => void) | null = null;

  constructor() {
    this.synthesis = window.speechSynthesis;
    console.log('🔊 Playback Engine initialized');
  }

  /**
   * Load comments for playback
   */
  public loadComments(comments: Array<{ text: string; author: string | null }>) {
    console.log(`📥 Loading ${comments.length} comments for playback`);
    this.comments = comments;
    this.currentIndex = 0;
    this.emitStateChange();
  }

  /**
   * Start or resume playback
   */
  public play() {
    console.log('▶️  Play');

    if (this.comments.length === 0) {
      console.warn('⚠️  No comments loaded');
      return;
    }

    // If paused, resume
    if (this.synthesis.paused) {
      console.log('▶️  Resuming from pause');
      this.synthesis.resume();
      this.emitStateChange();
      return;
    }

    // If already speaking, don't start again
    if (this.synthesis.speaking) {
      console.log('⚠️  Already speaking');
      return;
    }

    // Start reading from current index
    this.readComment(this.currentIndex);
  }

  /**
   * Pause playback
   */
  public pause() {
    console.log('⏸️  Pause');
    if (this.synthesis.speaking && !this.synthesis.paused) {
      this.synthesis.pause();
      this.emitStateChange();
    }
  }

  /**
   * Stop playback completely
   */
  public stop() {
    console.log('⏹️  Stop');
    this.synthesis.cancel();
    this.currentIndex = 0;
    this.utterance = null;
    this.emitStateChange();
  }

  /**
   * Go to next comment
   */
  public next() {
    console.log('⏭️  Next');
    this.synthesis.cancel();

    if (this.currentIndex < this.comments.length - 1) {
      this.currentIndex++;
      this.readComment(this.currentIndex);
    } else {
      console.log('📍 Already at last comment');
      this.stop();
    }
  }

  /**
   * Go to previous comment
   */
  public previous() {
    console.log('⏮️  Previous');
    this.synthesis.cancel();

    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.readComment(this.currentIndex);
    } else {
      console.log('📍 Already at first comment');
      this.currentIndex = 0;
      this.readComment(this.currentIndex);
    }
  }

  /**
   * Set playback speed (0.5 - 2.0)
   */
  public setSpeed(speed: number) {
    console.log(`🎚️  Setting speed to ${speed}x`);
    this.playbackSpeed = Math.max(0.5, Math.min(2.0, speed));

    // If currently speaking, update the current utterance
    if (this.utterance) {
      this.utterance.rate = this.playbackSpeed;
    }
  }

  /**
   * Get current playback state
   */
  public getState(): PlaybackState {
    return {
      isPlaying: this.synthesis.speaking && !this.synthesis.paused,
      isPaused: this.synthesis.paused,
      currentIndex: this.currentIndex,
      totalComments: this.comments.length
    };
  }

  /**
   * Set callback for state changes
   */
  public onStateChangeCallback(callback: (state: PlaybackState) => void) {
    this.onStateChange = callback;
  }

  /**
   * Set callback for comment changes
   */
  public onCommentChangeCallback(callback: (index: number) => void) {
    this.onCommentChange = callback;
  }

  /**
   * Read a specific comment
   */
  private readComment(index: number) {
    if (index < 0 || index >= this.comments.length) {
      console.warn(`⚠️  Invalid comment index: ${index}`);
      return;
    }

    const comment = this.comments[index];
    console.log(`🗣️  Reading comment ${index + 1}/${this.comments.length}`);
    console.log(`👤 Author: ${comment.author || 'Unknown'}`);
    console.log(`💬 Text preview: ${comment.text.substring(0, 50)}...`);

    // Notify about comment change
    if (this.onCommentChange) {
      this.onCommentChange(index);
    }

    // Create utterance
    this.utterance = new SpeechSynthesisUtterance(comment.text);
    this.utterance.rate = this.playbackSpeed;
    this.utterance.pitch = 1.0;
    this.utterance.volume = 1.0;

    // When this comment finishes, move to next
    this.utterance.onend = () => {
      console.log('✅ Comment finished');

      // Auto-advance to next comment
      if (this.currentIndex < this.comments.length - 1) {
        this.currentIndex++;
        setTimeout(() => this.readComment(this.currentIndex), 100);
      } else {
        console.log('🎉 Reached end of comments');
        this.stop();
      }
    };

    this.utterance.onerror = (event) => {
      console.error('❌ Speech error:', event);
      this.emitStateChange();
    };

    // Start speaking
    this.synthesis.speak(this.utterance);
    this.emitStateChange();
  }

  /**
   * Emit state change to callback
   */
  private emitStateChange() {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }
}