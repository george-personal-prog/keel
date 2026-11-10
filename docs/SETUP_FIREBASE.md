# Setting up cloud backup (Firebase, free)

About 10 minutes, all in a web browser. Free (Spark plan): no card needed.

## 1. Create the project
1. Go to **https://console.firebase.google.com** and sign in with the Google account you want your backup in.
2. Click **Create a project** (or **Add project**).
3. Name it `keel`. Firebase shows a project ID underneath (e.g. `keel-4f2a1`): note it.
4. Turn **off** "Enable Google Analytics for this project". Click **Create project**, wait, then **Continue**.

## 2. Turn on Google sign-in
1. Left menu: **Build → Authentication** → **Get started**.
2. **Sign-in method** tab → **Google** → switch **Enable** on.
3. Pick your email under "Support email for project" → **Save**.
4. Still in Authentication: **Settings** tab → **Authorized domains** → **Add domain** → type `george-personal-prog.github.io` → **Add**.

## 3. Create the database
1. Left menu: **Build → Firestore Database** → **Create database**.
2. Location: **europe-west2 (London)** → **Next**.
3. Choose **Start in production mode** → **Create**. (Production mode = locked; Keel's rules then allow only you.)

## 4. Register the web app
1. Click the gear icon (top left) → **Project settings**.
2. Under **Your apps**, click the web icon **`</>`**.
3. Nickname `keel`. Tick **Also set up Firebase Hosting for this app**. Click **Register app**.
4. You'll see a code block starting `const firebaseConfig = {`. **Copy that block and paste it to Claude.** (These values are public identifiers, not passwords: safe to share and to put in the public repo.)
5. Click **Next** through the remaining steps (no need to run the commands shown) → **Continue to console**.

## 5. Let Claude deploy (one command)
Claude will ask you to run this in the Terminal and approve the Google sign-in it opens:

```
npx firebase-tools login
```

Claude then publishes the database rules and the app to `https://<project-id>.firebaseapp.com`.

## 6. Install from the Firebase address
On the iPhone, open `https://<project-id>.firebaseapp.com` in Safari → **Share** → **Add to Home Screen**.
Then **Settings → Cloud backup → Sign in with Google** inside the app.

Why the Firebase address? On an installed iPhone app, Google sign-in only works when the app is served from the same domain as Firebase's sign-in page. GitHub Pages keeps working as a mirror (without sign-in on iPhone).

### Moving from a GitHub Pages install
If you already used the GitHub Pages version: **Settings → Export backup (JSON)** there, then in the new app **Settings → Restore from a backup file…** (or just sign in to cloud backup on the old one first and it carries across).
