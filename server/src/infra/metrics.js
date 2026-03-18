import client from "prom-client";

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const httpRequestDurationMs = new client.Histogram({
  name: "http_request_duration_ms",
  help: "HTTP request duration in ms",
  labelNames: ["method", "route", "status"],
  buckets: [1, 2, 5, 10, 25, 50, 75, 100, 150, 250, 500, 1000],
});

export const apiKeyRotations = new client.Counter({
  name: "api_key_rotations_total",
  help: "Total API key rotations",
  labelNames: ["tenant_id"],
});

export const gatewayAlertsTotal = new client.Counter({
  name: "gateway_alerts_total",
  help: "Total gateway alerts created",
  labelNames: ["tenant_id", "category", "severity"],
});

export const gatewayAnomaliesTotal = new client.Counter({
  name: "gateway_anomalies_total",
  help: "Total gateway anomalies detected",
  labelNames: ["tenant_id", "type"],
});

export const gatewayCredentialCooldownsTotal = new client.Counter({
  name: "gateway_credential_cooldowns_total",
  help: "Total provider credential cooldown actions",
  labelNames: ["tenant_id", "provider"],
});

export const gatewayAutoRotationsTotal = new client.Counter({
  name: "gateway_auto_rotations_total",
  help: "Total automatic gateway API key rotations",
  labelNames: ["tenant_id", "reason"],
});

register.registerMetric(httpRequestDurationMs);
register.registerMetric(apiKeyRotations);
register.registerMetric(gatewayAlertsTotal);
register.registerMetric(gatewayAnomaliesTotal);
register.registerMetric(gatewayCredentialCooldownsTotal);
register.registerMetric(gatewayAutoRotationsTotal);

