# Who is speaking

A transcript comes back with the voices the register already knows named as `First Last (Company)`, and every other voice called `SPEAKER_` and a number. Putting a person to a voice teaches the register that voice, for every transcript anybody makes afterwards, so only somebody who took part in the meeting names a voice, rules one out, or insists on a name.

## Naming voices on the page

`identify_page` gives a link, valid for 12 hours, to a page for one recording. For each unnamed voice it plays the stretches where that voice speaks, shows who the voice sounds like and which unnamed voices are one voice, and takes a name. Each name registers the moment it is saved, so a tab closed halfway keeps the names already given. Hand the link to the user when they ask to name somebody, and when they are done, bring the names into the files as *A transcript already here* in `SKILL.md` says.

## Naming one voice without the page

`name_voice` takes the recording id, the voice's key (its voice id, or the `SPEAKER_` label of the transcript as it stands), the first name and surname, and the company. The people the register knows come from `list_people`: when one of them is the person, use that spelling, because two spellings of one person become two people that only a person can merge back.

- A first name alone is refused, because "Amanda" names whichever Amanda the person typing meant. When nobody knows the surname, pass `surname_unknown: true`, and the company then tells the person apart.
- When the register holds the voice as somebody else's, `name_voice` returns an error naming that person and the cosine distance from the voice to each of the two. Pass `despite_timbre: true` only when the user, having taken part in the meeting, says the name stands.
- Leave a voice nobody can place unnamed.

`unnamed_voices` lists each unnamed voice with its longest stretches, who it sounds like with the cosine distance (the register recognises a voice below 0.35), and which voices measure as one. Use it to propose a name to the user, NEVER as the name itself.

## A voice the meeting did not have

A recorder picks up whoever is near it: somebody walking into the room, a conversation at the next table. Such a voice has no name to give, and `rule_outside` records that verdict, with a reason, which is required. From then on the voice's turns leave every rendering of that recording, and naming the voice later takes the verdict back.

Propose a voice for ruling out with what it says, and let the user decide: a quiet voice that says little is usually somebody who was in the meeting, and a voice ruled out disappears from the transcript with nothing in the file to show it. NEVER delete a voice's turns from a file without the verdict recorded first, because the next rendering of the recording writes them back.

## A label that holds two people

When two people talk over each other, diarization can put both under one label, and naming that label teaches the average of two voices. `teach_voices` learns each person from stretches chosen by hand instead: one entry per person, with the name, the company and the `[start, end]` milliseconds where that person alone speaks, read from the transcript's timestamps. Check the stretches against the audio (`audio_url`) with the user before calling it. It starts a job, followed with `job_status`.

## Correcting a person

- `rename_person` corrects somebody's name or company, carrying their voices: `old` is the name as `list_people` shows it.
- `forget_person` drops a person learned wrongly, with their voices, so the register stops putting that name on other people's voices. Call it only on the user's word.
