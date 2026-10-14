# Open-source guide (for the maintainer who doesn't code)

You don't need to write code to run an open-source project. Claude (or any contributor) does the code; your job is
**decisions**: what gets merged, when to release, and keeping the project safe. This guide is the whole job in plain language.

## 1. What "open source" means here

- Anyone can **read** the code, **run** it, **copy** it, and **suggest changes**. That's the MIT license in the `LICENSE` file.
- You **still own the project** and are the only person who decides what goes into your version. Nobody can change your
  repository without your approval.
- People can make their own copies ("forks") and even sell them under MIT. Your protection is the name, the community
  and the update channel (only *you* hold the key that signs official updates).
- You are **not obliged** to answer every message, fix every request, or accept every contribution.

## 2. Before you publish: your decisions

| Question | Where it stands |
|---|---|
| License | MIT is in place. Change it only if you want a different rule (for example, GPL forces copies to stay open). Tell Claude. |
| Name on the license | It says "Jordan Phoutthavone". Edit `LICENSE` if you'd rather use another name or a handle. |
| Your name and email in the history | Every saved change carries your name and your Proton email, and they become public. Fine if you accept that; otherwise ask Claude to switch the history to GitHub's "noreply" address *before* publishing (it's much harder afterwards). |
| Secrets | Checked: no keys or passwords in the files or history. The update-signing key lives outside the project — **never** put it in the repo. |
| Privacy claims | Written and checked against the code ([PRIVACY.md](../PRIVACY.md)); an automatic check keeps them true. |

## 3. Publish it (about 15 minutes)

You already created the repository `nqble/keystroke-overlay` on GitHub (it holds only a placeholder README).

**Easiest: ask Claude.** Say "publish the repo". Claude will ask for your confirmation (publishing is public), then upload the
project. You may be asked to sign in to GitHub once in your browser. Nothing is uploaded without your yes.

**Doing it yourself (no command line):** install [GitHub Desktop](https://desktop.github.com), sign in, choose
*File → Add local repository…* → select the project folder → *Publish repository* (untick "Keep this code private").
Because the repo already has your placeholder README, GitHub Desktop may ask you to merge first; accept the default.

### Then, once, on github.com (Settings of your repository)

1. **Security → Private vulnerability reporting → Enable.** (So people can report problems privately.)
2. **General → Features:** make sure **Issues** is ticked. Add a short **description** and **topics** (like `obs`, `keystroke`, `streaming`, `tauri`) in the "About" box on the main page.
3. **Actions tab:** confirm the "CI" checks ran green after the upload.
4. **For one-click releases** (see section 5): *Settings → Secrets and variables → Actions → New repository secret* named
   `TAURI_SIGNING_PRIVATE_KEY`, value = the full text of your `updater.key` file. Optional safety: *Settings → Environments →
   New environment* named `release` → tick **Required reviewers** and add yourself, so every release needs your approval click.
5. Optional: *Settings → Branches → Add rule* for `main`: require the CI checks to pass before changes are merged.

## 4. Day to day

- **Issues** (bug reports and ideas): reply when you can; label them; close duplicates. Ask Claude to investigate: paste the link.
- **Pull requests** (someone offers a change): GitHub shows green ✓ or red ✗ from the automatic checks. Red = ask them to fix it.
  Green = ask Claude to review it ("review this pull request") and tell you in plain language what it does and whether it's safe;
  you press **Merge** if you agree.
- **The rule for every change:** privacy and light weight. The automatic privacy check blocks the worst mistakes.
- **Saying no** is fine: "Thanks, but this doesn't fit the project" is a complete answer.
- **Security reports** arrive privately (Security tab). Treat them as top priority and ask Claude to help.

## 5. Releasing, with almost no input

1. Ask Claude to prepare the release ("prepare v1.2.1"): it raises the version number and writes the CHANGELOG entry in
   the friendly tone.
2. On GitHub: **Actions → Release → Run workflow**, type the version number to confirm, press **Run**
   (and press **Approve** if you added yourself as a reviewer).
3. GitHub builds, tests, signs and publishes the release by itself, with the CHANGELOG text as the notes. A `x.y.0` version
   (like 1.2.0) is also published to the **Stable** channel automatically; a patch (1.2.1) goes to **Latest** only.

Details and the manual fallback are in [RELEASING.md](RELEASING.md).

## 6. Rules that keep you safe

- **Never share or upload `updater.key`** (or the `.keystroke-overlay-keys` folder). Back it up privately (password manager).
  Lose it and installed copies can no longer auto-update; leak it and someone could ship fake updates.
- Keep the project **out of OneDrive** if you can (for example `C:\dev\keystroke-overlay`): syncing a code repository can corrupt it.
- Made a mistake? Almost everything is undoable: a release can be deleted, a change can be reverted. Ask Claude before panicking.

## 7. If you only remember three things

1. Nothing goes public or gets released without your explicit say-so.
2. The signing key stays private.
3. When unsure, ask Claude to explain before you press the button.
