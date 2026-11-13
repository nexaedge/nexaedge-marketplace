# nexteno

A Plaud.ai recorder, or any audio file, records the meeting; this plugin is how that audio becomes text inside a repository.

It has two parts. The **nexteno connector** is a remote MCP server at `https://nexteno.nexaedge.com/mcp`: it finds a meeting by what was said in it, transcribes it on a GPU, keeps the transcript, and names the speakers whose voices it has learned. The **`nexteno` skill** files that transcript in the repository you are working in, where the repository's `.nexteno.json` says, under the name it uses. Turning a transcript into a note stays with the repository's own conventions.

## Install

In Claude Code:

```
/plugin marketplace add nexaedge/nexaedge-marketplace
/plugin install nexteno@nexaedge-marketplace
```

The plugin adds the connector; `/mcp` signs in to it. Sign-in goes through Google, and only accounts on the domains the service admits get in.

In claude.ai, add the connector under Settings, Connectors, Add custom connector, with the address `https://nexteno.nexaedge.com/mcp`. Any other agent takes it as a remote MCP server (streamable HTTP) at that address.

Everybody signed in reads the same Plaud account, the same transcripts and one shared register of voices.

## How a recording is transcribed

In two steps. The connector first decodes the opening minutes of the recording, so the agent learns what the meeting is about. The agent then writes a description of the meeting (who took part, how their names are spelt, their companies) from those minutes, from the repository's context document and from the calendar, and the connector transcribes the whole recording against it. The description is what makes the names in the transcript come out spelt right.

Every half hour the connector decodes the opening minutes of a few recordings nobody has transcribed, so a search finds most meetings by what was said at their start before anybody transcribes them.

The connector keeps every transcript it makes. Asking again for one answers in seconds, with the names as they are known that day, and decoding a recording again happens only when somebody asks for it.

## Configure the repository

`.nexteno.json` at the repository root says where transcripts go, what they are called, what describes them and where they belong afterwards. The file is optional, and so is every key in it.

```json
{
  "context": "contexto/briefing.md",
  "filing": ".agents/skills/meeting-notes/SKILL.md",
  "scratch": "workspace/transcripts",
  "language": "pt",
  "name": "{date}-{slug}.md",
  "front_matter": { "type": "Transcript" },
  "profiles": {
    "acme": { "tag": "Acme", "dest": "reunioes/{year}" }
  }
}
```

`context` is a file describing the work: the people, the companies, how their names are spelt. `filing` points at the document that says where a transcript belongs here. `scratch` is where a transcript lands when nothing names a destination. `name` and `dest` are templates over `{date}`, `{year}`, `{month}`, `{day}`, `{time}`, `{slug}`, `{id}` and `{short_id}`, and a profile is a named set of those keys plus the Plaud tag that selects its recordings. `hub` turns on a catalog of every recording the repository knows about, in `catalog.jsonl` in that directory. The skill's `references/repository.md` lists every key.

## Speakers

A voice the register does not know stays `SPEAKER_01` in the transcript. The connector hands out a page that plays the stretches where each unnamed voice speaks and takes the name; a name given there is learned, so that person is recognised in every recording afterwards, and the skill brings the new names into the transcripts already filed.
