/* Phoenix click-to-load embed loader.
 *
 * The generator emits YouTube embeddings as thumbnail-first facades (see
 * build_youtube_embed_markdown): the video poster, a play affordance and a
 * noscript watch link, but no third-party player frame in the initial HTML.
 * This loader performs the only injection point.  A facade marked
 * data-consent-gate="1" additionally waits for the visitor's explicit consent
 * choice before loading; on facades without that marker the play click itself
 * is the load decision.  In both cases only the privacy-preserving
 * youtube-nocookie.com host is ever injected.
 *
 * The storage key and the event names are injected by the Stage 3 generator
 * from measurement_config, so this asset carries no key literal of its own and
 * cannot drift to a rival spelling.
 */
(function () {
  "use strict";
  var STORAGE_KEY = "phoenix-consent-v1";
  var GRANTED_EVENT = "phoenix-consent-granted";
  var REQUEST_EVENT = "phoenix-consent-request";
  var FACADE_SELECTOR = "[data-phoenix-embed]";
  var PLAY_ATTR = "data-phoenix-embed-play";
  var LOADED_ATTR = "data-phoenix-embed-loaded";
  var pending = [];

  function consentGranted() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "granted";
    } catch (err) {
      return false;
    }
  }

  function facadeFrom(node) {
    while (node && node !== document) {
      if (node.getAttribute && node.getAttribute("data-phoenix-embed")) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  function loadFacade(facade) {
    if (!facade || facade.getAttribute(LOADED_ATTR) === "1") {
      return;
    }
    var src = facade.getAttribute("data-embed-src") || "";
    // Only the privacy-preserving host is ever injected, whatever a page (or a
    // later mutation pass) puts in the attribute.
    if (src.indexOf("https://www.youtube-nocookie.com/embed/") !== 0) {
      return;
    }
    facade.setAttribute(LOADED_ATTR, "1");
    var play = facade.querySelector("[" + PLAY_ATTR + "]");
    if (play && play.parentNode) {
      play.parentNode.removeChild(play);
    }
    // The attribute template is a static literal, so no page data is ever
    // parsed as HTML; only the dynamic values go through setAttribute.
    facade.insertAdjacentHTML(
      "beforeend",
      '<iframe loading="lazy" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>'
    );
    var iframe = facade.querySelector("iframe");
    if (!iframe) {
      return;
    }
    iframe.setAttribute("src", src + "?autoplay=1");
    iframe.setAttribute(
      "title",
      facade.getAttribute("data-embed-title") || "YouTube video"
    );
  }

  function flushPending() {
    var queued = pending.slice();
    pending.length = 0;
    for (var index = 0; index < queued.length; index += 1) {
      loadFacade(queued[index]);
    }
  }

  function handleClick(event) {
    var facade = facadeFrom(event.target);
    if (!facade) {
      return;
    }
    // Only facades explicitly marked as consent-gated (sites that ship the
    // consent banner) wait for the stored choice.  On ungated facades the
    // visitor's play click is itself the decision to load YouTube.
    if (
      facade.getAttribute("data-consent-gate") !== "1" ||
      consentGranted()
    ) {
      loadFacade(facade);
      return;
    }
    // Without consent the third-party frame is never loaded; the click is
    // remembered and the consent choice is surfaced instead.
    if (pending.indexOf(facade) === -1) {
      pending.push(facade);
    }
    document.dispatchEvent(new CustomEvent(REQUEST_EVENT));
  }

  // Poster downgrade: maxresdefault does not exist for every video.  On the
  // first load error swap to the always-present hqdefault crop; if that also
  // fails, drop the img and let the frame's gradient backdrop carry the card.
  function handlePosterError(event) {
    var img = event.target;
    if (!img || img.tagName !== "IMG" || img.className !== "youtube-embed-poster") {
      return;
    }
    if (img.getAttribute("data-poster-downgraded") !== "1") {
      img.setAttribute("data-poster-downgraded", "1");
      var src = img.getAttribute("src") || "";
      var vid = src.match(/\/vi\/([A-Za-z0-9_-]{11})\//);
      if (vid) {
        img.src = "https://i.ytimg.com/vi/" + vid[1] + "/hqdefault.jpg";
        return;
      }
    }
    if (img.parentNode) {
      img.parentNode.removeChild(img);
    }
  }

  document.addEventListener("click", handleClick);
  document.addEventListener("error", handlePosterError, true);
  document.addEventListener(GRANTED_EVENT, flushPending);
})();
