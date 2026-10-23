// Builds database.rules.json: run  node tools/gen-rules.js  after editing. Shared expressions are named once here.
const fs = require('fs');
const OUT = require('path').resolve(__dirname, '..', 'database.rules.json');

const ADMIN = "auth != null && root.child('admins').child(auth.uid).val() === true";
const ACCOUNT = "auth != null && auth.token.firebase.sign_in_provider !== 'anonymous'";
const NOT_BANNED = "!root.child('bans').child(auth.uid).exists()";
const COUNTER = "newData.isNumber() && newData.val() === (data.exists() ? data.val() : 0) + 1";
const ID = "/^[A-Za-z0-9_-]{1,40}$/";
const RESULT = "newData.hasChildren(['name', 'score', 'correct', 't']) && newData.child('name').isString() && newData.child('name').val().length <= 40 && newData.child('score').isNumber() && newData.child('score').val() >= 0 && newData.child('score').val() <= 1500 && newData.child('correct').isNumber() && newData.child('correct').val() >= 0 && newData.child('correct').val() <= 10";

const counterNode = (nameCheck) => ({
  ".write": "auth != null",
  ".validate": COUNTER + (nameCheck ? ' && ' + nameCheck : '')
});

const rules = {
  rules: {
    admins: {
      "$uid": { ".read": "auth != null && auth.uid === $uid" }
    },
    bans: {
      ".read": ADMIN,
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": ADMIN,
        ".validate": "newData.hasChildren(['t']) && newData.child('t').isNumber()"
      }
    },
    config: {
      ".read": true,
      ".write": ADMIN,
      games: {
        "$id": {
          ".validate": "$id.matches(" + ID + ")",
          enabled: { ".validate": "newData.isBoolean()" },
          guest: { ".validate": "newData.isBoolean()" },
          tier: { ".validate": "newData.isString() && newData.val().matches(/^(free|limited|premium)$/)" },
          freePlays: { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100" },
          badge: { ".validate": "newData.isString() && newData.val().matches(/^(new|hot)$/)" },
          "$other": { ".validate": false }
        }
      },
      site: {
        maintenance: { ".validate": "newData.isBoolean()" },
        announcement: { ".validate": "newData.isString() && newData.val().length <= 200" },
        guest: {
          "$feature": { ".validate": "newData.isBoolean() && $feature.matches(/^(online|daily|challenge|gameNight)$/)" }
        },
        "$other": { ".validate": false }
      }
    },
    stats: {
      ".read": ADMIN,
      players: {
        ".read": true,
        ".write": ACCOUNT,
        ".validate": COUNTER
      },
      // Numbers guests (Guest001, ...). Read so a device can learn its number.
      guestSeq: {
        ".read": "auth != null",
        ".write": "auth != null",
        ".validate": COUNTER
      },
      totals: {
        "$counter": counterNode("$counter.matches(/^(plays|onlinePlays|guestPlays|signups|installs|rooms)$/)")
      },
      days: {
        ".indexOn": [],
        "$day": {
          ".validate": "$day.matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)",
          games: { "$game": counterNode("$game.matches(" + ID + ")") },
          onlineGames: { "$game": counterNode("$game.matches(" + ID + ")") },
          active: {
            "$uid": {
              ".write": "auth != null && auth.uid === $uid",
              ".validate": "newData.isString() && newData.val().matches(/^(u|g)$/)"
            }
          },
          // One random id per device per day (js/visit.js); no sign-in needed, add once only.
          visitors: {
            "$vid": {
              ".write": "!data.exists()",
              ".validate": "$vid.matches(/^[a-f0-9]{24}$/) && newData.isString() && newData.val().matches(/^(l|a|p)$/)"
            }
          },
          "$counter": counterNode("$counter.matches(/^(plays|onlinePlays|guestPlays|signups|installs|rooms)$/)")
        }
      }
    },
    userIndex: {
      ".read": ADMIN,
      ".indexOn": ["lastSeen", "createdAt", "username", "plays"],
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        // The owner keeps it current; admins fill in accounts from before the list existed.
        ".write": "(" + ACCOUNT + " && auth.uid === $uid) || (" + ADMIN + ")",
        ".validate": "newData.hasChildren(['displayName', 'lastSeen'])",
        username: { ".validate": "newData.isString() && newData.val().length <= 20" },
        displayName: { ".validate": "newData.isString() && newData.val().length <= 40" },
        avatar: { ".validate": "newData.isString() && newData.val().length <= 60" },
        createdAt: { ".validate": "newData.isNumber()" },
        lastSeen: { ".validate": "newData.isNumber() && newData.val() <= now + 60000" },
        plays: { ".validate": "newData.isNumber() && newData.val() >= 0" },
        installed: { ".validate": "newData.isBoolean()" },
        provider: { ".validate": "newData.isString() && newData.val().length <= 20" },
        "$other": { ".validate": false }
      }
    },
    guestIndex: {
      ".read": ADMIN,
      ".indexOn": ["lastSeen", "firstSeen", "plays"],
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid",
        ".validate": "newData.hasChildren(['name', 'lastSeen'])",
        name: { ".validate": "newData.isString() && newData.val().length <= 40" },
        number: { ".validate": "newData.isNumber() && newData.val() >= 1" },
        avatar: { ".validate": "newData.isString() && newData.val().length <= 60" },
        firstSeen: { ".validate": "newData.isNumber()" },
        lastSeen: { ".validate": "newData.isNumber() && newData.val() <= now + 60000" },
        plays: { ".validate": "newData.isNumber() && newData.val() >= 0" },
        installed: { ".validate": "newData.isBoolean()" },
        "$other": { ".validate": false }
      }
    },
    daily: {
      "$day": {
        ".read": ACCOUNT,
        ".indexOn": ["score"],
        ".validate": "$day.matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)",
        "$uid": {
          ".write": ACCOUNT + " && auth.uid === $uid && " + NOT_BANNED + " && !data.exists()",
          ".validate": RESULT
        }
      }
    },
    challenges: {
      "$id": {
        ".read": ACCOUNT,
        ".validate": "$id.matches(/^[a-z0-9]{6,24}$/)",
        "$uid": {
          ".write": ACCOUNT + " && auth.uid === $uid && " + NOT_BANNED + " && !data.exists()",
          ".validate": RESULT
        }
      }
    },
    users: {
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || root.child('admins').child(auth.uid).val() === true)",
        ".write": ACCOUNT + " && auth.uid === $uid && " + NOT_BANNED,
        profile: {
          ".validate": "newData.hasChildren(['username', 'displayName']) && newData.child('displayName').isString() && newData.child('displayName').val().length <= 40"
        },
        data: {
          "$key": {
            ".validate": "newData.hasChildren(['v', 't']) && newData.child('v').isString() && newData.child('v').val().length < 200000 && newData.child('t').isNumber()"
          }
        }
      }
    },
    usernames: {
      ".read": ADMIN,
      "$name": {
        ".read": true,
        ".write": ACCOUNT + " && (!data.exists() || data.child('uid').val() === auth.uid) && (!newData.exists() || newData.child('uid').val() === auth.uid)",
        ".validate": "$name.matches(/^[a-z0-9_.]{3,20}$/) && newData.hasChildren(['uid']) && (!newData.hasChild('email') || newData.child('email').val() === auth.token.email)"
      }
    },
    rooms: {
      ".read": ADMIN,
      "$code": {
        ".read": "auth != null",
        meta: {
          ".write": "auth != null && " + NOT_BANNED + " && (!data.exists() || data.child('hostUid').val() === auth.uid || root.child('rooms').child($code).child('players').child(data.child('hostUid').val()).child('online').val() !== true)",
          ".validate": "newData.hasChildren(['seed', 'status', 'appVersion'])"
        },
        players: {
          "$uid": {
            ".write": "auth != null && $uid === auth.uid && " + NOT_BANNED,
            ".validate": "newData.hasChildren(['name'])"
          }
        },
        rounds: {
          ".write": "auth != null && !newData.exists() && root.child('rooms').child($code).child('meta').child('hostUid').val() === auth.uid",
          "$index": {
            startedAt: { ".write": "auth != null && !data.exists()" },
            winner: { ".write": "auth != null && !data.exists()", ".validate": "newData.isString()" },
            answers: {
              "$uid": {
                ".write": "auth != null && $uid === auth.uid && !data.exists()",
                ".validate": "newData.hasChildren(['correct'])"
              }
            }
          }
        },
        voice: {
          "$uid": { ".write": "auth != null && $uid === auth.uid" }
        },
        signals: {
          "$to": {
            ".write": "auth != null && $to === auth.uid && !newData.exists()",
            "$from": {
              ".write": "auth != null && $from === auth.uid",
              "$id": {
                ".write": "auth != null && ($from === auth.uid || ($to === auth.uid && !newData.exists()))"
              }
            }
          }
        }
      }
    }
  }
};

// .indexOn with an empty list is not allowed; drop it.
delete rules.rules.stats.days['.indexOn'];
fs.writeFileSync(OUT, JSON.stringify(rules, null, 2) + '\n');
console.log('wrote', OUT);
