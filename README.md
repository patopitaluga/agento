# Agento

Voice-controlled file assistant. It uses the OpenAI Realtime API to understand spoken or typed commands, run file operations, and answer questions—including ones with an attached image.

The desktop app (Electron) stays on top of other windows on macOS.

## Requirements

- [Node.js](https://nodejs.org/) 22 or later (runs `.ts` files directly; no build step)
- An OpenAI API key with access to Realtime models (`gpt-realtime-1.5`, `gpt-4o-mini-transcribe`)

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

Restart the server after changing `.env`, `agent-context.md`, or `dictionary.md`.

Run tests:

```bash
npm test
```

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

## Interface

- **Microphone** — hold to speak; PCM audio is streamed over WebSocket (`/ws`) to the server, which forwards it to the OpenAI Realtime API.
- **Text field + Send** — type a question or instruction; sent via `POST /turn`.
- **Camera** — capture a photo with your Mac's camera to ask about it.

The history panel shows what you said or typed, tool actions that ran (for example `write_file: Updated README.md (7035 bytes)`), and the assistant's reply.

While recording, the live preview uses the browser's speech engine. After you release the mic, the server transcript comes from `gpt-4o-mini-transcribe` and may differ from what the Realtime model understood from the audio.

## Available tools

The agent can operate on files inside `WORKSPACE_DIR`:

| Tool          | Action                                      |
|---------------|---------------------------------------------|
| `read_file`   | Read a file's contents                      |
| `write_file`  | Create or overwrite a file (up to 32 KB)    |
| `append_file` | Append to a file (for larger content)       |
| `rename_file` | Rename or move a file                       |
| `delete_file` | Delete a file                               |

## Project structure

```
agento/
├── components/          # Vue UI (Mic.vue)
├── config/              # Workspace, agent context, dictionary loading
├── controllers/
│   ├── agent/           # Realtime session, instructions, turn orchestration
│   ├── turn-http.ts     # POST /turn (text + optional image)
│   └── realtime-ws.ts   # WebSocket /ws (voice turns)
├── electron/            # Electron main process
├── public/              # Frontend static assets
├── tools/file-tools/    # Agent file tools
├── views/               # Entry HTML
├── server.ts            # Express server
└── generated/           # Default workspace
```

## Environment variables

| Variable             | Description                                        | Default            |
|----------------------|----------------------------------------------------|--------------------|
| `OPENAI_API_KEY`     | OpenAI API key                                     | —                  |
| `WORKSPACE_DIR`      | Folder where the agent reads and writes files      | `generated`        |
| `AGENT_CONTEXT_PATH` | Path to personal agent context markdown file       | `agent-context.md` |
| `DICTIONARY_PATH`    | Path to speech dictionary for voice disambiguation | `dictionary.md`    |
| `SPEECH_PREVIEW`     | Browser speech preview while recording (`false` to disable) | enabled   |
| `PORT`               | Express server port                                | `3001`             |

## Security

Agento is a **local development tool**. It runs a server on your machine, stores your OpenAI API key in `.env`, and gives the agent read/write access to `WORKSPACE_DIR`.

Do not expose it to the internet without proper authentication. Use it on `localhost` or a trusted network only.

## License

[ISC](LICENSE)
