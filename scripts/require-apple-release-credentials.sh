#!/bin/sh
set -eu

missing=""
for variable in APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
  eval "value=\${$variable-}"
  if [ -z "$value" ]; then
    missing="$missing $variable"
  fi
done

if [ -n "$missing" ]; then
  echo "Release blocked: missing required Apple credentials:$missing" >&2
  exit 1
fi

echo "Apple release credentials are configured."
