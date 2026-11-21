# promptpipe

An Android chat app on top of the AI web chats you already use (DeepSeek, Qwen, …) and
OpenAI-style APIs. You log in to a site once inside the app; promptpipe sends your messages
there, reads the replies, runs them through your plugins, and keeps every chat as a Markdown file
on your phone with its history in git. Other apps on the phone can use it as a local
OpenAI-style API.

This branch is the remake; how it's built is in `design/` (on the design branch). How to use it
is in [the quick start](app/src/main/assets/docs/QUICKSTART.md), and how to extend it is in [the
plugin guide](app/src/main/assets/docs/PLUGINS.md).

## How it fits together

- **The core** (`core/`, Odin): one small local server the app starts. It reads and writes files
  under named roots with a check against outside changes, serves the screen and the plugins
  (checking each installed plugin's files), checks the catalogue's signature, and answers the
  local API (`/v1`).
- **The platform** (`app/src/main/java/`, Kotlin): Android itself. Site pages in GeckoView,
  credentials in the Android Keystore (sent only to their hosts, never shown to plugins), git
  (JGit), the file picker, sharing, the clipboard, the background service.
- **The loader** (`app/src/main/assets/ui/`): the one route between all of them. It holds the
  app's single State and loads the plugins.
- **The page side** (`app/src/main/assets/ppext/`): runs in each site's page, but only the code
  the app hands it, never code from the website.
- **The plugins** (the promptpipe-plugins repository): the application itself (`runtime-*`,
  including the screen) and everything optional. The APK ships the ones its catalogue marks
  built in.

## Building

On an arm64 phone (Termux) or a computer with odin, clang and lld, JDK 17, Gradle and the
Android SDK with an NDK; promptpipe-plugins checked out next to this repository:

```sh
sh scripts/build.sh 1.0.0 100            # a test build, signed with debug.keystore
sh scripts/keys_make.sh                  # once: the release key and the catalogue's keys
sh scripts/build.sh 1.0.0 100 release    # a release build
```

The version code must never go down. `keys_make.sh` prints what to keep in your password manager;
see the plugins repository's `scripts/catalogue_sign.py` for signing the catalogue.

## Checks

- `odin build core -out:build/ppcore && python3 core/test/test_core.py build/ppcore`: the core
  over real HTTP (files and outside changes, plugin hashes, the catalogue's signature, the local
  API).
- In promptpipe-plugins, `npm test`: the application without a phone, and the screen and the
  site routine in Chromium.
