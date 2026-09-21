# Local OBS MCP Setup for Codex

Read this reference when installing, configuring, validating, upgrading, or removing an OBS MCP server. Commands assume Linux and a user-level Codex configuration; adapt paths after inspecting the machine.

## Contents

- Safety and decision points
- Preflight audit
- Repository inspection
- Independent installation
- OBS WebSocket configuration
- Codex MCP registration
- Validation and restart boundary
- Cleanup, upgrade, rollback, and troubleshooting

## Safety and decision points

Before changing anything, determine:

- Which repository and revision the user selected. If selection is still open, compare maintenance recency, release history, documentation, license, tool coverage, and issue activity; do not equate stars with safety.
- Whether the server uses STDIO or a network transport. `xDarkzx/OBS_MCP` exposes a local STDIO command named `obs-mcp` and connects onward to OBS WebSocket.
- Whether an existing `obs` MCP entry or executable already exists. Update deliberately instead of creating conflicting registrations.
- Whether OBS is running, which port WebSocket uses, and whether authentication is enabled.
- Whether the user wants installation only, live OBS validation, or both. Configuring a server does not authorize scene or recording changes.

Do not run a repository's installer blindly. Read its README, installation documentation, package metadata, entry point, and install script first. Install scripts may modify Claude Desktop, LM Studio, or other clients outside the user's request.

## Preflight audit

Use read-only checks first:

```bash
python3 --version
command -v uv || true
command -v codex || true
command -v obs-mcp || true
pgrep -a -f '(^|/)obs(64|32)?($| )|obs-studio|obs$' || true
ss -ltn | rg ':4455\b' || true
codex mcp list
```

Inspect, but do not dump secrets from, the Codex configuration:

```bash
codex_dir="${CODEX_HOME:-$HOME/.codex}"
config_file="$codex_dir/config.toml"
test -f "$config_file" && rg -n '^\[mcp_servers\.|^command =|^startup_timeout_sec|^tool_timeout_sec|^default_tools_approval_mode' "$config_file"
```

If a repository checkout is requested under a specific path, first verify that exact target is absent or identify what already occupies it. Do not overwrite an existing directory.

The included diagnostic script combines these checks without printing `OBS_PASSWORD`:

```bash
bash scripts/diagnose_obs_mcp.sh
```

## Inspect the selected repository

For the tested `xDarkzx/OBS_MCP` flow, clone publicly over HTTPS unless the user specifically needs SSH:

```bash
git clone https://github.com/xDarkzx/OBS_MCP.git /absolute/path/OBS_MCP
git -C /absolute/path/OBS_MCP rev-parse --short HEAD
git -C /absolute/path/OBS_MCP status --short --branch
```

Read at least:

- `README.md` and any installation document.
- `pyproject.toml` or equivalent dependency/entry-point metadata.
- Installer scripts before running them.
- The server entry point and OBS client module when environment-variable behavior is unclear.

Confirm the actual package name, Python requirement, entry-point command, expected environment variables, transport, and supported OBS/obs-websocket versions. Repository details can change; do not rely only on values recorded in this reference.

At the time of the demonstrated setup, the relevant values were:

- Package/command: `obs-mcp`
- Transport to Codex: STDIO
- OBS endpoint variables: `OBS_HOST`, `OBS_PORT`, `OBS_PASSWORD`
- Typical endpoint: `127.0.0.1:4455`
- Python requirement: inspect current metadata; the tested package installed on Python 3.13

## Install independently of a disposable checkout

If the user wants the clone deleted later, do not configure Codex to execute code from the checkout. Install a persistent isolated copy first:

```bash
uv tool install --from /absolute/path/OBS_MCP obs-mcp
command -v obs-mcp
uv tool list
```

Resolve the final absolute executable path. A typical user installation is:

```text
/home/USER/.local/bin/obs-mcp
```

Verify that this is a symlink or launcher into the `uv` tool environment, not back into the repository checkout. When useful, inspect the interpreter and installed module path:

```bash
/absolute/path/to/uv/tool/python -c 'import obs_mcp, sys; print(obs_mcp.__file__); print(sys.executable)'
```

An STDIO MCP server may exit normally when stdin closes. A short launch check can validate registration without treating EOF exit as failure:

```bash
timeout 3s /absolute/path/to/obs-mcp </dev/null
```

Do not leave temporary stdout/stderr files containing secrets. The server should never receive or print a password in the command itself.

## Configure OBS WebSocket

OBS Studio 28 and newer normally include obs-websocket. In OBS:

1. Open **Tools → WebSocket Server Settings**.
2. Enable the WebSocket server.
3. Confirm the port, commonly `4455`.
4. Decide whether authentication is required.
5. Keep the listener on loopback/local access unless the user explicitly needs remote access and understands the network exposure.

Then verify the listening socket:

```bash
ss -ltn | rg ':4455\b'
```

If authentication is enabled, do not ask the user to paste the password into chat. Prefer local entry. If the password must reside in the Codex config, ensure the file is readable only by the user:

```bash
chmod 600 "${CODEX_HOME:-$HOME/.codex}/config.toml"
```

An empty password is appropriate only when OBS authentication is disabled and the service is local.

## Register the server in Codex

Back up the existing config before modification:

```bash
config_file="${CODEX_HOME:-$HOME/.codex}/config.toml"
cp -p "$config_file" "$config_file.bak-obs-mcp"
```

Register the STDIO server using the CLI when available:

```bash
codex mcp add obs \
  --env OBS_HOST=127.0.0.1 \
  --env OBS_PORT=4455 \
  --env OBS_PASSWORD= \
  -- /absolute/path/to/obs-mcp
```

Then inspect the resulting section and add only missing policy/timeouts while preserving unrelated configuration. A practical entry is:

```toml
[mcp_servers.obs]
command = "/absolute/path/to/obs-mcp"
default_tools_approval_mode = "writes"
startup_timeout_sec = 20.0
tool_timeout_sec = 60.0

[mcp_servers.obs.env]
OBS_HOST = "127.0.0.1"
OBS_PORT = "4455"
OBS_PASSWORD = ""
```

Use an exact absolute command path. `default_tools_approval_mode = "writes"` is a useful default because scene and recording mutations are materially different from status reads. Follow the current product's supported configuration schema if it differs.

When editing `config.toml`, preserve all unrelated tables and user changes. Re-read the edited section afterward and run:

```bash
codex mcp list
```

The server appearing in `codex mcp list` proves registration, not a live OBS connection.

## Validate across the restart boundary

Codex may load MCP servers only when a session starts. After adding the entry:

1. Tell the user that the current session may not gain the new tools dynamically.
2. Have them restart/reload Codex once.
3. Confirm the MCP status shows `obs` connected.
4. Begin with read-only calls: OBS version, current Program scene, scene list, video settings, recording status, and stream status.
5. Do not mutate OBS merely to prove connectivity.

Successful validation requires all of the following:

- `obs-mcp` resolves outside the checkout.
- Codex lists the `obs` MCP entry.
- OBS WebSocket is listening at the configured endpoint.
- The restarted Codex session exposes OBS tools.
- A read-only OBS request returns real state.

If the user says they already restarted and tools are visible, accept that fact and inspect the current session instead of repeating the restart instruction.

## Cleanup only after validation

Delete or trash the checkout only after proving the installed command is independent and live calls work. Resolve the exact path first:

```bash
git -C /absolute/path/OBS_MCP remote get-url origin
test -x /absolute/path/to/obs-mcp
```

Prefer a recoverable move to Trash:

```bash
gio trash /absolute/path/OBS_MCP
```

Never use an unresolved variable, home directory, workspace root, or broad glob as a deletion target. Report what was removed and that the installed tool remains.

## Upgrade, rollback, and removal

For an upgrade, use a fresh checkout or fetch the intended revision, inspect changes and metadata, then reinstall:

```bash
uv tool install --force --from /absolute/path/OBS_MCP obs-mcp
```

Validate the command and live connection again before deleting the checkout.

For rollback, restore the backed-up Codex config and reinstall the previously recorded revision or package version. Do not assume `git checkout` is safe in a user-modified checkout.

For removal, separate three actions and perform only those requested:

1. Remove the Codex MCP registration.
2. Uninstall the `uv` tool.
3. Remove any checkout or backup.

Do not disable OBS WebSocket or delete scenes unless the user also asks.

## Troubleshooting map

### OBS process exists, but port 4455 is closed

WebSocket is disabled, uses another port, or OBS has not applied the setting. Re-open **Tools → WebSocket Server Settings** and verify with `ss`.

### Codex lists `obs`, but the session has no OBS tools

The session probably predates the config change. Restart/reload Codex once, then inspect MCP status.

### MCP starts, but live calls fail authentication

The OBS authentication setting and `OBS_PASSWORD` disagree. Have the user correct the secret locally. Do not print either value while testing.

### Executable breaks after deleting the repository

Codex was pointed at the checkout or an editable environment. Reinstall with `uv tool install --from ...`, point Codex at the user-level executable, validate, and only then clean up.

### MCP registration works, but OBS scene actions fail

Check exact case-sensitive scene/source names, OBS version, available requests, and whether the chosen tool is supported by the installed server. List state again immediately before using item IDs.

### A write reports success, but OBS did not visibly change

Read back the affected state and obtain a screenshot. OBS/portal state can be asynchronous, and some sources report active while rendering black.
