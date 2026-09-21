import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { WeatherService } from '../src/weather-service.js';
import { MetricsRegistry } from '../src/metrics.js';
import { CircuitBreaker } from '../src/circuit-breaker.js';
import { log } from '../src/logger.js';

const config = loadConfig();
const metrics = new MetricsRegistry();
const circuitBreaker = new CircuitBreaker({
  onStateChange: (change) => log('warn', 'weather_circuit_state_changed', change),
});
const weatherService = new WeatherService(config, { metrics, circuitBreaker });

export default createApp({ config, weatherService, metrics, circuitBreaker });
