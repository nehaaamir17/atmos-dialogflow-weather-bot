import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { WeatherService } from './weather-service.js';
import { log } from './logger.js';
import { MetricsRegistry } from './metrics.js';
import { CircuitBreaker } from './circuit-breaker.js';

const config = loadConfig();
const metrics = new MetricsRegistry();
const circuitBreaker = new CircuitBreaker({
  onStateChange: (change) => log('warn', 'weather_circuit_state_changed', change),
});
const weatherService = new WeatherService(config, { metrics, circuitBreaker });
const server = createServer(createApp({ config, weatherService, metrics, circuitBreaker }));

server.requestTimeout = 5_000;
server.headersTimeout = 6_000;
server.keepAliveTimeout = 5_000;

server.listen(config.port, '0.0.0.0', () => {
  log('info', 'server_started', {
    port: config.port,
    environment: config.nodeEnv,
    weatherConfigured: Boolean(config.openWeatherApiKey),
    weatherProvider: config.openWeatherApiKey && config.openWeatherOneCallEnabled
      ? 'openweather'
      : config.openWeatherApiKey && config.openMeteoFallback
        ? 'hybrid-free'
        : 'open-meteo',
  });
});

function shutdown(signal) {
  log('info', 'server_shutdown_started', { signal });
  server.close((error) => {
    if (error) {
      log('error', 'server_shutdown_failed', { error: error.message });
      process.exitCode = 1;
    }
  });
  setTimeout(() => process.exit(1), 4_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
