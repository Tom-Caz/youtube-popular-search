export type TimeRangeId = "today" | "week" | "month" | "year" | "all";

export const API_KEY_STORAGE_KEY = "ytps_api_key";

export interface PopularVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  viewCount: number;
  publishedAt: string;
}

export class YouTubeApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "YouTubeApiError";
    this.status = status;
  }
}

const API_BASE = "https://www.googleapis.com/youtube/v3";

// Fallback for pages whose URL doesn't identify the channel: scrape the
// canonical link / embedded page data, which can be stale after a
// client-side navigation.
function getChannelIdFromPage(): string | null {
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const canonicalMatch = canonical?.href.match(/\/channel\/(UC[\w-]{10,})/);
  if (canonicalMatch) return canonicalMatch[1];

  for (const script of Array.from(document.scripts)) {
    const match = script.textContent?.match(/"externalId":"(UC[\w-]{10,})"/);
    if (match) return match[1];
  }

  return null;
}

type ChannelIdentifier =
  | { channelId: string }
  | { param: "forHandle" | "forUsername"; value: string };

// Unlike the page's embedded data, the URL is always up to date immediately
// after YouTube's SPA navigations, so prefer it for identifying the channel.
function getChannelIdentifierFromUrl(): ChannelIdentifier | null {
  const path = window.location.pathname;

  const channelMatch = path.match(/^\/channel\/(UC[\w-]{10,})/);
  if (channelMatch) return { channelId: channelMatch[1] };

  const handleMatch = path.match(/^\/(@[\w.-]+)/);
  if (handleMatch) return { param: "forHandle", value: handleMatch[1] };

  const userMatch = path.match(/^\/(?:c|user)\/([\w.-]+)/);
  if (userMatch) return { param: "forUsername", value: userMatch[1] };

  return null;
}

const channelIdCache = new Map<string, string>();

/**
 * Resolves the current page's channel ID. @handle and legacy /c//user/ URLs
 * require a Data API lookup, which is cached for the lifetime of the page.
 */
export async function resolveChannelId(apiKey: string): Promise<string | null> {
  const identifier = getChannelIdentifierFromUrl();
  if (!identifier) return getChannelIdFromPage();
  if ("channelId" in identifier) return identifier.channelId;

  const cacheKey = `${identifier.param}:${identifier.value}`;
  const cached = channelIdCache.get(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    part: "id",
    key: apiKey,
    [identifier.param]: identifier.value,
  });

  const data = await fetchJson(`${API_BASE}/channels?${params.toString()}`);
  const channelId = data.items?.[0]?.id as string | undefined;
  if (channelId) channelIdCache.set(cacheKey, channelId);
  return channelId ?? null;
}

export function getPublishedAfter(rangeId: TimeRangeId, now: Date = new Date()): string | null {
  if (rangeId === "all") return null;

  const date = new Date(now);
  switch (rangeId) {
    case "today":
      date.setDate(date.getDate() - 1);
      break;
    case "week":
      date.setDate(date.getDate() - 7);
      break;
    case "month":
      date.setMonth(date.getMonth() - 1);
      break;
    case "year":
      date.setFullYear(date.getFullYear() - 1);
      break;
  }
  return date.toISOString();
}

export function getApiKey(): Promise<string | undefined> {
  return new Promise((resolve) => {
    chrome.storage?.sync?.get([API_KEY_STORAGE_KEY], (result) => {
      resolve(result?.[API_KEY_STORAGE_KEY] as string | undefined);
    });
  });
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    let message = `Request failed with status ${response.status}`;
    try {
      const parsed = JSON.parse(body);
      message = parsed?.error?.message ?? message;
    } catch {
      // Body wasn't JSON; fall back to the generic message.
    }
    throw new YouTubeApiError(response.status, message);
  }
  return response.json();
}

/**
 * Finds the channel's most-viewed videos published after the given date,
 * using the YouTube Data API v3 (search.list ordered by viewCount, then
 * videos.list for the view counts to display).
 */
export async function fetchPopularVideos(
  channelId: string,
  apiKey: string,
  publishedAfter: string | null,
  maxResults = 24
): Promise<PopularVideo[]> {
  const searchParams = new URLSearchParams({
    part: "snippet",
    channelId,
    type: "video",
    order: "viewCount",
    maxResults: String(maxResults),
    key: apiKey,
  });
  if (publishedAfter) searchParams.set("publishedAfter", publishedAfter);

  const searchData = await fetchJson(`${API_BASE}/search?${searchParams.toString()}`);
  const items: any[] = searchData.items ?? [];
  const videoIds: string[] = items.map((item) => item.id?.videoId).filter(Boolean);
  if (videoIds.length === 0) return [];

  const statsParams = new URLSearchParams({
    part: "statistics",
    id: videoIds.join(","),
    key: apiKey,
  });
  const statsData = await fetchJson(`${API_BASE}/videos?${statsParams.toString()}`);
  const viewCounts = new Map<string, number>();
  for (const item of statsData.items ?? []) {
    viewCounts.set(item.id, Number(item.statistics?.viewCount ?? 0));
  }

  return items
    .filter((item) => item.id?.videoId)
    .map((item) => ({
      videoId: item.id.videoId as string,
      title: item.snippet?.title ?? "",
      thumbnailUrl:
        item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? "",
      publishedAt: item.snippet?.publishedAt ?? "",
      viewCount: viewCounts.get(item.id.videoId) ?? 0,
    }));
}
