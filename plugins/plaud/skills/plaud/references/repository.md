# Configuring a repository

A repository that takes in more than the occasional recording declares itself in `.plaud.json` at its root, which is committed. What the file encodes is that repository's convention, so a wrong file sends every later transcript to the wrong place:

1. **Read the repository.** Its `CLAUDE.md` or `AGENTS.md`, its skill for meeting notes or for filing documents, and how the documents already there are named and placed. Done when every key you will propose comes from something read there, or from the user.
2. **Propose the file.** Show the user the whole file and what each key does here. Done when the user agrees to it.
3. **Prove it.** Write it, and bring one recording in through `SKILL.md`. Done when the user has confirmed the path and the name of that transcript.

Every key is optional, and so is the file. An example, for a repository whose meetings are in Portuguese and filed per client:

```json
{
  "context": "contexto/briefing.md",
  "filing": ".agents/skills/meeting-notes/SKILL.md",
  "scratch": "workspace/plaud",
  "language": "pt",
  "utc_offset": -3,
  "name": "{date}-{slug}.md",
  "front_matter": { "type": "Transcript" },
  "profiles": {
    "acme": { "tag": "Acme", "dest": "reunioes/{year}", "front_matter": { "client": "Acme" } }
  }
}
```

| Key | What to put there |
| :-- | :-- |
| `context` | A file describing the work: the people and companies involved and how their names are spelt. The one key worth having in every repository, because it is the base of every description (*The description* in `SKILL.md`), and it is what makes two transcripts of the same people agree. A thin one is better than none; when nothing suitable exists, write one with the user. |
| `filing` | The document that says where a transcript belongs here: the repository's own meeting-notes skill or filing convention. NEVER point it at a copy, which drifts from the original. |
| `scratch` | Where a transcript lands when nothing names a destination. Point it at a git-ignored directory when transcripts are not committed as they arrive. |
| `language` | The language the meetings here are held in, when it is always the same one. |
| `utc_offset` | Hours from UTC of the repository's zone, so two machines in different zones file one recording under one day. |
| `dest`, `name` | The directory and the file name, as templates over the fields *Where the transcript goes* in `SKILL.md` lists. Match what the repository already does. |
| `front_matter` | Keys every transcript arrives with, so the filing step does not add them afterwards. |
| `profiles` | One per recurring kind of recording: its `tag`, and any of `dest`, `name`, `context` and `language`, each replacing the repository's for that kind, and `front_matter`, whose keys are added to the repository's and win on a shared key. |
| `hub` | A directory that keeps the catalog of every recording the repository knows about (`references/sets.md`). Only for a repository whose set of recordings is itself something to track. |
| `exclude_tags`, `exclude_reason` | Tags whose recordings are out of scope here, usually because another repository owns them, and the reason the catalog records for them. Read only with `hub`. |

A key the table does not list is a mistake: tell the user, rather than read meaning into it.
