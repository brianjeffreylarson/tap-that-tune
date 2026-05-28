# Brad Names Tunes — Practice Library

Curated practice library for Brad's Name That Tune appearance. Every MP3 has been retitled to the exact official song title, tagged with title + artist (ID3), and sorted into difficulty folders.

## Folder structure

```
brad tunes/
├── Easy/      191 songs — mass-recognition cultural staples
├── Medium/    630 songs — well-known but less iconic
├── Hard/      124 songs — deeper cuts / harder to name
└── songs.json — manifest for the web app (945 songs total)
```

Every song has been reviewed, tagged, and sorted. The `flagged/` and `missing/` folders have been processed and removed.

## Manifest note field

Some entries have a `note` field flagging files that aren't pristine originals — useful if you want the web app to handle them specially:

- `note: "long"` — file is anomalously long (album-side rip); web app should auto-cap playback to ~30s
- `note: "rerecord"` — re-recording by the same artist (e.g. Taylor's Version) — only version available on streaming
- `note: "remix"` — remix is the most-distributed version (e.g. Old Town Road Remix, Jenny from the Block Track Masters Remix)
- `note: "alt"` — alternate mix by the same artist (e.g. Relax — Come Fighting)
- `note: "cover"` — sound-alike by a different artist (one file: Let's Talk About Sex, where streaming only had a karaoke version)
- `snippet: true` — 30-second preview, real song just truncated (20 files total)

## songs.json manifest

The web app should load this single file. Each entry:

```json
{
  "title": "Bad Romance",
  "artist": "Lady Gaga",
  "difficulty": "Easy",
  "duration": 294.58,
  "file": "Easy/Bad Romance.mp3",
  "snippet": false
}
```

`snippet: true` means the file is a 30-second preview (real song, just truncated). 19 of the 900 songs are snippets — usable for practice but don't allow long listens.

## ID3 tags written on every file

| Tag | Value |
|---|---|
| Title (TIT2) | Official song title, cleaned |
| Artist (TPE1) | Original recording artist |
| Album (TALB) | "Name That Tune Practice" |
| Grouping (TIT1) | Easy / Medium / Hard |
| Genre (TCON) | Easy / Medium / Hard (mirror, for filtering in players that don't read Grouping) |
| Comment (COMM) | Empty for clean files; "snippet" for 30s previews |

## Decisions made

- **Deleted as true duplicates** (4 files): `Basket Case copy`, `Love Story (Taylor's Version)`, `Don't You (Forget About Me)-2`, and `Man in the Mirror - 2012 Remaster` — all bit-identical or near-identical to the original they were duplicating.
- **Kept as different songs despite same title**: `All My Life` (Foo Fighters AND K-Ci & JoJo), `Animals` (Maroon 5 AND Nickelback), `Holiday` (Madonna AND Green Day), `Photograph` (Ed Sheeran AND Nickelback), and one Beverly Hills 90210 theme alt mix. Disambiguated in filenames via `(Artist)` suffix.
- **Added 37 missing essentials** the second round: Journey "Don't Stop Believin'", Queen "Bohemian Rhapsody", ABBA "Dancing Queen", Whitney "I Will Always Love You", Led Zeppelin "Stairway to Heaven", Idina Menzel "Let It Go", and more.
- **Resolved 19 originally-flagged files**: 9 came back clean (Bad Blood, Irreplaceable, Out of the Woods, Push It, Relax, Rocky Top, We Are Never Ever Getting Back Together, Jenny from the Block, Let's Get It Started), and the remaining 10 were approved as-is and merged in with `note` fields so the web app can handle them specially.
