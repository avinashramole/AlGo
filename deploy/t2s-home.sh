#!/bin/bash
# Locate the T2S checkout on the VPS.
# Prefer the folder that contains this script, then /opt/t2s.
# download/algo is a PC path — only used if that is where the script actually lives.

t2s_is_home() {
  [ -f "${1:-}/server/index.js" ]
}

t2s_has_server_modules() {
  [ -d "${1:-}/server/node_modules/cors" ]
}

t2s_find_home() {
  local d found rel root search
  if [ -n "${T2S_HOME:-}" ] && t2s_is_home "$T2S_HOME"; then
    printf '%s\n' "$T2S_HOME"
    return 0
  fi
  if [ -n "${T2S_SCRIPT_HOME:-}" ] && t2s_is_home "$T2S_SCRIPT_HOME"; then
    printf '%s\n' "$T2S_SCRIPT_HOME"
    return 0
  fi
  search=${T2S_HOME_SEARCH:-"/opt /root /home /usr/local"}
  # shellcheck disable=SC2086
  for root in $search; do
    for rel in \
      t2s \
      AlGo \
      download/algo \
      Download/algo \
      downloads/algo \
      Downloads/algo \
      download/AlGo \
      Downloads/AlGo
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
  found=$(find $search -maxdepth 4 -type f -path '*/server/index.js' 2>/dev/null | head -n 1)
  if [ -n "$found" ]; then
    d=$(dirname "$(dirname "$found")")
    printf '%s\n' "$d"
    return 0
  fi
  return 1
}

t2s_ensure_server_modules() {
  local home=${1:-}
  if t2s_has_server_modules "$home"; then
    echo "API packages present ($home/server/node_modules/cors)"
    return 0
  fi
  echo "== API packages missing (cors). Installing in $home/server =="
  if [ -d /opt/t2s/server/node_modules/cors ] && [ "$home" != /opt/t2s ]; then
    echo "Copying /opt/t2s/server/node_modules"
    cp -a /opt/t2s/server/node_modules "$home/server/"
    if t2s_has_server_modules "$home"; then
      return 0
    fi
  fi
  NODE_OPTIONS=--max-old-space-size=256 npm --prefix "$home/server" install --omit=dev
}
