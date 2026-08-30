# Enabling Online Play (Firebase)

Family Fun works fully offline with no setup at all. Follow this only to enable
**PLAY TOGETHER**, which lets people on different devices play the same game at
the same time.

The free **Spark** plan is enough for family use. No credit card is required.

---

## 1. Create the project

1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. Click **Add project**, name it (e.g. `family-fun`), and continue.
3. Google Analytics is not needed — turn it off.

## 2. Enable the Realtime Database

1. In the left sidebar choose **Build → Realtime Database**.
2. Click **Create Database**.
3. Pick the region closest to you.
4. Choose **Start in locked mode**. The rules in step 5 replace this.

> Make sure you pick **Realtime Database**, not Firestore. They are different
> products and this app uses Realtime Database.

## 3. Enable anonymous sign-in

1. **Build → Authentication → Get started**.
2. On the **Sign-in method** tab, enable **Anonymous** and save.

Nobody creates an account or types a password. This just gives each device a
stable identity so the security rules can stop one player overwriting another
player's answer.

## 4. Authorise your domain

1. **Authentication → Settings → Authorised domains**.
2. Click **Add domain** and enter `demo.brightappsoft.com`.

Without this, sign-in fails on the live site with an `auth/unauthorized-domain`
error.

## 5. Paste the security rules

Open **Realtime Database → Rules**, replace everything, and click **Publish**:

```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": "auth != null",
        ".write": "auth != null && (!data.exists() || !data.child('meta/expiresAt').exists() || data.child('meta/expiresAt').val() > now)",

        "meta": {
          ".validate": "newData.hasChildren(['seed', 'status', 'appVersion'])"
        },

        "players": {
          "$uid": {
            ".write": "auth != null && $uid === auth.uid",
            ".validate": "newData.hasChildren(['name'])"
          }
        },

        "rounds": {
          "$index": {
            "answers": {
              "$uid": {
                ".write": "auth != null && $uid === auth.uid && !data.exists()",
                ".validate": "newData.hasChildren(['correct'])"
              }
            },
            "winner": {
              ".write": "auth != null && !data.exists()",
              ".validate": "newData.isString()"
            },
            "startedAt": {
              ".write": "auth != null && !data.exists()"
            }
          }
        }
      }
    }
  }
}
```

These rules enforce:

- Only signed-in devices can read or write, and only inside a room whose code
  they already know.
- A player may write **only their own** entry and their own answer, and cannot
  change an answer once submitted.
- `winner` and `startedAt` can be claimed once and never overwritten. **This is
  what makes the buzzer fair** — the first correct answer wins and no later
  write can steal it.
- Writes to an expired room are rejected.

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

## Turning online play off

Set `FF.FirebaseConfig = null;` again. The button disappears and the app makes
no network requests at all — back to the fully offline game.

## Costs

Each round sends a few hundred bytes. No questions, flags or images ever cross
the network: every device generates the same questions locally from a shared
random seed, so only the answers travel. The Spark free tier's limits are far
beyond family use. Rooms expire after 6 hours.

## Troubleshooting

| Symptom | Cause |
|---|---|
| No PLAY TOGETHER button | Config still `null`, or the `apiKey` is malformed. Run `FF.Net.configured()` in the console. |
| "Could not reach Firebase" | No internet, or the CDN is blocked. |
| `auth/unauthorized-domain` | `demo.brightappsoft.com` is not in Authorised domains (step 4). |
| "Permission denied" in the console | Rules were not published, or Anonymous sign-in is still off. |
| Players see different questions | A device is running a cached old version. Hard-refresh it; the version guard should catch this and prompt. |
| Everything works locally but not deployed | You forgot to upload `firebase-config.js` — it is git-ignored. |
