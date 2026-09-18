import { AppError } from './errors.js';

export class CircuitBreaker {
  constructor({ failureThreshold = 4, cooldownMs = 30_000, now = () => Date.now(), onStateChange } = {}) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.now = now;
    this.onStateChange = onStateChange;
    this.state = 'closed';
    this.failures = 0;
    this.nextAttemptAt = 0;
    this.halfOpenProbeActive = false;
  }

  transition(state) {
    if (this.state === state) return;
    const previous = this.state;
    this.state = state;
    this.onStateChange?.({ previous, state, failures: this.failures });
  }

  beforeRequest() {
    if (this.state === 'open' && this.now() >= this.nextAttemptAt) {
      this.transition('half_open');
    }
    if (this.state === 'open' || (this.state === 'half_open' && this.halfOpenProbeActive)) {
      throw new AppError('The weather provider is recovering. Please try again shortly.', {
        code: 'WEATHER_CIRCUIT_OPEN',
        status: 503,
        expose: true,
      });
    }
    if (this.state === 'half_open') this.halfOpenProbeActive = true;
  }

  success() {
    this.failures = 0;
    this.halfOpenProbeActive = false;
    this.transition('closed');
  }

  failure() {
    this.failures += 1;
    this.halfOpenProbeActive = false;
    if (this.state === 'half_open' || this.failures >= this.failureThreshold) {
      this.nextAttemptAt = this.now() + this.cooldownMs;
      this.transition('open');
    }
  }

  async execute(operation) {
    this.beforeRequest();
    try {
      const result = await operation();
      this.success();
      return result;
    } catch (error) {
      this.failure();
      throw error;
    }
  }

  snapshot() {
    return {
      state: this.state,
      consecutiveFailures: this.failures,
      retryAt: this.state === 'open' ? new Date(this.nextAttemptAt).toISOString() : null,
    };
  }
}

