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
| Your name and email in the history | Every saved change carries your name and GitHub's private "noreply" address (checked on 2026-10-16: all 187 of your commits use it; your personal email is not in the history). Keep it that way: git is set up in this project to use the noreply address. |
| Secrets | Checked on 2026-10-16: a scan of the history (main, v1.4.0-dev and the advisor branches, 190 commits) found no private keys, signing keys, tokens or key files. The update-signing key lives outside the project — **never** put it in the repo. Repeat the check before making new branches public. |
| Privacy claims | Written and checked against the code ([PRIVACY.md](../PRIVACY.md)); an automatic check keeps them true. |

## 3. Publish it (done: the repository is public and has releases since v1.1.0; kept for reference)

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
4. **For one-click releases** (see section 5): *Settings → Environments → New environment* named `release` → tick
   **Required reviewers** and add yourself, so every release needs your approval click. Add both signing secrets to that
   environment (not as repository secrets): `TAURI_SIGNING_PRIVATE_KEY`, the full text of your `updater.key` file, and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The commands are in [RELEASING.md](RELEASING.md), "Signing key password".
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

### The words, in plain language

- **GitHub Actions** is GitHub's built-in helper robot. It runs jobs on GitHub's own computers, not yours.
- A **workflow** is one job written down as a recipe. Ours is called **Release**. Its recipe is: *check everything is in order → run the tests → build the installer → sign it with your secret key → publish it on GitHub with the notes from the changelog*.
- **"Run workflow"** is the button that tells the robot "do that recipe now". It exists so a release only happens when *you* decide.
- **The approval** is the second safety lock. Your signing key is kept in a locked box that only a release you personally approve can open.

### The easiest way: just ask Claude

Say **"release v1.2.0"**. Claude starts the Release workflow for you (this is the "Run workflow" step) and tells you it's running.
After a minute or two GitHub **asks for your approval** (if you set up the `release` environment with yourself as reviewer;
see "Approving" below). You tap **Approve**, and the release is live a few minutes later (v1.2.0, v1.2.1 and v1.3.0 each
took 8 to 10 minutes from start to finish).

### Doing the "Run workflow" step yourself

On a computer (the sure way):
1. Open **github.com/nqble/keystroke-overlay**.
2. Click the **Actions** tab (a row of tabs near the top: Code, Issues, Pull requests, **Actions**, …).
3. In the list on the left, click **Release**.
4. You'll see a gray bar with a **Run workflow** button on the right. Click it.
5. A small form opens. Type the version you're releasing (for example `1.2.0`). This is a safety check: it must match the version inside the app, or nothing happens.
6. Click the green **Run workflow** button in the form.

On your phone:
- The **GitHub website** in your phone's browser should work the same way (steps 1–6). If you don't see the Run workflow button, use your browser's menu and choose **Desktop site**. I haven't been able to verify this on a phone, so treat it as "try it".
- The **GitHub app** is confirmed to work for the *approval* part below. I couldn't confirm it can start a release by itself, so the simplest phone routine is: **ask Claude to start it, then approve in the app.**

### Approving (this works from the phone app)

A few moments after the release starts, the run shows a yellow banner **"Waiting for review"** and you get a notification.
- **GitHub app:** tap the notification (or open the *Notifications* tab) → **Review deployments** → tick **release** → **Approve and deploy**.
- **Website:** open the run → click **Review deployments** → tick **release** → **Approve and deploy**.

Until you approve, nothing is built or published, and your key stays locked. If you didn't start a release, press **Reject**.

### What happens next

1. The robot runs the tests, builds the installer, signs it, and publishes the release (about 8 to 10 minutes so far). You can watch it on the same page.
2. A new release appears under **Releases** on GitHub with the installer and the changelog text as the notes.
3. If the version ends in `.0` (like 1.2.0), or you ticked **"Also make this the Stable version"**, it also updates the **Stable** channel.
4. People using the app see the update button the next time they open settings.

### If something goes wrong

- A red ✗ on the run means it stopped. Click the run to see which step failed and show it to Claude. If it stopped before
  **"Publish the GitHub release"**, nothing was published. If only the last step, **"Promote to the Stable channel"**, failed,
  the release is live for Latest but Stable still offers the old version: ask Claude to finish the Stable step.
- Typed the wrong version? The run stops immediately with a message. Run it again.
- Changed your mind mid-run? On the run page click **Cancel workflow**.
- Published something you shouldn't have? A release can be deleted from the Releases page; ask Claude to help clean up.

## 6. Rules that keep you safe

- **Never share or upload `updater.key`** (or the `.keystroke-overlay-keys` folder). Back it up privately (password manager).
  Lose it and installed copies can no longer auto-update; leak it and someone could ship fake updates.
- Keep the project **out of OneDrive** if you can (for example `C:\dev\keystroke-overlay`): syncing a code repository can corrupt it.
- Made a mistake? Almost everything is undoable: a release can be deleted, a change can be reverted. Ask Claude before panicking.

## 7. If you only remember three things

1. Nothing goes public or gets released without your explicit say-so.
2. The signing key stays private.
3. When unsure, ask Claude to explain before you press the button.
