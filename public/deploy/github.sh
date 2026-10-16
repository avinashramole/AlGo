#!/bin/bash
# Publish the live site. Always downloads the latest publisher from GitHub
# so a stale copy on the VPS cannot skip files.
#   curl -fsSL https://raw.githubusercontent.com/avinashramole/AlGo/main/deploy/github.sh | bash
# After that first publish, this same file is also at:
#   curl -fsS https://trade2smart.com/deploy/github.sh | bash
set -euo pipefail
BRANCH=${1:-main}
RAW="https://raw.githubusercontent.com/avinashramole/AlGo/${BRANCH}/deploy/update-website.sh"
curl -fsSL "$RAW" -o /tmp/update-website.sh
exec bash /tmp/update-website.sh "$BRANCH"
