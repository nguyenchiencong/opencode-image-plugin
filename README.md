# opencode-image-plugin

An OpenCode plugin that preserves absolute paths for dragged and pasted images.

## Problem

When you drag an image to OpenCode or paste an image link, OpenCode automatically strips the directory path from the inserted markdown text (e.g. converting `C:\path\to\image.png` to `![image.png](image.png)`). 

When a subagent is called to read the image (because the main agent doesn't have vision capabilities), the subagent fails because it receives the relative path `image.png` which does not exist in the workspace root directory.

## Solution

This plugin intercepts user messages before they are processed by the agent. It:
1. Extracts the original absolute path from the message's file attachments (supporting both `source.path` and absolute/`file://` `url` properties).
2. Automatically replaces relative filenames within markdown images and links in the message text with their resolved absolute paths.
3. Appends an explicit absolute path instruction (e.g., `[IMPORTANT: The image file "filename.png" is located at absolute path: ...]`) to the user's message. This ensures the LLM reads and passes the correct absolute path to subagents regardless of how the prompt is processed internally.

As a result, the main agent and its subagents can successfully locate, read, and analyze the image from its original path.

## Installation

Add the plugin to your OpenCode configuration (typically at `~/.config/opencode/opencode.json` or `config.json`):

```json
{
  "plugin": [
    "path/to/opencode-image-plugin/dist/plugin.js"
  ]
}
```

## Development & Build

This plugin is built using TypeScript and Bun.

```bash
# Install dependencies
bun install

# Compile TypeScript
bun run build

# Run unit tests
bun test
```
