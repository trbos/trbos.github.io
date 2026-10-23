const cards = new WeakMap();
const containers = new WeakMap();

const style = document.createElement("style");
style.textContent = `
  .track-selection-ui .tracks-container .track.more-track-virtual {
    width: 236px; height: 288px; vertical-align: top;
  }
  .track-selection-ui .track.more-track-offscreen > * { display: none; }
  @media (pointer: coarse) {
    .track-selection-ui .track.more-track-virtual > .button > .thumbnail {
      -webkit-filter: none; filter: none; transition: none;
    }
  }
`;
document.head.appendChild(style);

function showCard(track, visible, eagerLoad = true) {
  const state = cards.get(track);
  if (!state || state.visible === visible || (!visible && track.contains(document.activeElement))) return;
  state.visible = visible;
  track.classList.toggle("more-track-offscreen", !visible);
  if (state.thumbnail && state.thumbnailSource !== null) {
    if (visible) {
      state.thumbnail.loading = eagerLoad ? "eager" : state.thumbnailLoading;
      state.thumbnail.setAttribute("src", state.thumbnailSource);
    } else {
      // Allow offscreen images to release decoded buffers instead of only hiding their pixels.
      state.thumbnail.removeAttribute("src");
    }
  }
  if (visible) {
    track.removeAttribute("tabindex");
    track.removeAttribute("role");
    track.removeAttribute("aria-label");
  } else {
    // A keyboard focus target reveals the same launch button as scrolling does.
    track.tabIndex = 0;
    track.setAttribute("role", "button");
    track.setAttribute("aria-label", state.name);
  }
}

export function prepareTrack(track, name) {
  if (typeof IntersectionObserver !== "function") return;
  const container = track.closest(".tracks-container");
  const existing = cards.get(track);
  if (existing?.container === container) return;
  if (existing) releaseTrack(track);
  if (!container) return;
  let controller = containers.get(container);
  if (!controller) {
    controller = { count: 0, observer: new IntersectionObserver(entries => {
      for (const entry of entries) {
        const state = cards.get(entry.target);
        if (!state || state.controller !== controller) continue;
        state.intersecting = entry.isIntersecting;
        showCard(entry.target, entry.isIntersecting);
      }
    }, { root: container, rootMargin: "300px 0px" }) };
    containers.set(container, controller);
  }
  const thumbnail = track.querySelector("img.thumbnail");
  const state = { container, controller, name, visible: true, intersecting: false, thumbnail,
    thumbnailSource: thumbnail?.getAttribute("src") ?? null, thumbnailLoading: thumbnail?.loading };
  cards.set(track, state);
  controller.count++;
  track.classList.add("more-track-virtual");
  if (thumbnail) thumbnail.decoding = "async";
  const focus = () => {
    showCard(track, true);
    if (document.activeElement === track) track.querySelector("button.button")?.focus({ preventScroll: true });
  };
  const blur = () => queueMicrotask(() => {
    if (cards.get(track) === state && !state.intersecting) showCard(track, false);
  });
  const activate = event => {
    if (event.target !== track || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    event.stopPropagation();
    showCard(track, true);
    track.querySelector("button.button")?.click();
  };
  Object.assign(state, { focus, blur, activate });
  track.addEventListener("focusin", focus);
  track.addEventListener("focusout", blur);
  track.addEventListener("keydown", activate);
  showCard(track, false);
  controller.observer.observe(track);
}

function releaseTrack(track) {
  const state = cards.get(track);
  if (!state) return;
  showCard(track, true, false);
  if (state.thumbnail) state.thumbnail.loading = state.thumbnailLoading;
  track.classList.remove("more-track-virtual");
  track.removeEventListener("focusin", state.focus);
  track.removeEventListener("focusout", state.blur);
  track.removeEventListener("keydown", state.activate);
  state.controller.observer.unobserve(track);
  if (--state.controller.count === 0) {
    state.controller.observer.disconnect();
    containers.delete(state.container);
  }
  cards.delete(track);
}

export function releaseTrackTree(root) {
  if (!(root instanceof Element)) return;
  const removed = root.matches(".more-track-virtual") ? [root] : [];
  removed.push(...root.querySelectorAll(".more-track-virtual"));
  for (const track of removed) releaseTrack(track);
}
