#!/system/bin/sh
# filters.sh - install a rewritten AdGuardHome.yaml produced by the web UI.
#
# The web UI parses the filters / whitelist_filters sections, lets the user edit
# them, and writes the whole file to bin/.AdGuardHome.yaml.new. This script
# validates that staging file before replacing the live configuration, so a
# truncated transfer can never leave the core without a config.
#
# Usage: filters.sh install

. /data/adb/agh/settings.conf
. /data/adb/agh/scripts/base.sh

YAML="$BIN_DIR/AdGuardHome.yaml"
TMP="$BIN_DIR/.AdGuardHome.yaml.new"
BAK="$YAML.bak"

# Fail with a stable message the web UI can log; the UI only shows a generic
# error, the detail is for anyone reading the shell output.
fail() {
  echo "filters.sh: $1"
  exit 2
}

[ "$1" = "install" ] || {
  echo "Usage: $0 install"
  exit 1
}

[ -f "$TMP" ] || fail "staging file missing"
[ -s "$TMP" ] || fail "staging file empty"

size=$(wc -c <"$TMP" 2>/dev/null | tr -d ' ')
[ -n "$size" ] && [ "$size" -gt 100 ] || fail "staging file too small"

# The rewritten file must still be a full AdGuardHome configuration: these keys
# are written by every version we support, and their absence means the content
# was mangled on the way here.
grep -q '^filters:' "$TMP" || fail "filters section missing"
grep -q '^whitelist_filters:' "$TMP" || fail "whitelist_filters section missing"
grep -q '^schema_version:' "$TMP" || fail "schema_version missing"
grep -q '^users:' "$TMP" || fail "users section missing"

cp -f "$YAML" "$BAK" 2>/dev/null

# Copy the content instead of moving the file so the original inode keeps its
# owner and mode; AdGuardHome runs as $adg_user and must still be able to write.
cat "$TMP" >"$YAML" || fail "write failed"
rm -f "$TMP"

log "🧹 Filter subscriptions updated" "🧹 过滤订阅已更新"
exit 0
