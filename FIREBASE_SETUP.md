# Firebase setup (accounts and online play)

PlayMora uses one Firebase project for two things:

- **Accounts**: email or username + password, and Google sign-in. Profiles,
  saved players, stats and settings sync to `/users/{uid}`.
- **Online rooms**: people on different devices play the same game at once.

Without a config (`FF.FirebaseConfig = null`) the app falls back to
**device-only accounts**: sign-up still works, but the account lives in that
browser only and online rooms are hidden. That mode is for development; the
live site needs Firebase.

The free **Spark** plan is enough. No credit card is required.

---

## 1. Create the project

1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. Click **Add project**, name it (e.g. `playmora`), and continue.
3. Google Analytics is not needed — turn it off.

## 2. Enable the Realtime Database

1. In the left sidebar choose **Build → Realtime Database**.
2. Click **Create Database**.
3. Pick the region closest to you.
4. Choose **Start in locked mode**. The rules in step 5 replace this.

> Make sure you pick **Realtime Database**, not Firestore. They are different
> products and this app uses Realtime Database.

## 3. Enable sign-in methods

1. **Build → Authentication → Get started**.
2. On the **Sign-in method** tab, enable:
   - **Email/Password** (leave "Email link" off).
   - **Google**. Set the public-facing name to `PlayMora` and pick a support email.
   - **Anonymous**. Kept as a fallback so an old cached copy of the app can
     still join rooms. The rules below stop anonymous users touching accounts.
3. **Authentication → Templates**: set the sender name of the password-reset
   email to `PlayMora`, and (optional) the action URL to `https://playmora.com/play.html`.
4. **Authentication → Settings → User actions**: turn on
   **Email enumeration protection**. The app already gives the same reply for
   known and unknown emails on "Forgot password".

## 4. Authorise your domain

1. **Authentication → Settings → Authorised domains**.
2. Click **Add domain** and enter `playmora.com`, then add `www.playmora.com`.
   (`localhost` is there by default for testing.)

Without this, sign-in fails on the live site with an `auth/unauthorized-domain`
error.

## 5. Paste the security rules

Open **Realtime Database → Rules**, replace everything with the contents of
[`database.rules.json`](database.rules.json), and click **Publish**.

On top of the room rules explained below, that file adds:

- `/daily/{date}/{uid}`: the daily challenge leaderboard. Signed-in users can
  read a day's scores and write their own score once (0 to 1500 points).
- `/challenges/{id}/{uid}`: results of a friend challenge, so the sender sees who
  played it. Same rules: read with an account, write your own result once.
- `/stats/players`: the public player count on the landing page ("120+ players").
  Anyone can read it; a signed-in user can only add 1 to it, which the app does once
  when an account is created. It starts counting from the first sign-up after you
  publish the rules. To start from your current number of users, set it once by hand
  in **Realtime Database → Data** (add `stats` → `players` with a number).

- `/users/{uid}`: only that signed-in (non-anonymous) user can read or write
  it. Synced values are capped at about 200 KB each.
- `/usernames/{name}`: anyone can look up one name (sign-in by username needs
  it), but nobody can list them all. A name can only be claimed when free, or
  changed or released by its owner; the format must be 3–20 of `a-z 0-9 _ .`,
  and the stored email must be the claimer's own.

> **Privacy tradeoff.** Signing in with a username means the app must find
> the email behind it before the user is signed in, so `/usernames/{name}`
> stores the email and is readable by anyone who knows the username. If that
> is not acceptable, drop username sign-in (email only) and stop storing
> `email` there, or move the lookup into a Cloud Function (Blaze plan).

The room part of the rules, for reference:

```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": "auth != null",

        "meta": {
          ".write": "auth != null && (!data.exists() || data.child('hostUid').val() === auth.uid || root.child('rooms').child($code).child('players').child(data.child('hostUid').val()).child('online').val() !== true)",
          ".validate": "newData.hasChildren(['seed', 'status', 'appVersion'])"
        },

        "players": {
          "$uid": {
            ".write": "auth != null && $uid === auth.uid",
            ".validate": "newData.hasChildren(['name'])"
          }
        },

        "rounds": {
          ".write": "auth != null && !newData.exists() && root.child('rooms').child($code).child('meta').child('hostUid').val() === auth.uid",

          "$index": {
            "startedAt": {
              ".write": "auth != null && !data.exists()"
            },
            "winner": {
              ".write": "auth != null && !data.exists()",
              ".validate": "newData.isString()"
            },
            "answers": {
              "$uid": {
                ".write": "auth != null && $uid === auth.uid && !data.exists()",
                ".validate": "newData.hasChildren(['correct'])"
              }
            }
          }
        }
      }
    }
  }
}
```

These rules enforce:

- Only signed-in devices can read, and only a room whose code they already
  know. Reading the whole `rooms` collection is denied, so nobody can
  enumerate other people's rooms.
- A player may write **only their own** entry and their own answer
  (`$uid === auth.uid`), and `!data.exists()` means an answer cannot be
  changed once submitted — no editing after seeing someone else's.
- `winner` and `startedAt` can be claimed once and **never overwritten**.
  This is what makes the buzzer fair: the first correct answer takes the
  point and no later write can steal it.
- Only the host can clear the round history (starting a game or playing
  again). `meta` is writable by the host, or by anyone once the recorded
  host has gone offline, which is what lets host migration work.

> **Why there is no `.write` at the room level.** In Realtime Database, a
> `.write` rule that grants access **cascades to every child**, and deeper
> rules are then never consulted. An earlier version of these rules had a
> broad `".write"` on `$code`, which silently granted everything and made the
> nested rules decorative. Each write path must carry its own rule.

These were verified against a live project by attempting each forbidden
operation and confirming it was rejected: stealing the winner slot, changing
an answer after submitting, forging another player's answer or entry,
rewriting `startedAt`, and writing malformed `meta`.

**Not enforced by rules:** the 6-hour room expiry. Expressing it at every
path made the rules unwieldy, and it is not a security property — room
expiry is checked by the app when joining.

## 6. Copy the config into the app

1. **Project settings → General → Your apps → Web (`</>`)**.
2. Register the app (any nickname). Firebase Hosting is not needed.
3. Copy the `firebaseConfig` object.
4. Open `js/net/firebase-config.js` and replace `FF.FirebaseConfig = null;`
   with your object.

Reload the app. **PLAY TOGETHER** now appears on the home screen.

To check it took effect, open the browser console and run:

```js
FF.Net.configured()
```

It should print `true`.

---

## Deploying

`js/net/firebase-config.js` is **git-ignored** because it is per-deployment, not
source. A template is committed as `js/net/firebase-config.example.js`.

**Upload `firebase-config.js` to the server by hand** alongside the rest of the
app, or your deployed copy will silently have online play disabled.

## Turning Firebase off

Set `FF.FirebaseConfig = null;` again. Online rooms disappear and accounts
become device-only. To test device-only accounts with a config present, run
`FF.Storage.set('devAuth', true)` in the console and reload.

## Costs

Each round sends a few hundred bytes. No questions, flags or images ever cross
the network: every device generates the same questions locally from a shared
random seed, so only the answers travel. The Spark free tier's limits are far
beyond casual use. Rooms expire after 6 hours.

## Troubleshooting

| Symptom | Cause |
|---|---|
| No PLAY TOGETHER button | Config still `null`, or the `apiKey` is malformed. Run `FF.Net.configured()` in the console. |
| "Could not reach Firebase" | No internet, or the CDN is blocked. |
| `auth/unauthorized-domain` | `playmora.com` is not in Authorised domains (step 4). |
| Google sign-in popup closes and nothing happens | Popups blocked: the app falls back to a full-page redirect. If that fails too, check the Google provider is enabled (step 3). |
| "That username is taken" for a brand-new name | The `/usernames` rules were not published. |
| "Permission denied" in the console | Rules were not published, or a sign-in method in step 3 is off. |
| Players see different questions | A device is running a cached old version. Hard-refresh it; the version guard should catch this and prompt. |
| Everything works locally but not deployed | You forgot to upload `firebase-config.js` — it is git-ignored. |
| Players can somehow overwrite each other | Your rules have a `.write` at the `$code` level. Remove it — see the note in step 5. |
