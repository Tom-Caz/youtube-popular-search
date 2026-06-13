import { PopularVideo } from "./youtube_api";

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

export function renderVideos(panel: HTMLElement, videos: PopularVideo[]): void {
  panel.innerHTML = "";
  videos.forEach((video) => panel.appendChild(buildVideoCard(video)));
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
  title.textContent = video.title;
  title.title = video.title;

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
