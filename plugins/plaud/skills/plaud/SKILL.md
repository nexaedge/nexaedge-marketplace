---
name: plaud
description: >-
  Use when the user asks about a Plaud.ai recording or a recorded meeting: finding one, transcribing it, bringing its transcript into the current repository, bringing in a set of recordings, or saying who speaks in one. Triggers "plaud", "gravação", "recording", "transcrição", "transcript", "processa essa call", "essa reunião foi gravada".
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
---

The Plaud connector, an MCP server named `plaud`, does everything that touches Plaud: it finds recordings, transcribes them on a GPU, keeps the transcripts, and keeps the register of voices that names the speakers. This skill files those transcripts into the repository, in the place and under the name the repository declares in `.plaud.json`.

Everybody signed in to the connector reads the same recordings and the same transcripts, and names voices in one shared register.

## When the plaud tools are missing

The plugin adds the connector to Claude Code, and `/mcp` signs in to it. In claude.ai the user adds it under Settings, Connectors, Add custom connector, with the address `https://plaud.nexaedge.com/mcp`. Any other agent takes it as a remote MCP server (streamable HTTP) at the same address. Sign-in goes through Google, and only accounts on the domains the service admits get in.

## When the Plaud session expired

A tool that needs Plaud returns an error saying the Plaud session expired when the connector's shared session with Plaud lapses. Tell the user that an admin has to replace it, and go on with what needs no Plaud: `find_meeting` still searches the index as it was, and kept transcripts still read. Call `plaud_connect` only when the user asks to replace the shared session with an account that signs in to Plaud by email.

## Bringing one recording in

1. **Read what the repository declares.** The nearest `.plaud.json` from the working directory upwards governs, the directory holding it is the root, and every path in it is read from that root. Read the document its `filing` key names, else the repository's `CLAUDE.md` or `AGENTS.md`, for where a transcript belongs afterwards. Done when the destination is settled: a path the user named, or the one *Where the transcript goes* yields from `.plaud.json`. With neither, ask the user for the path, and offer to configure the repository (`references/repository.md`) when it will take in more recordings.
2. **Find the recording.** `find_meeting` searches what was said and the titles; `list_recordings` filters by date, title and tag. Done when one recording id is chosen. When several recordings fit, show each with its date, duration and title, and the user picks.
3. **Check whether it is already here.** The recording is here when the destination file exists, or when a markdown file outside the git-ignored paths names its id under `recording:` in the front matter: `rg -l '^recording:.*<id>' -g '*.md'` from the root, which skips ignored paths by itself. A copy under an ignored path other than the destination is somebody's scratch and does not count. Done when the answer is yes or no. On yes, go to *A transcript already here* and leave this procedure.
4. **Get the transcript.** Call `get_transcript`. When it returns an error saying there is no transcript yet:
   1. Call `preview`. It returns the opening minutes of the recording as text, or a `job_id` to follow with `job_status` until the job is done.
   2. Write the description, as *The description* says.
   3. Call `transcribe` with the description, and with `language` when `.plaud.json` or the profile declares one. Follow its `job_id` with `job_status` until the job is done.

   Done when `get_transcript` returns the transcript. Transcribing takes minutes; NEVER ask the user whether to do it, because finishing the transcript is what was asked. When a transcript was already kept in a language other than the one `.plaud.json` declares, tell the user, and decode it again only on their word, as *A transcript already here* says.
5. **Write the file.** When `get_transcript` returns `no_speech: true`, write nothing and tell the user the recording holds no speech. Otherwise create the destination's directory and download the markdown from `downloads.markdown` with `curl -sf "<link>" -o "<destination>"`; the link lasts 15 minutes, and `get_transcript` hands out a fresh one. Add the `front_matter` keys of `.plaud.json`, and of the profile, which wins on a shared key, as `key: value` lines at the top of the front matter, above `recording:`. When `get_transcript` carries a `summary` and the user named no exact file, write it to the destination's name with `-summary` before `.md`, unless that file exists. Done when the destination holds the transcript and its front matter holds `recording:`.
6. **Say which voices are unnamed.** Every key in the file's `voices:` block that reads `SPEAKER_` followed by digits is a voice nobody has named. Done when the user has heard how many there are, at the end of your answer, with the offer of a page to name them (`identify_page`), or when there are none. An unnamed voice blocks nothing. NEVER name a voice, rule one out, or pass `despite_timbre` on your own judgement: `references/speakers.md` says who decides.
7. **Hand it off.** Follow the `filing` document, and use the repository's own skill for meeting notes or for filing when it has one. In a repository declaring `hub`, update the catalog as `references/sets.md` says. Done when the user has the path of the transcript and of whatever was filed from it.

The transcript stays in the language it was spoken in, and a note made from it links back to it.

A recording that is not on Plaud, such as an audio file the user has, enters through `request_upload`: send the file with `curl -sf -X PUT --data-binary @<file> -H "Content-Type: <type>" "<put_url>"`, or hand `page_url` to the user to pick the file in a browser. Its `upload_id` then stands for a recording id in every tool, from step 3 on.

## Where the transcript goes

A path the user names wins. A path ending in `.md` is the destination file itself, and any other path is the directory, which keeps the file name below.

The profile is the one the user names, else the one whose tag the recording carries (`references/sets.md` says where a profile's tag is written). With neither, no profile applies.

Otherwise the directory is the profile's `dest`, else the repository's `dest`, read from the root. With neither, it is `scratch`, else `<hub>/transcripts` in a repository declaring `hub`, else the root. The file name is the profile's `name`, else the repository's `name`, else `{date}-{slug}-{short_id}`, with `.md` added when the rendered name has no extension.

`dest` and `name` are templates over these fields of the recording:

| Field | Value |
| :-- | :-- |
| `{date}` | `YYYY-MM-DD` of the start |
| `{year}`, `{month}`, `{day}` | `YYYY`, `MM`, `DD` of the start |
| `{time}` | `HH-MM` of the start, 24-hour |
| `{slug}` | the title, as below |
| `{id}`, `{short_id}` | the recording id, and its first 8 characters |

The start is read in the zone `utc_offset` gives, in hours from UTC, and in the machine's zone when `.plaud.json` gives none. The tools write `start` with São Paulo's offset, so convert it before filling a field. The slug is the title in lower case, with every run of characters other than letters and digits replaced by one `-`, dashes trimmed from both ends, cut to 60 characters, and any dash the cut leaves at the end removed; it is `recording` when nothing is left. Accented letters are letters and stay.

A template naming any other field is a mistake in `.plaud.json`: stop, and tell the user which field, rather than write braces into a file name.

## The description

The description settles how the names in a transcript are spelt, and `transcribe` returns an error without one. Write it from two sources, one after the other:

- **The repository's document.** The text of the file the profile's `context` names, else the repository's `context`. It holds who the people of the work are and how their names, companies and systems are spelt.
- **This meeting.** Who took part, with names spelt as they should appear and their companies, and what it was about: from the preview, from what the user said, and from the calendar event at the recording's time, whose title and guest list carry real names and email domains.

When the user hands over a paper that describes this one recording, that paper replaces the repository's document.

NEVER write into the description anything about work other than this recording's: the names it carries come out in the transcript in place of the names spoken, so a description naming other clients turns a real name into one of theirs. NEVER invent a guest: an attendee guessed at becomes a name written into the record.

## A transcript already here

NEVER transcribe a recording again to refresh a transcript already in the repository: bring its names up to date in place. Take the voice ids of every entry in its `voices:` block, call `who_is` with the recording id and those ids, and apply its answer to each entry:

- When `who_is` gives one `name` for every voice of the entry, and that name differs from the entry's, put it in place of the old one on each turn line (`**Old Name** (00:12:34):`) and in the `voices:` block. When the new name is already an entry there, merge the two lists of ids.
- When `who_is` gives different names for the voices of one entry, leave the entry, and tell the user: either one person was split into two voices, or a name was given to the wrong voice, and only a person settles which.
- When `who_is` gives `outside: true` for every voice of an entry, somebody ruled that voice out of the meeting: delete the entry and every turn under its name. When it does so for only some voices of an entry, remove their ids from the entry and tell the user that the turns still in the file include theirs.
- When `who_is` gives `known: false` for a voice, the recording was transcribed again and that voice no longer exists: leave the file, and tell the user.

Change nothing else in the file: it may carry front matter and corrections added after it was written, and rendering it again would drop them. Report every file whose names changed.

`transcribe` decodes a kept transcript again when called with `force`, or with a `language` other than the one the transcript is in. Each costs a GPU pass and renumbers the voices, so transcripts written from the earlier run point at voices that no longer exist. `force` is for a transcript that came out wrong. `language` is for a meeting whose transcript reads fluently in a language nobody spoke, which happens when the language detected for the recording was wrong. Call `transcribe` on a kept transcript only when the user asks, then download the file again and put the repository's front matter back.

## Other tasks

Read the file whole before the task it names:

- `references/speakers.md`: naming a voice, ruling a voice out of a meeting, splitting a label that holds two people, or renaming or forgetting a person.
- `references/sets.md`: bringing in several recordings at once (a profile, a tag, a date range), deciding which recordings belong to this repository, or touching the catalog of a repository declaring `hub`.
- `references/repository.md`: writing or changing `.plaud.json`.
