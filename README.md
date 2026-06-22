# Agento

Hands-free agent. Speak or type to an agent that actually does the work — documentation, planning, recipes, file operations — or snap a handwritten diagram and let it build the files. Customize its workspace and context to fit whatever you're working on.

------

## Index

- [Requirements](#requirements)
- [Installation](#installation)
- [Personal configuration](#personal-configuration)
- [Usage](#usage)
- [Interface](#interface)
- [Available tools](#available-tools)
- [Project structure](#project-structure)
- [Environment variables](#environment-variables)
- [Security](#security)
- [License](#license)

------

## Requirements

- [Node.js](https://nodejs.org/) 22 or later (runs `.ts` files directly; no build step)
- An OpenAI API key with access to Realtime models (`gpt-realtime-1.5`, `gpt-4o-mini-transcribe`)

------

## Installation

```bash
npm install
cp .env.example .env
cp agent-context.example.md agent-context.md
cp dictionary.example.md dictionary.md
```

Edit `.env` and set your API key:

```env
OPENAI_API_KEY=sk-...
WORKSPACE_DIR=generated
```

`WORKSPACE_DIR` is the agent's working folder. It can be a path relative to the project (default: `generated`) or an absolute path outside the repository.

Restart the server after changing `.env`, `agent-context.md`, `dictionary.md`, or plugins under `plugins/`.

Run tests:

```bash
npm test
```

------

## Personal configuration

### Agent context

`agent-context.md` is gitignored. Use it to describe yourself, your project, and how you want the assistant to behave.

The file is appended to the agent's system instructions when a Realtime session connects.

Optional: set `AGENT_CONTEXT_PATH` in `.env` to use a different file.

### Speech dictionary

`dictionary.md` is gitignored. List acronyms and words that voice input often gets wrong (for example `MCP — Model Context Protocol, not MSP`).

The dictionary is loaded into:

- the agent's instructions (full file)
- the transcription prompt for `gpt-4o-mini-transcribe` (first 1024 characters)

Put the most important terms first if the file is long.

Optional: set `DICTIONARY_PATH` in `.env` to use a different file.

### Tool profile and plugins

Built-in file tools are controlled with `TOOL_PROFILE` in `.env`:

- `full` (default) — all six file tools
- `readonly` — `read_file` and `list_files` only

To disable specific tools (built-in or plugin), set `DISABLED_TOOLS` to a comma-separated list (for example `write_file,delete_file`).

Local plugins live in the gitignored `plugins/` folder. Each plugin is a subdirectory with an `index.ts` that exports `tools`:

```typescript
export const tools = [ /* Realtime tool definitions */ ];
```

Copy from `plugins.example/hello/` to try the sample `echo` plugin:

```bash
mkdir -p plugins
cp -R plugins.example/hello plugins/hello
```

Restart the server after adding or removing plugins.

Optional: set `PLUGINS_DIR` in `.env` to use a different folder.

------

## Usage

### Desktop app (recommended)

```bash
npm start
```

Electron starts the Express server in the background and opens the Agento window.

### Web server only

```bash
npm run server
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

------

## Interface

- **Microphone** — hold to speak; PCM audio is streamed over WebSocket (`/ws`) to the server, which forwards it to the OpenAI Realtime API.
- **Text field + Send** — type a question or instruction; sent via `POST /turn`.
- **Camera** — photograph a handwritten sketch or diagram; the agent reads it and creates or updates files to match.

The history panel shows what you said or typed, tool actions that ran (for example `write_file: Updated README.md (7035 bytes)`), and the assistant's reply.

While recording, the live preview uses the browser's speech engine. After you release the mic, the server transcript comes from `gpt-4o-mini-transcribe` and may differ from what the Realtime model understood from the audio.

------

## Available tools

Built-in file tools operate on `WORKSPACE_DIR`. Use `TOOL_PROFILE=readonly` or `DISABLED_TOOLS` to restrict them (see [Personal configuration](#personal-configuration)). Plugins in `plugins/` add more tools automatically.

| Tool          | Action                                      |
|---------------|---------------------------------------------|
| `read_file`   | Read a file's contents                      |
| `write_file`  | Create or overwrite a file (up to 32 KB)    |
| `append_file` | Append to a file (for larger content)       |
| `rename_file` | Rename or move a file                       |
| `delete_file` | Delete a file                               |
| `list_files`  | List files in a directory (includes dotfiles; not recursive) |

------

## Project structure

```
agento/
├── components/          # Vue UI (Mic.vue)
├── config/              # Workspace, agent context, dictionary loading
├── controllers/
│   ├── agent/           # Realtime session, instructions, tool registry, turn orchestration
│   ├── turn-http.ts     # POST /turn (text + optional image)
│   └── realtime-ws.ts   # WebSocket /ws (voice turns)
├── electron/            # Electron main process
├── public/              # Frontend static assets
├── tools/file-tools/    # File tool implementations (wired in controllers/agent/tools.ts)
├── plugins.example/     # Sample plugin (copy into gitignored plugins/)
├── views/               # Entry HTML
├── server.ts            # Express server
└── generated/           # Default workspace
```

------

## Environment variables

| Variable             | Description                                        | Default            |
|----------------------|----------------------------------------------------|--------------------|
| `OPENAI_API_KEY`     | OpenAI API key                                     | —                  |
| `WORKSPACE_DIR`      | Folder where the agent reads and writes files      | `generated`        |
| `AGENT_CONTEXT_PATH` | Path to personal agent context markdown file       | `agent-context.md` |
| `DICTIONARY_PATH`    | Path to speech dictionary for voice disambiguation | `dictionary.md`    |
| `SPEECH_PREVIEW`     | Browser speech preview while recording (`false` to disable) | enabled   |
| `TOOL_PROFILE`       | Built-in file tools: `full` or `readonly`          | `full`             |
| `DISABLED_TOOLS`     | Comma-separated tool names to disable              | —                  |
| `PLUGINS_DIR`        | Folder for local plugins                           | `plugins`          |
| `PORT`               | Express server port                                | `3001`             |

------

## Security

Agento is a **local development tool**. It runs a server on your machine, stores your OpenAI API key in `.env`, and gives the agent read/write access to `WORKSPACE_DIR`.

Plugins in `plugins/` are local TypeScript modules loaded at startup. Only install plugins you trust—they run with the same privileges as the server.

Do not expose it to the internet without proper authentication. Use it on `localhost` or a trusted network only.

------

## License

[ISC](LICENSE)
