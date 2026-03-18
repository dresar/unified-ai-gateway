import { describe, expect, it } from "vitest"
import { classifyErrorType, detectLeakRisk, getRemediationPolicy } from "../server/src/services/observability.js"

describe("observability helpers", () => {
  it("classifies provider rate limit and timeout correctly", () => {
    expect(classifyErrorType({ statusCode: 429, errorMessage: "rate limited" })).toBe("provider_rate_limit")
    expect(classifyErrorType({ statusCode: 503, errorMessage: "upstream timeout" })).toBe("upstream_timeout")
  })

  it("detects leak risk from burst and domain spread", () => {
    expect(detectLeakRisk({ burstCount: 85, distinctDomains: 2, recentRequests: 90 })).toBe("warning")
    expect(detectLeakRisk({ burstCount: 180, distinctDomains: 3, recentRequests: 220 })).toBe("critical")
    expect(detectLeakRisk({ burstCount: 20, distinctDomains: 1, recentRequests: 20 })).toBeNull()
  })

  it("maps anomaly and error types to remediation", () => {
    expect(getRemediationPolicy({ errorType: "provider_rate_limit", anomalyTypes: [] })).toBe("cooldown_credential")
    expect(getRemediationPolicy({ errorType: "success", anomalyTypes: ["possible_api_key_leak"] })).toBe("rotate_api_key")
    expect(getRemediationPolicy({ errorType: "client_error", anomalyTypes: [] })).toBe("none")
  })
})
