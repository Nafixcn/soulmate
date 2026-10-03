#!/bin/sh
set -eu

target="${1:?usage: smoke-launch-macos-bundle.sh <rust-target>}"
bundle_root="soulmate/src-tauri/target/$target/release/bundle/macos"
app_path="$(find "$bundle_root" -maxdepth 1 -name '*.app' -type d -print -quit)"

if [ -z "$app_path" ]; then
  echo "Smoke test failed: no application bundle found under $bundle_root" >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$app_path"
executable="$(find "$app_path/Contents/MacOS" -maxdepth 1 -type f -perm +111 -print -quit)"
if [ -z "$executable" ]; then
  echo "Smoke test failed: application executable is missing" >&2
  exit 1
fi

"$executable" &
app_pid=$!
trap 'kill "$app_pid" 2>/dev/null || true' EXIT INT TERM

attempt=0
while [ "$attempt" -lt 8 ]; do
  sleep 1
  if ! kill -0 "$app_pid" 2>/dev/null; then
    wait "$app_pid" || true
    echo "Smoke test failed: packaged application exited during startup" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
done

echo "Packaged application remained healthy through startup: $app_path"
