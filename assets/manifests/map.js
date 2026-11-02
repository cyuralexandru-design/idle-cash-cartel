/* Hub map: hex hotspots as fractions of the 1536x1024 map image. r = hex half-width as a fraction of image width. */
window.G_MANIFEST = window.G_MANIFEST || {};
window.G_MANIFEST.map = {
  img: 'assets/bg/map_hex.jpg', w: 1536, h: 1024,
  hexes: [
    { biz: 'pub',             cx: 0.2715, cy: 0.1680, r: 0.0945 },
    { biz: 'bookmaker',       cx: 0.4330, cy: 0.1777, r: 0.0945 },
    { biz: 'garage',          cx: 0.5762, cy: 0.1855, r: 0.0945 },
    { biz: 'boxing_club',     cx: 0.1855, cy: 0.3535, r: 0.0945 },
    { biz: 'nightclub',       cx: 0.3561, cy: 0.3467, r: 0.0945 },
    { biz: 'restaurant',      cx: 0.5534, cy: 0.3857, r: 0.0945 },
    { biz: 'gentlemens_club', cx: 0.2656, cy: 0.5352, r: 0.0945 },
    { biz: 'car_dealership',  cx: 0.4622, cy: 0.5664, r: 0.0945 },
    { biz: 'hotel',           cx: 0.6589, cy: 0.5762, r: 0.0945 },
    { biz: 'casino',          cx: 0.5697, cy: 0.7471, r: 0.0945 }
  ],
  locked: [
    { cx: 0.7194, cy: 0.2393, r: 0.0945 },
    { cx: 0.2832, cy: 0.8301, r: 0.0945 },
    { cx: 0.7487, cy: 0.7568, r: 0.0945 }
  ],
  interior: function (biz, tier) { return 'assets/interiors/' + biz + '_L' + tier + '.webp'; },
  dialog: function (biz) { return 'assets/dialog/' + biz + '.jpg'; }
};
