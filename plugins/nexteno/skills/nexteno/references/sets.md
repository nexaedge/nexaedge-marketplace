# Sets of recordings

## Which recordings a profile selects

A profile in `.nexteno.json` says where a kind of recording is filed and what it is called; the Plaud tag in its `tag` key says which recordings are of that kind. Everybody reads the same Plaud account through the connector, so a tag selects the same recordings for everyone and belongs in the committed file.

When the profile has no `tag`, read the user's settings file, `~/.config/nexteno/settings.json`: `repositories`, then the repository's key, then `profiles`, then the profile's name, then `tag`. The repository's key is the host and path of its `origin` remote without the scheme or `.git` (`github.com/owner/repo`), and the root's absolute path for a repository with no remote.

When neither place gives a tag, stop and ask the user which tag selects the profile, showing the tags `list_recordings` returns on recent recordings. NEVER bring in a profile's set without its tag: the filter then selects the whole account, and another client's meetings land in this repository.

## Bringing in a set

1. **Settle the set.** The profile and its tag, or a tag or a date range the user named, and a start date: a month back when the user gave none. Done when `list_recordings` with those filters has answered.
2. **Agree on the list.** Leave out the recordings already here (step 3 of `SKILL.md`) and the ones turned down (*Turning a recording down*). Show the rest to the user with date, duration and title. Done when the user has agreed to the list, even for a set of one.
3. **Bring each one in.** Steps 4 to 6 of `SKILL.md` for each recording, with the profile's keys over the repository's as *Where the transcript goes* says, and in a repository declaring `hub`, the catalog update of *The catalog*. `transcribe` returns a job at once, so start every job and then follow each with `job_status`. Done when every recording on the list is a file in the repository or was reported as holding no speech.
4. **Bring the names up to date.** Run *A transcript already here* of `SKILL.md` over the transcripts of the set already in the repository. Done when the user has the list of files whose names changed, or knows none did.

## Deciding which recordings belong here

An account that tags nothing leaves no mark on a recording of which work it belongs to, except what was said in it. The connector previews every recording nobody has transcribed, a few at a time every half hour, so most recordings already have their opening minutes decoded, and `preview` decodes the rest:

1. **List the candidates.** `list_recordings` over a date range, a month back when the user gave none, without the recordings already here and the ones turned down. Done when the list is final.
2. **Read each one.** For a recording whose `state` in `list_recordings` is `transcribed`, read the names in `get_transcript`'s `voices`: recognised voices tell whose meeting it is better than its first minutes do. For any other, read `preview`. Done when each candidate has its voices or its opening text.
3. **Propose, grouped.** For example "these six look like this client, these three look personal, these two I cannot place", with the date, the duration and the names or a line of the opening for each, so the user confirms rather than reads. Done when the user has said which belong here and which do not.
4. **Act on the answer.** Bring in the ones that belong here (*Bringing in a set*, from step 3). Turn down the ones that do not, with the user's reason. Done when every candidate is either in the repository or recorded as turned down.

NEVER turn a recording down on your own judgement: a recording turned down stops being offered, so a wrong call is invisible afterwards.

## Turning a recording down

A recording turned down stays out of every later set and every later decision in this repository. Record it with the reason the user gives, since the reason is what tells a recording that belongs to another client from a few seconds of pocket noise:

- In a repository declaring `hub`, set the catalog entry's `status` to `excluded` and `excluded_reason` to the reason.
- Elsewhere, add the recording id with the reason under `repositories`, then the repository's key, then `skipped`, in `~/.config/nexteno/settings.json`. Create the file when it does not exist, and keep everything else in it.

A recording is turned down when either place records it. Taking one back removes it from the place that records it.

## The catalog

A repository declaring `hub` keeps `catalog.jsonl` in that directory: one JSON object per recording, newest first, committed with the repository. Half of each object comes from Plaud and is replaced whenever the catalog is refreshed; the other half is what people decided, which you NEVER overwrite without a person's word.

| From Plaud | Decided by people |
| :-- | :-- |
| `id`, `filename` (the title), `start_time` (epoch milliseconds), `recorded_at` (`YYYY-MM-DD HH:MM:SS` in the repository's zone), `duration_ms`, `duration_min` (two decimals), `scene`, `url` (`https://web.plaud.ai/file/<id>`), `is_trans`, `is_summary`, `tags` | `status`, `excluded_reason`, `project`, `path`, `repo`, `transcript_path`, `summary_path`, `notes` |

`status` is one of `pending` (no transcript filed yet), `transcribed` (a transcript is in the hub, nobody filed it), `filed` (somebody mapped it to where it belongs, in `path` and `repo`) and `excluded` (out of scope here). `filed` and `excluded` are decisions, and nothing but a person's word changes them.

- **After filing a transcript**, set its entry's `transcript_path` and `summary_path` to the paths from the root, and its `status` to `transcribed` unless it is `filed` or `excluded`. A recording with no entry gets one, built from `get_transcript`'s `recording`, with `scene` 0 and `is_trans` and `is_summary` false, since the connector does not give them.
- **Refreshing the catalog** adds an entry for every recording `list_recordings` returns that the catalog lacks, and replaces the Plaud half of the entries it has, except `scene`, `is_trans` and `is_summary`: an entry keeps the values it has, and a new one gets 0, false and false. Then the `status` of every entry that is neither `filed` nor `excluded` is set again: `excluded`, with `exclude_reason` as its reason, when the recording carries a tag listed in `exclude_tags` (compared without regard to case); `transcribed` when the entry has a `transcript_path`; `pending` otherwise.
- Change only the lines of the recordings concerned, and keep every other line byte for byte, so the diff shows only the decision made.

Commit `catalog.jsonl` with the files it maps.
