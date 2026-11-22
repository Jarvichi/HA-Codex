#!/usr/bin/env bash
set -e

scrollback="$1"
legacy_name="$2"
model="$3"
mode="$4"
config=/etc/ha-codex-tmux.conf
safe_name="${legacy_name//./_}"

# There may be no server yet on the first connection.
tmux -f "$config" set-option -g history-limit "$scrollback" 2>/dev/null || true

# A dot in a target is parsed as a pane separator. Find existing sessions by
# their literal names and attach by ID, including sessions made by older builds.
while IFS=' ' read -r name id; do
  if [[ "$name" == "$legacy_name" || "$name" == "$safe_name" ]]; then
    exec tmux -f "$config" attach-session -t "$id"
  fi
done < <(tmux -f "$config" list-sessions -F '#{session_name} #{session_id}' 2>/dev/null)

exec tmux -f "$config" new-session -A -s "$safe_name" \
  "/usr/local/bin/ha-codex-session ${model} ${mode}; exec bash -l"
