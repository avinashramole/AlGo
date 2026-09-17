#!/bin/bash
# Locate the T2S checkout on the VPS.
# Canonical VPS path is /opt/t2s.
# PC path is C:\Users\SHIVAMFINTECH\Desktop\AlGo — never prefer Windows/PC folder names.

t2s_is_home() {
  [ -f "${1:-}/server/index.js" ]
}

t2s_has_server_modules() {
  [ -d "${1:-}/server/node_modules/cors" ]
}

# Windows / PC clone names (Desktop\AlGo, download\algo). Never the live VPS home when /opt/t2s exists.
t2s_is_pc_path() {
  local p=${1:-}
  p=${p%/}
  case "$p" in
    */download/algo|*/Download/algo|*/downloads/algo|*/Downloads/algo|*/download/AlGo|*/Downloads/AlGo|*/Desktop/AlGo|*/Desktop/algo|*/Desktop/Algo)
      return 0
      ;;
  esac
  return 1
}

t2s_vps_home() {
  printf '%s\n' "${T2S_VPS_HOME:-/opt/t2s}"
}

t2s_find_home() {
  local d found rel root search vps
  vps=$(t2s_vps_home)

  if [ -n "${T2S_HOME:-}" ] && t2s_is_home "$T2S_HOME" && ! t2s_is_pc_path "$T2S_HOME"; then
    printf '%s\n' "$T2S_HOME"
    return 0
  fi
  if t2s_is_home "$vps"; then
    printf '%s\n' "$vps"
    return 0
  fi
  if [ -n "${T2S_SCRIPT_HOME:-}" ] && t2s_is_home "$T2S_SCRIPT_HOME" && ! t2s_is_pc_path "$T2S_SCRIPT_HOME"; then
    printf '%s\n' "$T2S_SCRIPT_HOME"
    return 0
  fi

  search=${T2S_HOME_SEARCH:-"/opt /root /home /usr/local"}
  # shellcheck disable=SC2086
  for root in $search; do
    for rel in t2s AlGo; do
      d="$root/$rel"
      if t2s_is_home "$d"; then
        printf '%s\n' "$d"
        return 0
      fi
    done
  done

  # Last resort: a checkout that happens to live in a PC-style folder (mis-clone on the VPS).
  if [ -n "${T2S_SCRIPT_HOME:-}" ] && t2s_is_home "$T2S_SCRIPT_HOME"; then
    printf '%s\n' "$T2S_SCRIPT_HOME"
    return 0
  fi
  if t2s_is_home "${PWD:-}" ; then
    printf '%s\n' "$PWD"
    return 0
  fi
  # shellcheck disable=SC2086
  for root in $search; do
    for rel in download/algo Download/algo downloads/algo Downloads/algo download/AlGo Downloads/AlGo; do
      d="$root/$rel"
      if t2s_is_home "$d"; then
        printf '%s\n' "$d"
        return 0
      fi
    done
  done
  # shellcheck disable=SC2086
  found=$(find $search -maxdepth 4 -type f -path '*/server/index.js' 2>/dev/null | head -n 1)
  if [ -n "$found" ]; then
    d=$(dirname "$(dirname "$found")")
    printf '%s\n' "$d"
    return 0
  fi
  return 1
}

t2s_seed_opt_t2s() {
  local src=${1:-}
  local vps
  vps=$(t2s_vps_home)
  if t2s_is_home "$vps"; then
    echo "VPS checkout already at $vps"
    return 0
  fi
  if ! t2s_is_home "$src"; then
    echo "Cannot seed $vps (no server/index.js in $src)"
    return 1
  fi
  echo "Seeding $vps from $src (PC is C:\\Users\\SHIVAMFINTECH\\Desktop\\AlGo; VPS is $vps)"
  mkdir -p "$vps"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude node_modules "$src"/ "$vps"/
  else
    tar -C "$src" --exclude=node_modules -cf - . | tar -C "$vps" -xf -
  fi
  mkdir -p "$vps/server"
  if [ -d "$src/server/node_modules" ] && [ ! -d "$vps/server/node_modules/cors" ]; then
    cp -a "$src/server/node_modules" "$vps/server/"
  fi
  for f in .env tokan.env; do
    if [ -f "$src/$f" ] && [ ! -f "$vps/$f" ]; then
      cp -a "$src/$f" "$vps/$f"
    fi
  done
  t2s_is_home "$vps"
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
