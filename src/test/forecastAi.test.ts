import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, must, seedAdmin, seedArtisan, seedBooking, seedCustomer, seedWorker, setupTest } from "./convexHarness";

/**
 * `forecastAi:runForecast` runs with no Gemini key in CI, so it takes the
 * deterministic heuristic branch. That is exactly the path that must never
 * render NaN or crash — it is what the admin console shows without a key.
 *
 * Two things had to be pinned before "deterministic" was true:
 *
 *  1. The clock. The action read `new Date()` for the season and the festival
 *     window, so a run crossing midnight on a month boundary could reason about
 *     a different month than the assertions expected. `toFake: ["Date"]` freezes
 *     `new Date()`/`Date.now()` while leaving timers alone, so awaiting real
 *     promises still works.
 *  2. The network. `fetchWeather()` reaches api.open-meteo.com, and this test
 *     never stubbed it. Live latency, a 429, or a DNS blip under parallel load
 *     all turned a unit test into an integration test. The fixture below is a
 *     real Open-Meteo daily payload for a heavy-rain week, so the weather
 *     branch is still genuinely exercised — it is just no longer a coin flip.
 */
const FIXED_NOW = new Date("2026-01-15T09:00:00.000Z");

const WEATHER_FIXTURE = {
  current: {
    temperature_2m: 24.1,
    relative_humidity_2m: 88,
    precipitation: 12.4,
    wind_speed_10m: 21.3,
    weather_code: 65,
  },
  daily: {
    precipitation_sum: [18.2, 24.6, 31.1, 12.0, 8.4, 3.1, 0.8],
    temperature_2m_max: [27.4, 26.1, 25.3, 28.0, 30.2, 31.4, 30.9],
    temperature_2m_min: [19.8, 19.4, 18.9, 19.6, 20.8, 21.6, 21.1],
    precipitation_hours: [6, 8, 11, 5, 3, 2, 1],
  },
};

describe("forecastAi:runForecast", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => WEATHER_FIXTURE,
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("refuses a signed-out caller and a non-officer", async () => {
    const t = setupTest();
    await expect(t.action(api.forecastAi.runForecast, {})).rejects.toThrow(
      "Not authenticated",
    );
    const c = await seedCustomer(t);
    await expect(c.as.action(api.forecastAi.runForecast, {})).rejects.toThrow("Forbidden");
  });

  it("returns clamped, renderable numbers and persists a snapshot", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    await seedArtisan(t, w.id, { trade: "electrician", isOnline: true, kycStatus: "verified" });
    await seedBooking(t, (await seedCustomer(t)).id, {
      trade: "electrician",
      status: "pending",
    });

    const result = await a.as.action(api.forecastAi.runForecast, {});
    expect(result.source).toBe("heuristic");
    expect(result.demandIndex).toBeGreaterThanOrEqual(1);
    expect(result.demandIndex).toBeLessThanOrEqual(100);
    expect(result.welfarePoolAllocation).toBeGreaterThanOrEqual(5);
    expect(result.welfarePoolAllocation).toBeLessThanOrEqual(15);
    expect(Number.isFinite(result.fairRatePerHour)).toBe(true);
    expect(Number.isFinite(result.confidence)).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
    expect(Array.isArray(result.primaryDeficitTrades)).toBe(true);
    expect(result.actionableAdvisories.length).toBeGreaterThan(0);
    expect(result.topTrade).toBeTruthy();
    expect(result.priceRecommendation).toBeTruthy();

    const saved = must(
      await t.run((ctx) => ctx.db.get(result.id as never)),
      "forecast",
    ) as { source: string; fairRatePerHour: number; advisories: string[]; context: string };
    expect(saved.source).toBe("heuristic");
    expect(saved.fairRatePerHour).toBe(result.fairRatePerHour);
    expect(saved.advisories).toEqual(result.actionableAdvisories);
    // The stored context must be real JSON, not "[object Object]".
    expect(() => JSON.parse(String(saved.context))).not.toThrow();
  });

  it("runs the stabilization variant too", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    const result = await a.as.action(api.forecastAi.runForecast, { kind: "stabilization" });
    expect(result.source).toBe("heuristic");
    expect(result.summary).toContain("stabilization");
    expect(Number.isFinite(result.demandIndex)).toBe(true);
  });

  it("feeds the public forecast card after it runs", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    await a.as.action(api.forecastAi.runForecast, {});
    const card = await t.query(api.forecasts.publicLatest);
    expect(card.source).toBe("heuristic");
    expect(card.topTrade).toBeTruthy();
    expect(Number.isFinite(card.fairRatePerHour)).toBe(true);
  });

  it("handles an empty federation without dividing by zero", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    const result = await a.as.action(api.forecastAi.runForecast, {});
    expect(Number.isFinite(result.demandIndex)).toBe(true);
    expect(Number.isFinite(result.fairRatePerHour)).toBe(true);
    expect(Number.isFinite(result.confidence)).toBe(true);
    // With no supply and no demand every trade ties, but the result must still
    // name a real trade so the landing card never renders a blank chip.
    const trades = [
      "electrician",
      "plumber",
      "carpenter",
      "mason",
      "painter",
      "appliance",
    ];
    expect(trades).toContain(result.topTrade);
    expect(result.topTradeReason).toBeTruthy();
    expect(result.primaryDeficitTrades).toEqual([]);
  });

  it("is reproducible — the same inputs give byte-identical output", async () => {
    // The regression guard for the flake itself. Before the clock and the
    // network were pinned, this assertion was the thing that intermittently
    // failed under parallel load.
    const t = setupTest();
    const a = await seedAdmin(t);
    await seedArtisan(t, (await seedWorker(t)).id, {
      trade: "plumber",
      isOnline: true,
      kycStatus: "verified",
    });
    await seedBooking(t, (await seedCustomer(t)).id, { trade: "plumber", status: "pending" });

    const first = await a.as.action(api.forecastAi.runForecast, {});
    const second = await a.as.action(api.forecastAi.runForecast, {});

    for (const key of ["demandIndex", "topTrade", "fairRatePerHour", "confidence"] as const) {
      expect(second[key]).toEqual(first[key]);
    }
  });

  it("reaches the weather provider through the stub, deterministically", async () => {
    // The weather line feeds the *prompt*, not the stored snapshot, so it is not
    // observable in the result. What matters here is that the code path still
    // asks the provider for weather — and now does so against a fixture instead
    // of the live internet. Asserting the call pins both halves: a future
    // refactor that silently drops the weather fetch fails here, and the test
    // itself can no longer fail because open-meteo was slow or rate-limiting.
    const t = setupTest();
    const a = await seedAdmin(t);
    const fetchMock = vi.mocked(globalThis.fetch);

    await a.as.action(api.forecastAi.runForecast, {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("api.open-meteo.com");
    expect(url).toContain("forecast_days=7");
  });
});
