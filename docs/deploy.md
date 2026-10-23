# Deploying PlayMona

Every push to `main` on GitHub deploys playmona.com automatically
(`.github/workflows/deploy.yml`). The workflow:

1. runs the tests (`node tools/test/run.js`) and stops if any fail;
2. renames the service worker cache to `playmona-<commit>`, so players get the new files;
3. copies the site to the VPS with `rsync` over SSH, sending only changed files and
   removing files that were deleted from the repo;
4. optionally publishes `database.rules.json` to Firebase.

You can also run it by hand: GitHub → **Actions** → **Deploy** → **Run workflow**.
Progress and errors show on the same page.

The server keeps its own copy of `js/net/firebase-config.js` (it is not in git). The
deploy never overwrites or deletes it, nor `uploads/`, `api/config.local.php`,
`.well-known/` (SSL certificate checks) or a folder called `keep/`.

> **Before the first deploy:** anything else in the web root that is not in the repo
> gets **deleted**. List the folder on the server (`ls -la /var/www/playmona`) and move
> anything you need to keep into `keep/`, or out of the web root.

---

## One-time setup

### 1. A deploy user and key on the VPS

On the server (as root or with sudo). Replace `/var/www/playmona` with your web root:

```bash
adduser --disabled-password --gecos "" deploy
chown -R deploy:www-data /var/www/playmona
mkdir -p /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
```

On your own computer, make a key just for deploys (no passphrase):

```bash
ssh-keygen -t ed25519 -f playmona_deploy -N "" -C "github-deploy"
```

Put the **public** key on the server:

```bash
cat playmona_deploy.pub >> /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys && chown -R deploy:deploy /home/deploy/.ssh
```

Make sure `rsync` is installed on the server: `apt install rsync`.

Test from your computer: `ssh -i playmona_deploy deploy@YOUR_SERVER_IP ls /var/www/playmona`

### 2. GitHub secrets

GitHub → the `playmona` repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `SSH_HOST` | Server IP or host name |
| `SSH_USER` | `deploy` |
| `SSH_KEY` | The whole **private** key file `playmona_deploy`, including the BEGIN/END lines |
| `SSH_PATH` | Web root, e.g. `/var/www/playmona` |
| `SSH_PORT` | Only if SSH is not on port 22 |
| `SSH_KNOWN_HOSTS` | Recommended: the output of `ssh-keyscan -H YOUR_SERVER_IP`, so the workflow refuses an impostor server |
| `FIREBASE_SERVICE_ACCOUNT` | Optional, see step 4 |

Delete the private key from your computer once it is saved in GitHub (or keep it somewhere safe).

### 3. nginx: clean URLs and caching

PlayMona uses addresses without file extensions: `/play`, `/privacy`, `/admin`.
In the `server { … }` block for playmona.com:

```nginx
root /var/www/playmona;
index index.html;

location / {
    # Old links ending in .html move to the clean address (keeps #room=… codes).
    if ($request_uri ~ ^/index\.html(\?.*)?$) { return 301 /$1; }
    if ($request_uri ~ ^/(.+)\.html(\?.*)?$)  { return 301 /$1$2; }
    try_files $uri $uri.html $uri/ =404;
}

# Pages and the service worker must always be checked for a new version.
location ~ ^/(sw\.js|manifest\.webmanifest)$ {
    add_header Cache-Control "no-cache";
}
location = /play    { add_header Cache-Control "no-cache"; try_files /play.html =404; }
location = /privacy { add_header Cache-Control "no-cache"; try_files /privacy.html =404; }
location = /        { add_header Cache-Control "no-cache"; try_files /index.html =404; }

# The admin portal stays out of search engines.
location = /admin {
    add_header Cache-Control "no-cache";
    add_header X-Robots-Tag "noindex, nofollow";
    try_files /admin.html =404;
}

# Files people upload (profile pictures, from phase 2) are never run as code.
location ^~ /uploads/ {
    location ~ \.php$ { deny all; }
}
```

Phase 2 adds an `/api/` block for PHP. It will use clean addresses too
(`/api/checkout`, never `/api/checkout.php`).

Check and reload: `nginx -t && systemctl reload nginx`.

### 4. Optional: publish database rules automatically

Without this, paste `database.rules.json` into Firebase console → Realtime Database →
Rules → Publish whenever it changes.

To automate it: Firebase console → ⚙ Project settings → **Service accounts** →
**Generate new private key**. Save the whole JSON file as the `FIREBASE_SERVICE_ACCOUNT`
secret. The workflow then publishes the rules on every deploy (project `family-fun-game`,
set in `.firebaserc`).

---

## Previewing locally

```bash
node tools/serve.js
```

It serves http://localhost:8960 with the same clean URLs as the live site.
