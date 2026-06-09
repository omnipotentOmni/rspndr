![Rspndr](./ui/respndr_logo_logo.png)

# Rspndr

Rspndr is a lightweight Figma plugin that watches supported progress components on the **current page** and updates their visual fill when their `value` component property changes.

It is designed to stay open quietly while you work.

## What it watches

Rspndr matches **only** these exact component names:

- `Progress / Bar`
- `Progress / Radial`

It does **not** watch generic layers or anything else with `bar` in the name.

Rspndr also includes a manual target/value control in the plugin UI, so you can pick a found progress component and push a value directly from the panel.

## Component contract

### Bar
Rspndr expects this structure for bar components:

- `Progress / Bar`
  - `Progress Text`
  - `Bar Master`
    - `Bar Progress`
      - `Bar Progress Indicator`

Behavior:

- `Bar Master` is the width source
- `Bar Progress` is the full-width socket/container
- `Bar Progress Indicator` is the visible fill that gets resized

### Radial
Rspndr expects this structure for radial components:

- `Progress / Radial`
  - `Progress Value`

Rspndr looks for an editable ellipse inside `Progress Value` and updates its arc.

## Property rules

### `value`
Rspndr reads the `value` component property and accepts:

- `20`
- `20%`

Both are treated as `20`.

### `responsive-slider`
Rspndr requires:

- `responsive-slider = true`

for radial components.

For `Progress / Bar`, the plugin currently works without that property.

## How it works

- watches the **current page** only
- rescans when the document changes
- must remain open to listen for updates
- updates only supported progress components that match the expected structure

## Install in Figma

1. Open Figma desktop.
2. Go to **Plugins → Development → Import plugin from manifest…**
3. Select:
   - `/Users/omni/Documents/rspndr/manifest.json`
4. Run **Rspndr**.

## Use

### Automatic mode
1. Put a supported `Progress / Bar` or `Progress / Radial` component on the current page.
2. Keep the plugin open.
3. Change the component's `value` property.
4. Rspndr will rescan the current page and update the visual progress layer.

### Manual mode
1. Keep the plugin open.
2. In **Target automation**, choose a found progress component.
3. Enter a value such as `20` or `20%`.
4. Click **Apply**.

Rspndr will push that value to the selected target and update the progress display immediately.

## Plugin UI

The plugin UI is intentionally minimal:

- listen toggle
- target automation picker
- manual value input + apply action
- tracked count
- updated count
- found charts list
- manual scan button

The Figma UI is compiled into a single self-contained `ui/index.html` file.

## Troubleshooting

### Nothing updates

Check that:

- the component name matches exactly:
  - `Progress / Bar`
  - `Progress / Radial`
- the layer names match exactly
- the plugin is still open
- the component is on the **current page**

### Radial is not detected

Check that the component has:

- `responsive-slider = true`

### Bar is detected but does not fill correctly

Check that the hierarchy is exactly:

- `Bar Master`
  - `Bar Progress`
    - `Bar Progress Indicator`

Rspndr resizes only `Bar Progress Indicator`, using `Bar Master.width` as the source.

## Local development

### Validate files
```bash
make test
make lint
```

### Serve the standalone UI locally
```bash
make dev
```
Then open:
- `http://localhost:4173/ui/`

## Repo structure

- `manifest.json` — Figma manifest
- `plugin/code.js` — Figma runtime logic
- `ui/index.html` — compiled single-file plugin UI
- `ui/styles.css` — source styles for the UI
- `ui/app.js` — source UI logic
- `ui/respndr_logo_master.png` — UI logo
- `ui/respndr_logo_logo.png` — icon/logo asset

## Publish checklist

Before publishing:

- confirm bar structure is still:
  - `Bar Master / Bar Progress / Bar Progress Indicator`
- confirm radial structure is still:
  - `Progress Value`
- confirm `value` is the component property driving the progress state
- confirm radial components still expose `responsive-slider = true`
- run:
  - `make test`
  - `make lint`
- re-import the manifest in Figma and smoke test:
  - one bar component
  - one radial component
  - one unrelated component to confirm it is ignored
