// maunium-stickerpicker - A fast and simple Matrix sticker picker widget.
// Copyright (C) 2020 Tulir Asokan
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
import { html, render, Component } from "../lib/htm/preact.js";
import { Spinner } from "./spinner.js";
import { SearchBox } from "./search-box.js";
import * as widgetAPI from "./widget-api.js";
import * as frequent from "./frequently-used.js";
import { StickerAPI } from "./selected-sticker.js";

// The base URL for fetching packs. The app will first fetch ${PACK_BASE_URL}/index.json,
// then ${PACK_BASE_URL}/${packFile} for each packFile in the packs object of the index.json file.
const PACKS_BASE_URL = "packs";

let INDEX = `${PACKS_BASE_URL}/index.json`;
const params = new URLSearchParams(document.location.search);
if (params.has("config")) {
  INDEX = params.get("config");
}
// This is updated from packs/index.json
let HOMESERVER_URL = "https://matrix-client.matrix.org";

const makeThumbnailURL = (mxc) =>
  `${HOMESERVER_URL}/_matrix/media/r0/thumbnail/${mxc.substr(
    6
  )}?height=128&width=128&method=scale`;

// We need to detect iOS webkit because it has a bug related to scrolling non-fixed divs
// This is also used to fix scrolling to sections on Element iOS
const isMobileSafari =
  navigator.userAgent.match(/(iPod|iPhone|iPad)/) &&
  navigator.userAgent.match(/AppleWebKit/);

const supportedThemes = ["light", "dark", "black"];

const defaultState = {
  myStickerIds: [],
  packs: [],
  filtering: {
    searchTerm: "",
    packs: [],
  },
};

class App extends Component {
  constructor(props) {
    super(props);
    this.defaultTheme = params.get("theme");
    this.state = {
      packs: defaultState.packs,
      loading: true,
      error: null,
      stickersPerRow: parseInt(localStorage.mauStickersPerRow || "4"),
      theme: localStorage.mauStickerThemeOverride || this.defaultTheme,
      frequentlyUsed: {
        id: "frequently-used",
        title: "최근 사용한 스티커",
        stickerIDs: frequent.get(),
        stickers: [],
      },
      myStickerIds: StickerAPI.getMyStickerIds(),
      filtering: defaultState.filtering,
      settingPage: false,
    };
    if (!supportedThemes.includes(this.state.theme)) {
      this.state.theme = "light";
    }
    if (!supportedThemes.includes(this.defaultTheme)) {
      this.defaultTheme = "light";
    }
    this.stickersByID = new Map(
      JSON.parse(localStorage.mauFrequentlyUsedStickerCache || "[]")
    );
    this.state.frequentlyUsed.stickers = this._getStickersByID(
      this.state.frequentlyUsed.stickerIDs
    );
    this.imageObserver = null;
    this.packListRef = null;
    this.navRef = null;
    this.searchStickers = this.searchStickers.bind(this);
    this.sendSticker = this.sendSticker.bind(this);
    this.navScroll = this.navScroll.bind(this);
    this.reloadPacks = this.reloadPacks.bind(this);
    this.observeSectionIntersections =
      this.observeSectionIntersections.bind(this);
    this.observeImageIntersections = this.observeImageIntersections.bind(this);
  }

  _getStickersByID(ids) {
    return ids
      .map((id) => this.stickersByID.get(id))
      .filter((sticker) => !!sticker);
  }

  updateFrequentlyUsed() {
    const stickerIDs = frequent.get();
    const stickers = this._getStickersByID(stickerIDs);
    this.setState({
      frequentlyUsed: {
        ...this.state.frequentlyUsed,
        stickerIDs,
        stickers,
      },
    });
    localStorage.mauFrequentlyUsedStickerCache = JSON.stringify(
      stickers.map((sticker) => [sticker.id, sticker])
    );
  }

  addMySticker(id) {
    const newStickerIds = StickerAPI.addMySticker(id);
    if (!newStickerIds) {
      return;
    }

    this.setState({
      myStickerIds: newStickerIds,
    });
  }

  toggleMyStickerIds(id) {
    const newStickerIds = StickerAPI.toggleMySticker(id);
    this.setState({
      myStickerIds: newStickerIds,
    });
  }

  updateMyStickerIds(evt) {
    const checked = evt.currentTarget.checked;
    const packId = evt.currentTarget.getAttribute("data-sticker-id");

    let newStickerIds = undefined;
    if (checked) {
      newStickerIds = StickerAPI.addMySticker(packId);
    } else {
      newStickerIds = StickerAPI.removeMySticker(packId);
    }

    if (!newStickerIds) {
      return;
    }

    this.setState({
      myStickerIds: newStickerIds,
    });
  }

  searchStickers(e) {
    const sanitizeString = (s) => s.toLowerCase().trim();
    const searchTerm = sanitizeString(e.target.value);

    const allPacks = [this.state.frequentlyUsed, ...this.state.packs];
    const packsWithFilteredStickers = allPacks.map((pack) => ({
      ...pack,
      stickers: pack.stickers.filter(
        (sticker) =>
          sanitizeString(sticker.body).includes(searchTerm) ||
          sanitizeString(sticker.id).includes(searchTerm)
      ),
    }));

    this.setState({
      filtering: {
        ...this.state.filtering,
        searchTerm,
        packs: packsWithFilteredStickers.filter(
          ({ stickers }) => !!stickers.length
        ),
      },
    });
  }

  setStickersPerRow(val) {
    localStorage.mauStickersPerRow = val;
    document.documentElement.style.setProperty(
      "--stickers-per-row",
      localStorage.mauStickersPerRow
    );
    this.setState({
      stickersPerRow: val,
    });
    this.packListRef.scrollTop = this.packListRef.scrollHeight;
  }

  setTheme(theme) {
    if (theme === "default") {
      delete localStorage.mauStickerThemeOverride;
      this.setState({ theme: this.defaultTheme });
    } else {
      localStorage.mauStickerThemeOverride = theme;
      this.setState({ theme: theme });
    }
  }

  reloadPacks() {
    this.imageObserver.disconnect();
    this.sectionObserver.disconnect();
    this.setState({
      packs: defaultState.packs,
      filtering: defaultState.filtering,
    });
    this._loadPacks(true);
  }

  _loadPacks(disableCache = false) {
    const cache = disableCache ? "no-cache" : undefined;
    fetch(INDEX, { cache }).then(
      async (indexRes) => {
        if (indexRes.status >= 400) {
          this.setState({
            loading: false,
            error: indexRes.status !== 404 ? indexRes.statusText : null,
          });
          return;
        }
        const indexData = await indexRes.json();
        HOMESERVER_URL = indexData.homeserver_url || HOMESERVER_URL;
        // TODO only load pack metadata when scrolled into view?
        for (const packFile of indexData.packs) {
          let packRes;
          if (
            packFile.startsWith("https://") ||
            packFile.startsWith("http://")
          ) {
            packRes = await fetch(packFile, { cache });
          } else {
            packRes = await fetch(`${PACKS_BASE_URL}/${packFile}`, { cache });
          }
          const packData = await packRes.json();
          for (const sticker of packData.stickers) {
            this.stickersByID.set(sticker.id, sticker);
          }
          this.setState({
            packs: [...this.state.packs, packData],
            loading: false,
          });
        }
        this.updateFrequentlyUsed();
      },
      (error) => this.setState({ loading: false, error })
    );
  }

  componentDidMount() {
    document.documentElement.style.setProperty(
      "--stickers-per-row",
      this.state.stickersPerRow.toString()
    );
    this._loadPacks();
    this.imageObserver = new IntersectionObserver(
      this.observeImageIntersections,
      {
        rootMargin: "100px",
      }
    );
    this.sectionObserver = new IntersectionObserver(
      this.observeSectionIntersections
    );
  }

  observeImageIntersections(intersections) {
    for (const entry of intersections) {
      const img = entry.target.children.item(0);
      if (entry.isIntersecting) {
        img.setAttribute("src", img.getAttribute("data-src"));
        img.classList.add("visible");
      } else {
        img.removeAttribute("src");
        img.classList.remove("visible");
      }
    }
  }

  observeSectionIntersections(intersections) {
    const navWidth = this.navRef.getBoundingClientRect().width;
    let minX = 0,
      maxX = navWidth;
    let minXElem = null;
    let maxXElem = null;
    for (const entry of intersections) {
      const packID = entry.target.getAttribute("data-pack-id");
      const navElement = document.getElementById(`nav-${packID}`);
      if (!navElement) {
        return;
      }

      if (entry.isIntersecting) {
        navElement.classList.add("visible");
        const bb = navElement.getBoundingClientRect();
        if (bb.x < minX) {
          minX = bb.x;
          minXElem = navElement;
        } else if (bb.right > maxX) {
          maxX = bb.right;
          maxXElem = navElement;
        }
      } else {
        navElement.classList.remove("visible");
      }
    }
    if (minXElem !== null) {
      minXElem.scrollIntoView({ inline: "start" });
    } else if (maxXElem !== null) {
      maxXElem.scrollIntoView({ inline: "end" });
    }
  }

  componentDidUpdate() {
    if (this.packListRef === null) {
      return;
    }
    for (const elem of this.packListRef.getElementsByClassName("sticker")) {
      this.imageObserver.observe(elem);
    }
    for (const elem of this.packListRef.children) {
      this.sectionObserver.observe(elem);
    }
  }

  componentWillUnmount() {
    this.imageObserver.disconnect();
    this.sectionObserver.disconnect();
  }

  sendSticker(evt) {
    const id = evt.currentTarget.getAttribute("data-sticker-id");
    const sticker = this.stickersByID.get(id);
    frequent.add(id);
    this.updateFrequentlyUsed();
    widgetAPI.sendSticker(sticker);
  }

  navScroll(evt) {
    this.navRef.scrollLeft += evt.deltaY;
  }

  render() {
    const theme = `theme-${this.state.theme}`;
    const filterActive = !!this.state.filtering.searchTerm;
    const packs = filterActive
      ? this.state.filtering.packs
      : [this.state.frequentlyUsed, ...this.state.packs];

    if (this.state.loading) {
      return html`<main class="spinner ${theme}">
        <${Spinner} size=${80} green />
      </main>`;
    } else if (this.state.error) {
      return html`<main class="error ${theme}">
        <h1>Failed to load packs</h1>
        <p>${this.state.error}</p>
      </main>`;
    } else if (this.state.packs.length === 0) {
      return html`<main class="empty ${theme}">
        <h1>No packs found 😿</h1>
      </main>`;
    }

    if (this.state.settingPage) {
      return html`<main class="has-content ${theme}">
        <nav class="setting-title">
          <a
            title="설정"
            onClick=${() => this.setState({ settingPage: false })}
          >
            <div class="sticker">
              <span class="icon icon-back" />
            </div>
          </a>
        </nav>

        <div
          class="pack-list ${isMobileSafari ? "ios-safari-hack" : ""}"
          ref=${(elem) => (this.packListRef = elem)}
        >
          <section class="stickerpack">
            <div class="settings-list">
              <button onClick=${this.reloadPacks}>스티커 팩 새로고침</button>
              <div>
                <label for="theme">Theme: </label>
                <select
                  name="theme"
                  id="theme"
                  onChange=${(evt) => this.setTheme(evt.target.value)}
                >
                  <option value="default">Default</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="black">Black</option>
                </select>
              </div>
            </div>
          </section>
          <section class="stickerpack">
            <h1>스티커 팩 선택</h1>
            <div class="sticker-list">
              ${packs.map((pack) => {
                if (pack.id === "frequently-used") {
                  return;
                }
                return html`<div class="sticker-select">
                  <${Sticker}
                    key=${pack.stickers[0].id}
                    content=${pack.stickers[0]}
                    send=${() => this.toggleMyStickerIds(pack.id)}
                  />
                  <input
                    type="checkbox"
                    checked=${this.state.myStickerIds.includes(pack.id)}
                  />
                </div>`;
              })}
            </div>
          </section>
        </div>
        <${StickerSetting} app=${this} />
      </main> `;
    }

    return html`<main class="has-content ${theme}">
      <nav onWheel=${this.navScroll} ref=${(elem) => (this.navRef = elem)}>
        <a
          title="설정"
          onClick=${() =>
            this.setState({ settingPage: !this.state.settingPage })}
        >
          <div class="sticker">
            <span class="icon icon-settings" />
          </div>
        </a>
        <${NavBarItem}
          pack=${this.state.frequentlyUsed}
          iconOverride="recent"
        />
        ${this.state.packs
          .filter((pack) => this.state.myStickerIds.includes(pack.id))
          .map(
            (pack) =>
              html`<${NavBarItem}
                id=${pack.id}
                pack=${pack}
                change=${this.updateMyStickerIds.bind(this)}
                myStickerIds=${this.state.myStickerIds}
                addMySticker=${this.addMySticker.bind(this)}
              />`
          )}
      </nav>
      <div
        class="pack-list ${isMobileSafari ? "ios-safari-hack" : ""}"
        ref=${(elem) => (this.packListRef = elem)}
      >
        ${filterActive && packs.length === 0
          ? html`<div class="search-empty">
              <h1>No stickers match your search</h1>
            </div>`
          : null}
        ${this.state.myStickerIds.length === 0
          ? html`<div class="no-sticker-pack">
              <h1>
                <span>선택된 스티커 팩이 없습니다. </span>
                <span
                  ><span class="icon icon-settings icon-text" />버튼을 눌러서 </span>
                  <span>스티커를 선택해주세요.</span
                >
              </h1>
            </div>`
          : packs.map(
              (pack) =>
                html`<${Pack}
                  id=${pack.id}
                  pack=${pack}
                  send=${this.sendSticker}
                  enabled=${pack.id === "frequently-used" ||
                  pack.id === "settings" ||
                  this.state.myStickerIds.includes(pack.id)}
                />`
            )}
      </div>
      <${StickerSetting} app=${this} />
    </main>`;
  }
}

// By default we just let the browser handle scrolling to sections, but webviews on Element iOS
// open the link in the browser instead of just scrolling there, so we need to scroll manually:
const scrollToSection = (evt, id) => {
  const pack = document.getElementById(`pack-${id}`);
  pack.scrollIntoView({ block: "start", behavior: "instant" });
  evt.preventDefault();
};

const NavBarItem = ({
  pack,
  iconOverride = null,
  change,
  myStickerIds,
  addMySticker,
}) => {
  const handleItemClicked = (evt) => {
    if (isMobileSafari) {
      scrollToSection(evt, pack.id);
    }
  };
  return html`
    <a
      href="#pack-${pack.id}"
      id="nav-${pack.id}"
      data-pack-id=${pack.id}
      title=${pack.title}
      onClick=${handleItemClicked}
    >
      <div class="sticker">
        ${iconOverride
          ? html` <span class="icon icon-${iconOverride}" /> `
          : html`
              <img
                src=${makeThumbnailURL(pack.stickers[0].url)}
                alt=${pack.stickers[0].body}
                class="visible"
              />
            `}
      </div>
    </a>
  `;
};

const Pack = ({ pack, send, enabled }) => html`
  <section
    class="stickerpack ${enabled ? "" : "disabled"}"
    id="pack-${pack.id}"
    data-pack-id=${pack.id}
  >
    <h1>${pack.title}</h1>
    <div class="sticker-list">
      ${pack.stickers.map(
        (sticker) => html`
          <${Sticker} key=${sticker.id} content=${sticker} send=${send} />
        `
      )}
    </div>
  </section>
`;

const Sticker = ({ content, send }) => html`
  <div class="sticker" onClick=${send} data-sticker-id=${content.id}>
    <img
      data-src=${makeThumbnailURL(content.url)}
      alt=${content.body}
      title=${content.body}
    />
  </div>
`;

const StickerSetting = ({ app }) => html`<div class="sticker-setting">
  <label for="stickers-per-row"
    >한 줄에 표시될 스티커 갯수: ${app.state.stickersPerRow}</label
  >
  <input
    type="range"
    min="2"
    max="10"
    id="stickers-per-row"
    id="stickers-per-row"
    value=${app.state.stickersPerRow}
    onInput=${(evt) => app.setStickersPerRow(evt.target.value)}
  />
</div>`;

render(html`<${App} />`, document.body);
