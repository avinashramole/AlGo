#!/bin/bash
# Locate the T2S checkout. Prefer download/algo/ (new VPS path), then /opt/t2s.

t2s_is_home() {
  [ -f "${1:-}/server/index.js" ]
}

t2s_find_home() {
  local d found rel root search
  if [ -n "${T2S_HOME:-}" ] && t2s_is_home "$T2S_HOME"; then
    printf '%s\n' "$T2S_HOME"
    return 0
  fi
  search=${T2S_HOME_SEARCH:-"/root /opt /home /usr/local"}
  # shellcheck disable=SC2086
  for root in $search; do
    for rel in \
      download/algo \
      Download/algo \
      downloads/algo \
      Downloads/algo \
      download/AlGo \
      Downloads/AlGo \
      t2s \
      AlGo
    do
      d="$root/$rel"
      if t2s_is_home "$d"; then
        printf '%s\n' "$d"
        return 0
      fi
    done
  done
  if t2s_is_home "${PWD:-}"; then
    printf '%s\n' "$PWD"
    return 0
  fi
  # shellcheck disable=SC2086
  found=$(find $search -maxdepth 6 -type f \( \
    -path '*/download/algo/server/index.js' \
    -o -path '*/Download/algo/server/index.js' \
    -o -path '*/downloads/algo/server/index.js' \
    -o -path '*/Downloads/algo/server/index.js' \
    -o -path '*/download/AlGo/server/index.js' \
    -o -path '*/Downloads/AlGo/server/index.js' \
  \) 2>/dev/null | head -n 1)
  if [ -n "$found" ]; then
    d=$(dirname "$(dirname "$found")")
    printf '%s\n' "$d"
    return 0
  fi
  return 1
}
