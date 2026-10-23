import ratings from "./other-track-ratings-data.js";
import { prepareTrack, releaseTrackTree } from "./more-track-performance.js";

const byThumbnail = new Map(Object.entries(ratings).map(([url, rating]) =>
  [new URL(url, document.baseURI).pathname, rating]));
const cardRatings = new WeakMap();
const dividerLayouts = new WeakMap();
const pendingGroups = new Set();
let refreshQueued = false;
let dialog;

const style = document.createElement("style");
style.textContent = `
  .track-selection-ui .other-track-title { height: 60px; box-sizing: border-box; }
  .track-selection-ui .other-track-meta {
    /* Account for the launch button's margin and the font's extra descender space. */
    position: absolute; top: 37px; left: 10px; right: 10px; height: 31px;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    pointer-events: none;
  }
  .track-selection-ui .other-track-rating {
    font: 16px/18px "Segoe UI Symbol", sans-serif; color: #ffe28a;
    letter-spacing: 0; white-space: nowrap;
  }
  .track-selection-ui .tracks-container .track .track-info-button {
    display: grid; place-items: center; flex: 0 0 20px;
    width: 20px; height: 24px; margin: 0; padding: 0; border: 0; background: transparent;
    color: #929ab3; font-size: 0;
    cursor: pointer; pointer-events: auto; border-radius: 0;
  }
  .track-info-icon {
    display: block; width: 12px; height: 12px; background-color: currentColor;
    mask: url("images/track_rating_info.svg") center / contain no-repeat;
  }
  .track-selection-ui .tracks-container .track .track-info-button:hover,
  .track-selection-ui .tracks-container .track .track-info-button:focus-visible { color: var(--text-color); }
  .track-info-button:focus-visible { outline: 1px solid currentColor; outline-offset: 1px; }
  .track-selection-ui .more-rank-divider {
    display: flex; align-items: center; gap: 12px; width: auto;
    margin: 18px 8px 10px; padding: 0; clear: both;
    grid-column: 1 / -1; flex-basis: 100%;
    color: #e5eaff; font: italic 24px/30px ForcedSquare, Arial, sans-serif;
    letter-spacing: 0;
  }
  .more-rank-divider::after { content: ""; flex: 1; border-top: 1px solid #697797; }
  .track-info-dialog {
    box-sizing: border-box; width: 400px; max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px); overflow: auto; padding: 10px;
    background: var(--surface-color); color: var(--text-color); border: 0;
    border-radius: 0; font: italic 20px/1.3 ForcedSquare, Arial, sans-serif; letter-spacing: 0;
  }
  .track-info-dialog::backdrop { background: rgba(20, 20, 30, 0.5); }
  .track-info-dialog h2 {
    font: italic 26px/1.1 ForcedSquare, Arial, sans-serif;
    margin: 0; padding: 4px 32px 12px 4px; overflow-wrap: anywhere; text-align: center;
  }
  .track-info-dialog dl {
    display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 12px;
    margin: 0; padding: 12px; background: var(--surface-secondary-color);
  }
  .track-info-dialog dt { opacity: 0.65; }
  .track-info-dialog dd { margin: 0; overflow-wrap: anywhere; }
  .track-info-dialog dl, .track-info-dialog dt, .track-info-dialog dd { font: inherit; letter-spacing: 0; }
  .track-info-close {
    display: grid; place-items: center;
    position: absolute; right: 10px; top: 10px; width: 28px; height: 28px;
    border: 0; padding: 0; background: var(--button-color); color: inherit;
    font: normal 22px/1 "Segoe UI Symbol", sans-serif; cursor: pointer;
    clip-path: polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%);
  }
  .track-info-close:hover, .track-info-close:focus-visible { background: var(--button-hover-color); }
`;
document.head.appendChild(style);

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function openInfo(rating) {
  if (!dialog) {
    dialog = element("dialog", undefined, "track-info-dialog");
    dialog.setAttribute("aria-labelledby", "track-info-title");
    dialog.addEventListener("keydown", event => event.stopPropagation());
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    document.body.appendChild(dialog);
  }
  const close = element("button", "\u00d7", "track-info-close");
  close.type = "button";
  close.title = "Close";
  close.setAttribute("aria-label", "Close track info");
  close.addEventListener("click", () => dialog.close());
  const heading = element("h2", rating.name || "Track info");
  heading.id = "track-info-title";
  const details = element("dl");
  const row = (label, value) => {
    details.appendChild(element("dt", label));
    details.appendChild(element("dd", value));
  };
  row("Rating", rating.stars ? `${"\u2605".repeat(rating.stars)} ${rating.quality}` : "Unrated");
  const date = rating.uploadedAt && new Date(rating.uploadedAt);
  row("Uploaded", date && Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Unknown");
  row("Author", rating.author || "Unknown");
  const tags = (rating.tags || []).filter(tag => tag !== rating.quality);
  if (tags.length) row("Tags", tags.join(", "));
  if (Number.isInteger(rating.parts)) row("Blocks", rating.parts.toLocaleString());
  dialog.replaceChildren(close, heading, details);
  if (!dialog.open) dialog.showModal();
}

function refreshDividers(group) {
  const layout = [];
  let previous;
  for (const track of [...group.children]) {
    const rating = cardRatings.get(track);
    if (!rating || track.hidden || track.style.display === "none") continue;
    const rank = rating.isOriginal ? "Original Tracks" : rating.quality || "Unrated";
    if (rank !== previous) {
      layout.push({ track, rank });
      previous = rank;
    }
  }
  const old = dividerLayouts.get(group);
  if (old?.length === layout.length && old.every((item, index) => item.track === layout[index].track &&
    item.rank === layout[index].rank && item.divider.parentElement === group && item.divider.nextElementSibling === item.track)) return;
  dividerLayouts.set(group, layout);
  for (const node of [...group.children]) if (node.classList.contains("more-rank-divider")) node.remove();
  for (const item of layout) {
    item.divider = element("h3", item.rank, "more-rank-divider");
    group.insertBefore(item.divider, item.track);
  }
}

function queueGroup(group) {
  if (!group?.matches(".community-track-group")) return;
  pendingGroups.add(group);
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(() => {
    refreshQueued = false;
    for (const node of pendingGroups) refreshDividers(node);
    pendingGroups.clear();
  });
}

function decorate(track) {
  const existing = cardRatings.get(track);
  if (existing) {
    prepareTrack(track, existing.name || track.querySelector(".track-title")?.textContent);
    queueGroup(track.parentElement);
    return;
  }
  const thumbnail = track.querySelector("img.thumbnail");
  const title = track.querySelector(".track-title");
  if (!thumbnail || !title || title.classList.contains("other-track-title")) return;
  const rating = byThumbnail.get(new URL(thumbnail.src, document.baseURI).pathname);
  if (!rating) return;
  cardRatings.set(track, rating);
  title.classList.add("other-track-title");
  // Keep the info control outside the game's track-launch button.
  const meta = element("div", undefined, "other-track-meta");
  if (Number.isInteger(rating.stars) && rating.stars >= 1 && rating.stars <= 5) {
    const badge = element("span", "\u2605".repeat(rating.stars), "other-track-rating");
    badge.title = rating.quality;
    badge.setAttribute("role", "img");
    badge.setAttribute("aria-label", `${rating.quality}, ${rating.stars} ${rating.stars === 1 ? "star" : "stars"}`);
    meta.appendChild(badge);
  }
  const info = element("button", undefined, "track-info-button");
  info.type = "button";
  info.title = "Track info";
  info.setAttribute("aria-label", `Track info for ${rating.name || title.textContent}`);
  const icon = element("span", undefined, "track-info-icon");
  icon.setAttribute("aria-hidden", "true");
  info.appendChild(icon);
  info.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openInfo(rating);
  });
  meta.appendChild(info);
  track.appendChild(meta);
  prepareTrack(track, rating.name || title.textContent);
  queueGroup(track.parentElement);
}

function inspect(root) {
  if (!(root instanceof Element)) return;
  if (root.matches(".track")) decorate(root);
  for (const track of root.querySelectorAll(".track")) decorate(track);
  for (const button of root.querySelectorAll(".community-track-versions > button")) {
    const label = [...button.childNodes].find(node => node.nodeType === 3 && node.textContent.trim() === "Other");
    if (label) label.textContent = "More";
  }
}

new MutationObserver(records => {
  for (const record of records) {
    if (record.type === "attributes") {
      if (cardRatings.has(record.target) && record.attributeName !== "class") queueGroup(record.target.parentElement);
      continue;
    }
    for (const node of record.addedNodes) inspect(node);
    for (const node of record.removedNodes) if (!node.isConnected) releaseTrackTree(node);
    if ([...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && node.matches(".track"))) {
      queueGroup(record.target);
    }
  }
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
inspect(document.body);
