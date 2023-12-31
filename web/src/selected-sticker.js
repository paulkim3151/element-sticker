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

export const StickerAPI = {
  getMyStickerIds: () => {
    return JSON.parse(window.localStorage.myStickerId || "[]");
  },

  addMySticker: (id) => {
    const myStickerId = StickerAPI.getMyStickerIds();
    if (myStickerId.includes(id)) {
      return false;
    }

    const newStickerId = [...myStickerId];
    newStickerId.push(id);
    window.localStorage.myStickerId = JSON.stringify(newStickerId);
    return newStickerId;
  },

  removeMySticker: (id) => {
    const myStickerId = StickerAPI.getMyStickerIds();
    if (!myStickerId.includes(id)) {
      return false;
    }

    const newStickerId = myStickerId.filter((myId) => myId !== id);
    window.localStorage.myStickerId = JSON.stringify(newStickerId);
    return newStickerId;
  },

  toggleMySticker: (id) => {
    const myStickerId = StickerAPI.getMyStickerIds();
    if (myStickerId.includes(id)) {
      return StickerAPI.removeMySticker(id);
    } else {
      return StickerAPI.addMySticker(id);
    }
  },
};
