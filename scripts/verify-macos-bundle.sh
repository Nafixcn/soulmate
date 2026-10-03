#!/bin/sh
set -eu

target="${1:?usage: verify-macos-bundle.sh <rust-target>}"
bundle_root="soulmate/src-tauri/target/$target/release/bundle"
app_path="$(find "$bundle_root/macos" -maxdepth 1 -name '*.app' -type d -print -quit)"

if [ -z "$app_path" ]; then
  echo "Release blocked: no application bundle found under $bundle_root/macos" >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$app_path"
xcrun stapler validate "$app_path"
spctl --assess --type execute --verbose=2 "$app_path"

echo "Verified signed and notarized bundle: $app_path"
