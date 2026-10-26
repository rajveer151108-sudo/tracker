#!/bin/bash
# Builds the app and puts it in your Applications folder.
# Run it with:   bash make-app.sh
set -e
cd "$(dirname "$0")"

APP_NAME="Afterglow"        # <- the name of the app. Change it here if you pick a different one.

ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then ARCH="x64"; fi
ELECTRON_VERSION=$(node -p "require('./node_modules/electron/package.json').version")

echo "1/4  Making the icon..."
rm -rf icon.iconset && mkdir icon.iconset
for s in 16 32 128 256 512; do
  sips -z $s $s icon.png --out "icon.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) icon.png --out "icon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset

echo "2/4  Packaging the app (the first time this downloads a few hundred MB)..."
npx --yes @electron/packager . "$APP_NAME" \
  --platform=darwin --arch="$ARCH" --electron-version="$ELECTRON_VERSION" \
  --icon=icon.icns \
  --extend-info=info-extra.plist \
  --overwrite --out=dist \
  --ignore='/dist($|/)' --ignore='/make-app\.sh$' --ignore='/icon\.png$'

echo "3/4  Installing to Applications..."
rm -rf "/Applications/$APP_NAME.app"
cp -R "dist/$APP_NAME-darwin-$ARCH/$APP_NAME.app" /Applications/

echo "4/4  Signing it so macOS will run it..."
codesign --force --deep --sign - "/Applications/$APP_NAME.app"

echo ""
echo "Done! Open $APP_NAME from your Applications folder (or Launchpad)."
echo "Drag it onto your Dock to keep it there."
