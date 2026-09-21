#!/usr/bin/env bash

# Read-only diagnostics for a local OBS Studio + Codex MCP setup.
# This script intentionally does not print OBS_PASSWORD or mutate OBS/Codex.

set -u

task_obs_host="${OBS_HOST:-127.0.0.1}"
task_obs_port="${OBS_PORT:-4455}"
task_codex_dir="${CODEX_HOME:-${HOME}/.codex}"
task_config_file="${task_codex_dir}/config.toml"

section() {
  printf '\n== %s ==\n' "$1"
}

status_line() {
  printf '%-30s %s\n' "$1" "$2"
}

section "Runtime commands"
for task_command in python3 uv codex obs-mcp rg ss; do
  if task_path="$(command -v "$task_command" 2>/dev/null)"; then
    status_line "$task_command" "$task_path"
  else
    status_line "$task_command" "not found"
  fi
done

section "OBS process"
if task_processes="$(pgrep -a -f '(^|/)obs(64|32)?($| )|obs-studio|obs$' 2>/dev/null)" && [ -n "$task_processes" ]; then
  printf '%s\n' "$task_processes"
else
  printf 'OBS process not detected\n'
fi

section "OBS WebSocket endpoint"
status_line "configured host" "$task_obs_host"
status_line "configured port" "$task_obs_port"
if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | awk -v port=":${task_obs_port}" '$4 ~ port "$" {found=1} END {exit !found}'; then
  status_line "listener" "detected"
else
  status_line "listener" "not detected"
fi

section "Codex MCP registration"
if [ -f "$task_config_file" ]; then
  status_line "config" "$task_config_file"
  if [ -r "$task_config_file" ]; then
    task_mode="$(stat -c '%a' "$task_config_file" 2>/dev/null || printf 'unknown')"
    status_line "config mode" "$task_mode"
    if command -v rg >/dev/null 2>&1 && rg -q '^\[mcp_servers\.obs\]$' "$task_config_file"; then
      status_line "[mcp_servers.obs]" "present"
    else
      status_line "[mcp_servers.obs]" "not found"
    fi
  else
    status_line "config readability" "not readable"
  fi
else
  status_line "config" "not found"
fi

if command -v codex >/dev/null 2>&1; then
  codex mcp list 2>&1 | awk '
    NR == 1 {print}
    /^[[:space:]]*obs[[:space:]]/ {print}
  '
else
  printf 'codex command unavailable\n'
fi

section "uv installation"
if command -v uv >/dev/null 2>&1; then
  uv tool list 2>/dev/null | awk '
    /^obs-mcp([[:space:]]|$)/ {show=1}
    show {print}
    show && /^[[:space:]]*-[[:space:]]+obs-mcp/ {exit}
  '
else
  printf 'uv command unavailable\n'
fi

section "Displays"
if command -v xrandr >/dev/null 2>&1; then
  xrandr --listmonitors 2>&1 || true
elif command -v wlr-randr >/dev/null 2>&1; then
  wlr-randr 2>&1 || true
else
  printf 'No xrandr or wlr-randr command available\n'
fi

section "Video devices"
task_found_video=0
for task_node in /dev/video*; do
  [ -e "$task_node" ] || continue
  task_found_video=1
  printf '%s\n' "--- $task_node"
  if command -v udevadm >/dev/null 2>&1; then
    udevadm info --query=property --name="$task_node" 2>/dev/null \
      | awk -F= '/^(DEVNAME|ID_V4L_PRODUCT|ID_MODEL|ID_VENDOR|ID_SERIAL)=/ {print}'
  else
    ls -l "$task_node" 2>/dev/null || true
  fi
done
if [ "$task_found_video" -eq 0 ]; then
  printf 'No /dev/video* devices detected\n'
fi

section "Interpretation"
printf '%s\n' \
  '- Registration does not prove that the current Codex session loaded the MCP.' \
  '- A listening port does not prove authentication succeeds.' \
  '- Source-active status does not prove a PipeWire source renders pixels.' \
  '- Validate live access with read-only OBS MCP calls and validate visuals with screenshots.'
