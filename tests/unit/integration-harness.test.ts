import { cassetteFetch, matchKey, REPLAY_ONLY, responseFromRecorded, serializeInteraction } from "../integration/harness.js";

describe("serializeInteraction (cassette scrubbing)", () => {
  const url = "https://tango.makegov.com/api/contracts/?limit=3";

  it("refuses to serialize auth material in response headers", () => {
    const out = serializeInteraction(
      "GET",
      url,
      200,
      {
        "content-type": "application/json",
        "x-api-key": "super-secret-key",
        authorization: "Bearer super-secret-token",
        "set-cookie": "session=abc",
        "x-ratelimit-remaining": "99",
      },
      { count: 0, results: [] },
    );

    const json = JSON.stringify(out);
    expect(json).not.toContain("super-secret");
    expect(json).not.toContain("x-api-key");
    expect(json).not.toContain("authorization");
    expect(json).not.toContain("session=abc");
    expect(out.response.headers).toEqual({ "content-type": "application/json", "x-ratelimit-remaining": "99" });
  });

  it("throws instead of writing when the secret leaks into the payload", () => {
    expect(() =>
      serializeInteraction("GET", url, 200, {}, { echoed: "the-real-api-key" }, "the-real-api-key"),
    ).toThrow(/Refusing to serialize/);
  });

  it("drops headers outside the allowlist", () => {
    const out = serializeInteraction("GET", url, 200, { server: "nginx", date: "now", "content-type": "application/json" }, null);
    expect(out.response.headers).toEqual({ "content-type": "application/json" });
  });

  it("never stores request headers at all", () => {
    const out = serializeInteraction("GET", url, 200, { "content-type": "application/json" }, null);
    expect(Object.keys(out.request)).toEqual(["method", "url"]);
  });
});

describe("matchKey", () => {
  it("is insensitive to query-param order", () => {
    expect(matchKey("GET", "https://a/api/x/?b=2&a=1")).toBe(matchKey("GET", "https://b/api/x/?a=1&b=2"));
  });

  it("distinguishes method, path, and query values", () => {
    const base = matchKey("GET", "https://a/api/x/?a=1");
    expect(matchKey("POST", "https://a/api/x/?a=1")).not.toBe(base);
    expect(matchKey("GET", "https://a/api/y/?a=1")).not.toBe(base);
    expect(matchKey("GET", "https://a/api/x/?a=2")).not.toBe(base);
  });

  it("ignores the host so a TANGO_BASE_URL override still replays", () => {
    expect(matchKey("GET", "http://localhost:8000/api/x/")).toBe(matchKey("GET", "https://tango.makegov.com/api/x/"));
  });
});

describe("body round-trip (record → replay)", () => {
  const url = "https://tango.makegov.com/api/contracts/?limit=3";

  it("replays a text/plain body byte-faithfully instead of as a quoted JSON string", async () => {
    const raw = "plain text, not JSON";
    const recorded = serializeInteraction("GET", url, 502, { "content-type": "text/plain" }, raw, null, "text");
    expect(recorded.response.bodyKind).toBe("text");

    const replayed = responseFromRecorded(recorded);
    expect(await replayed.text()).toBe(raw);
    expect(replayed.status).toBe(502);
  });

  it("replays a JSON body without bodyKind (pre-existing cassette schema) as JSON", async () => {
    const recorded = serializeInteraction("GET", url, 200, { "content-type": "application/json" }, { count: 1, results: [] });
    expect(recorded.response.bodyKind).toBeUndefined();

    const replayed = responseFromRecorded(recorded);
    expect(await replayed.json()).toEqual({ count: 1, results: [] });
  });
});

describe("replay mode", () => {
  it.skipIf(!REPLAY_ONLY)("hard-fails on a missing cassette with a re-record hint", () => {
    expect(() => cassetteFetch("no-such-cassette-xyz")).toThrow(/TANGO_REFRESH_CASSETTES/);
  });
});
