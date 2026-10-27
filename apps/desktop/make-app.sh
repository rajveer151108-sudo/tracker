#!/bin/bash
# Builds the app and puts it in your Applications folder.
# Run it with:   bash make-app.sh
set -e
cd "$(dirname "$0")"

APP_NAME="Afterglow"        # <- the name of the app. Change it here if you pick a different one.
APP_BUNDLE_ID="com.glotrack.afterglow"

ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then ARCH="x64"; fi
ELECTRON_VERSION=$(node -p "require('./node_modules/electron/package.json').version")
BUILD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/afterglow-build.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT

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
  --app-bundle-id="$APP_BUNDLE_ID" \
  --icon=icon.icns \
  --extend-info=info-extra.plist \
  --overwrite --out="$BUILD_DIR" \
  --ignore='/dist($|/)' --ignore='/make-app\.sh$' --ignore='/icon\.png$'

PACKAGED_APP="$BUILD_DIR/$APP_NAME-darwin-$ARCH/$APP_NAME.app"

# Electron's base plist advertises permissions Afterglow never uses. Keeping only
# the two real capabilities prevents confusing macOS prompts.
for key in NSBluetoothAlwaysUsageDescription NSBluetoothPeripheralUsageDescription NSCameraUsageDescription NSMicrophoneUsageDescription; do
  /usr/libexec/PlistBuddy -c "Delete :$key" "$PACKAGED_APP/Contents/Info.plist" 2>/dev/null || true
done

echo "3/4  Installing to Applications..."
rm -rf "/Applications/$APP_NAME.app"
cp -R "$PACKAGED_APP" /Applications/

echo "4/4  Signing it so macOS will run it..."
codesign --force --deep --sign - "/Applications/$APP_NAME.app"

echo ""
echo "Done! Open $APP_NAME from your Applications folder (or Launchpad)."
echo "Drag it onto your Dock to keep it there."
