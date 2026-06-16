import { PopularVideo } from "./youtube_api";

// The YouTube Data API returns titles with HTML entities (e.g. &quot; for ").
// A textarea is the simplest way to decode them in a browser context.
function decodeHtml(str: string): string {
  const el = document.createElement("textarea");
  el.innerHTML = str;
  return el.value;
}

export function ensureResultsPanel(richGrid: Element): HTMLElement {
  let panel = richGrid.querySelector<HTMLElement>(".ytps-results");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "ytps-results";
    const header = richGrid.querySelector("#header");
    if (header) {
      header.insertAdjacentElement("afterend", panel);
    } else {
      richGrid.appendChild(panel);
    }
  }
  return panel;
}

export function removeResultsPanel(richGrid: Element): void {
  richGrid.querySelector(".ytps-results")?.remove();
}

export function renderStatus(panel: HTMLElement, message: string): void {
  panel.innerHTML = "";
  const status = document.createElement("div");
  status.className = "ytps-results-status";
  status.textContent = message;
  panel.appendChild(status);
}

export function renderMissingApiKeyStatus(panel: HTMLElement, message: string): void {
  panel.innerHTML = "";
  const status = document.createElement("div");
  status.className = "ytps-results-status";

  const text = document.createElement("div");
  text.textContent = message;
  status.appendChild(text);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "ytps-open-options-button";
  button.textContent = "Open extension settings";
  button.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_OPTIONS_PAGE" });
  });
  status.appendChild(button);

  panel.appendChild(status);
}

export function renderVideos(panel: HTMLElement, videos: PopularVideo[]): void {
  panel.innerHTML = "";
  videos.forEach((video) => panel.appendChild(buildVideoCard(video)));
}

// Adds more video cards to a panel that already has results, without
// disturbing the existing cards or (if present) the "Load more" button.
export function appendVideos(panel: HTMLElement, videos: PopularVideo[]): void {
  const loadMore = panel.querySelector(".ytps-load-more");
  const fragment = document.createDocumentFragment();
  videos.forEach((video) => fragment.appendChild(buildVideoCard(video)));

  if (loadMore) {
    panel.insertBefore(fragment, loadMore);
  } else {
    panel.appendChild(fragment);
  }
}

export function renderLoadMoreButton(panel: HTMLElement, onClick: () => void): void {
  removeLoadMoreButton(panel);

  const wrapper = document.createElement("div");
  wrapper.className = "ytps-load-more";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "ytps-load-more-button";
  button.textContent = "Load more";
  button.addEventListener("click", onClick);

  wrapper.appendChild(button);
  panel.appendChild(wrapper);
}

export function removeLoadMoreButton(panel: HTMLElement): void {
  panel.querySelector(".ytps-load-more")?.remove();
}

export function setLoadMoreButtonState(panel: HTMLElement, state: "loading" | "error"): void {
  const button = panel.querySelector<HTMLButtonElement>(".ytps-load-more-button");
  if (!button) return;

  if (state === "loading") {
    button.disabled = true;
    button.textContent = "Loading…";
  } else {
    button.disabled = false;
    button.textContent = "Couldn't load more — try again";
  }
}

function buildVideoCard(video: PopularVideo): HTMLElement {
  const card = document.createElement("a");
  card.className = "ytps-video-card";
  card.href = `/watch?v=${video.videoId}`;

  const thumb = document.createElement("img");
  thumb.className = "ytps-video-thumb";
  thumb.src = video.thumbnailUrl;
  thumb.loading = "lazy";
  thumb.alt = "";

  const info = document.createElement("div");
  info.className = "ytps-video-info";

  const title = document.createElement("div");
  title.className = "ytps-video-title";
  const decodedTitle = decodeHtml(video.title);
  title.textContent = decodedTitle;
  title.title = decodedTitle;

  const meta = document.createElement("div");
  meta.className = "ytps-video-meta";
  meta.textContent = `${formatViewCount(video.viewCount)} · ${formatRelativeDate(video.publishedAt)}`;

  info.appendChild(title);
  info.appendChild(meta);
  card.appendChild(thumb);
  card.appendChild(info);

  return card;
}

export function formatViewCount(count: number): string {
  if (count >= 1_000_000_000) return `${trimDecimal(count / 1_000_000_000)}B views`;
  if (count >= 1_000_000) return `${trimDecimal(count / 1_000_000)}M views`;
  if (count >= 1_000) return `${trimDecimal(count / 1_000)}K views`;
  return `${count} ${count === 1 ? "view" : "views"}`;
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

export function formatRelativeDate(iso: string): string {
  if (!iso) return "";

  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;

  if (diffDays < 365) {
    const diffMonths = Math.round(diffDays / 30.44);
    if (diffMonths >= 12) return "1 year ago";
    return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`;
  }

  const diffYears = Math.round(diffDays / 365.25);
  return `${diffYears} year${diffYears > 1 ? "s" : ""} ago`;
}
