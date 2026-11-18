#!/usr/bin/env bash
# Rigenera le texture della Terra in public/textures/ (serve ImageMagick).
#
# Sorgenti: immagini NASA di pubblico dominio (Blue Marble, Black Marble/City
# Lights, nuvole, topografia, maschera degli oceani), distribuite dentro il
# pacchetto npm "three-globe" nella cartella example/.
#
# Uso:  bash scripts/prepare-textures.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/textures"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cd "$TMP"
npm pack three-globe --silent >/dev/null
tar xzf three-globe-*.tgz
SRC="$TMP/package/example"
mkdir -p "$OUT"

# Giorno
convert "$SRC/img/earth-blue-marble.jpg" -quality 88 -strip "$OUT/earth_day_4k.jpg"
convert "$SRC/img/earth-blue-marble.jpg" -resize 2048x1024 -quality 86 -strip "$OUT/earth_day_2k.jpg"
# Notte (luci delle città)
convert "$SRC/img/earth-night.jpg" -quality 88 -strip "$OUT/earth_night_4k.jpg"
convert "$SRC/img/earth-night.jpg" -resize 2048x1024 -quality 86 -strip "$OUT/earth_night_2k.jpg"
# Nuvole: nel PNG originale sono nel canale alpha
convert "$SRC/clouds/clouds.png" -alpha extract -colorspace Gray -quality 85 -strip "$OUT/earth_clouds_4k.jpg"
convert "$SRC/clouds/clouds.png" -alpha extract -colorspace Gray -resize 2048x1024 -quality 85 -strip "$OUT/earth_clouds_2k.jpg"
# Rilievo (canale R) + maschera degli oceani (canale G) in una sola texture
convert "$SRC/img/earth-topology.png" -colorspace Gray -resize 2048x1024! bump.png
convert "$SRC/img/earth-water.png" -colorspace Gray -resize 2048x1024! water.png
convert bump.png water.png -size 2048x1024 xc:black -combine -quality 92 -strip "$OUT/earth_relief_2k.jpg"

echo "Texture pronte in $OUT"
