import {
  API_KEY_STORAGE_KEY,
  YouTubeApiError,
  fetchPopularVideos,
  getApiKey,
  getPublishedAfter,
  getVideoKindFromUrl,
  resolveChannelId,
} from "../youtube_api";

function setPath(path: string) {
  window.history.pushState({}, "", path);
}

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  setPath("/");
});

afterEach(() => {
  vi.restoreAllMocks();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  setPath("/");
});

describe("getPublishedAfter", () => {
  const now = new Date("2024-06-15T12:00:00.000Z");

  test("today returns now minus 1 day", () => {
    const expected = new Date(now);
    expected.setDate(expected.getDate() - 1);
    expect(getPublishedAfter("today", now)).toBe(expected.toISOString());
  });

  test("week returns now minus 7 days", () => {
    const expected = new Date(now);
    expected.setDate(expected.getDate() - 7);
    expect(getPublishedAfter("week", now)).toBe(expected.toISOString());
  });

  test("month returns now minus 1 month", () => {
    const expected = new Date(now);
    expected.setMonth(expected.getMonth() - 1);
    expect(getPublishedAfter("month", now)).toBe(expected.toISOString());
  });

  test("year returns now minus 1 year", () => {
    const expected = new Date(now);
    expected.setFullYear(expected.getFullYear() - 1);
    expect(getPublishedAfter("year", now)).toBe(expected.toISOString());
  });

  test("all returns null", () => {
    expect(getPublishedAfter("all")).toBeNull();
  });
});

describe("getApiKey", () => {
  test("resolves the stored API key", async () => {
    globalThis.chrome = {
      storage: {
        sync: {
          get: vi.fn((_keys, cb) => cb({ [API_KEY_STORAGE_KEY]: "my-api-key" })),
        },
      },
    } as any;

    await expect(getApiKey()).resolves.toBe("my-api-key");
  });

  test("resolves undefined when nothing is stored", async () => {
    globalThis.chrome = {
      storage: {
        sync: {
          get: vi.fn((_keys, cb) => cb({})),
        },
      },
    } as any;

    await expect(getApiKey()).resolves.toBeUndefined();
  });
});

describe("getVideoKindFromUrl", () => {
  test("/@SomeChannel/videos -> videos", () => {
    setPath("/@SomeChannel/videos");
    expect(getVideoKindFromUrl()).toBe("videos");
  });

  test("/@SomeChannel/shorts -> shorts", () => {
    setPath("/@SomeChannel/shorts");
    expect(getVideoKindFromUrl()).toBe("shorts");
  });

  test("/@SomeChannel/shorts/abc123 -> shorts", () => {
    setPath("/@SomeChannel/shorts/abc123");
    expect(getVideoKindFromUrl()).toBe("shorts");
  });

  test("/@SomeChannel (no suffix) -> videos", () => {
    setPath("/@SomeChannel");
    expect(getVideoKindFromUrl()).toBe("videos");
  });

  test("/channel/UCxxxxxxxxxxxx/shorts -> shorts", () => {
    setPath("/channel/UCxxxxxxxxxxxx/shorts");
    expect(getVideoKindFromUrl()).toBe("shorts");
  });
});

describe("resolveChannelId", () => {
  test("/channel/UC... path returns the channel ID directly without fetching", async () => {
    setPath("/channel/UCdirectChannel123");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(resolveChannelId("api-key")).resolves.toBe("UCdirectChannel123");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("/@Handle path resolves via channels.list forHandle lookup", async () => {
    setPath("/@HandleOne/videos");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: "UCresolvedHandleOne" }] }), {
        status: 200,
      })
    );

    await expect(resolveChannelId("api-key")).resolves.toBe("UCresolvedHandleOne");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("forHandle=");
    expect(calledUrl).toContain(encodeURIComponent("@HandleOne"));
  });

  test("caches the resolved channel ID for the same @handle path", async () => {
    setPath("/@HandleTwo/videos");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: "UCresolvedHandleTwo" }] }), {
        status: 200,
      })
    );

    await expect(resolveChannelId("api-key")).resolves.toBe("UCresolvedHandleTwo");
    await expect(resolveChannelId("api-key")).resolves.toBe("UCresolvedHandleTwo");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("/c/SomeName path resolves via channels.list forUsername lookup", async () => {
    setPath("/c/SomeLegacyName");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: "UCresolvedSomeLegacyName" }] }), {
        status: 200,
      })
    );

    await expect(resolveChannelId("api-key")).resolves.toBe("UCresolvedSomeLegacyName");

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("forUsername=");
    expect(calledUrl).toContain("SomeLegacyName");
  });

  test("/user/SomeName path resolves via channels.list forUsername lookup", async () => {
    setPath("/user/AnotherLegacyName");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: "UCresolvedAnotherLegacyName" }] }), {
        status: 200,
      })
    );

    await expect(resolveChannelId("api-key")).resolves.toBe("UCresolvedAnotherLegacyName");

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("forUsername=");
    expect(calledUrl).toContain("AnotherLegacyName");
  });

  test("falls back to canonical link when URL doesn't identify the channel", async () => {
    setPath("/watch");
    document.head.innerHTML =
      '<link rel="canonical" href="https://www.youtube.com/channel/UCfallback1234">';
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(resolveChannelId("api-key")).resolves.toBe("UCfallback1234");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("falls back to scraping externalId from a script tag when no canonical link", async () => {
    setPath("/");
    const script = document.createElement("script");
    script.textContent = 'window.foo = {"externalId":"UCfallback5678","other":"data"};';
    document.body.appendChild(script);

    await expect(resolveChannelId("api-key")).resolves.toBe("UCfallback5678");
  });

  test("resolves to null when neither URL nor page data identify the channel", async () => {
    setPath("/");
    await expect(resolveChannelId("api-key")).resolves.toBeNull();
  });

  test("resolves to null when channels.list returns no items", async () => {
    setPath("/@HandleEmpty/videos");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200 })
    );

    await expect(resolveChannelId("api-key")).resolves.toBeNull();
  });
});

describe("fetchPopularVideos", () => {
  function mockFetchWith(searchResponse: any, videosResponse?: any) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/search?")) {
        return new Response(JSON.stringify(searchResponse), { status: 200 });
      }
      if (url.includes("/videos?")) {
        return new Response(JSON.stringify(videosResponse ?? { items: [] }), { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
  }

  test("includes publishedAfter in the search URL when provided", async () => {
    const fetchSpy = mockFetchWith({ items: [] });

    await fetchPopularVideos("UCchannel", "api-key", "2024-01-01T00:00:00.000Z", "videos");

    const searchUrl = fetchSpy.mock.calls[0][0] as string;
    expect(searchUrl).toContain("publishedAfter=");
  });

  test("omits publishedAfter from the search URL when null", async () => {
    const fetchSpy = mockFetchWith({ items: [] });

    await fetchPopularVideos("UCchannel", "api-key", null, "videos");

    const searchUrl = fetchSpy.mock.calls[0][0] as string;
    expect(searchUrl).not.toContain("publishedAfter=");
  });

  test("maps fields correctly for a matching regular video", async () => {
    mockFetchWith(
      {
        items: [
          {
            id: { videoId: "vid1" },
            snippet: {
              title: "My Video",
              thumbnails: { medium: { url: "https://example.com/medium.jpg" } },
              publishedAt: "2024-03-01T00:00:00.000Z",
            },
          },
        ],
      },
      {
        items: [
          {
            id: "vid1",
            statistics: { viewCount: "12345" },
            contentDetails: { duration: "PT10M" },
          },
        ],
      }
    );

    const result = await fetchPopularVideos("UCchannel", "api-key", null, "videos");

    expect(result).toEqual([
      {
        videoId: "vid1",
        title: "My Video",
        thumbnailUrl: "https://example.com/medium.jpg",
        publishedAt: "2024-03-01T00:00:00.000Z",
        viewCount: 12345,
      },
    ]);
  });

  test("falls back to default thumbnail when medium thumbnail is absent", async () => {
    mockFetchWith(
      {
        items: [
          {
            id: { videoId: "vid1" },
            snippet: {
              title: "My Video",
              thumbnails: { default: { url: "https://example.com/default.jpg" } },
              publishedAt: "2024-03-01T00:00:00.000Z",
            },
          },
        ],
      },
      {
        items: [
          {
            id: "vid1",
            statistics: { viewCount: "1" },
            contentDetails: { duration: "PT10M" },
          },
        ],
      }
    );

    const result = await fetchPopularVideos("UCchannel", "api-key", null, "videos");

    expect(result[0].thumbnailUrl).toBe("https://example.com/default.jpg");
  });

  test("excludes a 3-minute (180s) video when videoKind is videos", async () => {
    mockFetchWith(
      {
        items: [
          {
            id: { videoId: "shortVid" },
            snippet: { title: "Short", publishedAt: "2024-01-01T00:00:00.000Z" },
          },
        ],
      },
      {
        items: [
          {
            id: "shortVid",
            statistics: { viewCount: "100" },
            contentDetails: { duration: "PT3M" },
          },
        ],
      }
    );

    const result = await fetchPopularVideos("UCchannel", "api-key", null, "videos");
    expect(result).toEqual([]);
  });

  test("includes a 3m4s (184s) video when videoKind is videos", async () => {
    mockFetchWith(
      {
        items: [
          {
            id: { videoId: "longVid" },
            snippet: { title: "Long", publishedAt: "2024-01-01T00:00:00.000Z" },
          },
        ],
      },
      {
        items: [
          {
            id: "longVid",
            statistics: { viewCount: "100" },
            contentDetails: { duration: "PT3M4S" },
          },
        ],
      }
    );

    const result = await fetchPopularVideos("UCchannel", "api-key", null, "videos");
    expect(result).toHaveLength(1);
    expect(result[0].videoId).toBe("longVid");
  });

  test("includes a 3-minute (180s) video when videoKind is shorts", async () => {
    mockFetchWith(
      {
        items: [
          {
            id: { videoId: "shortVid" },
            snippet: { title: "Short", publishedAt: "2024-01-01T00:00:00.000Z" },
          },
        ],
      },
      {
        items: [
          {
            id: "shortVid",
            statistics: { viewCount: "100" },
            contentDetails: { duration: "PT3M" },
          },
        ],
      }
    );

    const result = await fetchPopularVideos("UCchannel", "api-key", null, "shorts");
    expect(result).toHaveLength(1);
    expect(result[0].videoId).toBe("shortVid");
  });

  test("excludes a 3m4s (184s) video when videoKind is shorts", async () => {
    mockFetchWith(
      {
        items: [
          {
            id: { videoId: "longVid" },
            snippet: { title: "Long", publishedAt: "2024-01-01T00:00:00.000Z" },
          },
        ],
      },
      {
        items: [
          {
            id: "longVid",
            statistics: { viewCount: "100" },
            contentDetails: { duration: "PT3M4S" },
          },
        ],
      }
    );

    const result = await fetchPopularVideos("UCchannel", "api-key", null, "shorts");
    expect(result).toEqual([]);
  });

  test("a 3m3s (183s) video counts as a Short at the exact boundary", async () => {
    const baseSearch = {
      items: [
        {
          id: { videoId: "boundaryVid" },
          snippet: { title: "Boundary", publishedAt: "2024-01-01T00:00:00.000Z" },
        },
      ],
    };
    const baseVideos = {
      items: [
        {
          id: "boundaryVid",
          statistics: { viewCount: "100" },
          contentDetails: { duration: "PT3M3S" },
        },
      ],
    };

    mockFetchWith(baseSearch, baseVideos);
    const shortsResult = await fetchPopularVideos("UCchannel", "api-key", null, "shorts");
    expect(shortsResult).toHaveLength(1);
    expect(shortsResult[0].videoId).toBe("boundaryVid");

    vi.restoreAllMocks();
    mockFetchWith(baseSearch, baseVideos);
    const videosResult = await fetchPopularVideos("UCchannel", "api-key", null, "videos");
    expect(videosResult).toEqual([]);
  });

  test("a video missing from the statistics response is treated as a regular video", async () => {
    const search = {
      items: [
        {
          id: { videoId: "deletedVid" },
          snippet: { title: "Deleted", publishedAt: "2024-01-01T00:00:00.000Z" },
        },
      ],
    };
    const videos = { items: [] };

    mockFetchWith(search, videos);
    const videosResult = await fetchPopularVideos("UCchannel", "api-key", null, "videos");
    expect(videosResult).toHaveLength(1);
    expect(videosResult[0].videoId).toBe("deletedVid");
    expect(videosResult[0].viewCount).toBe(0);

    vi.restoreAllMocks();
    mockFetchWith(search, videos);
    const shortsResult = await fetchPopularVideos("UCchannel", "api-key", null, "shorts");
    expect(shortsResult).toEqual([]);
  });

  test("returns [] without calling the videos endpoint when search has no items", async () => {
    const fetchSpy = mockFetchWith({ items: [] });

    const result = await fetchPopularVideos("UCchannel", "api-key", null, "videos");

    expect(result).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/search?");
  });

  test("throws YouTubeApiError with status and message from a JSON error body", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/search?")) {
        return new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
          status: 403,
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const promise = fetchPopularVideos("UCchannel", "api-key", null, "videos");

    await expect(promise).rejects.toBeInstanceOf(YouTubeApiError);
    await expect(promise).rejects.toMatchObject({ status: 403, message: "quota exceeded" });
  });

  test("falls back to a generic message when the error body isn't JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/search?")) {
        return new Response("not json", { status: 500 });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const promise = fetchPopularVideos("UCchannel", "api-key", null, "videos");

    await expect(promise).rejects.toBeInstanceOf(YouTubeApiError);
    await expect(promise).rejects.toMatchObject({
      status: 500,
      message: "Request failed with status 500",
    });
  });
});
