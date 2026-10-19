# AGENTS.md

## Purpose

- Own the Claude Design handoff bundle for the app's visual direction and prototype references.

## Ownership

- [README.md](README.md) is the bundle entrypoint.
- [chats/chat1.md](chats/chat1.md) records the user/design-assistant conversation.
- [project/Hi-Fi.html](project/Hi-Fi.html) is the primary high-fidelity prototype reference.
- [project/hifi/components.jsx](project/hifi/components.jsx) and [project/hifi/screens.jsx](project/hifi/screens.jsx) contain supporting prototype components and screens.

## Local Contracts

- For UI/design implementation work, read [README.md](README.md), the relevant chat transcript, and [project/Hi-Fi.html](project/Hi-Fi.html) before porting visuals.
- Prototype files are HTML/CSS/JS/JSX references; recreate the output in the production React Native architecture instead of copying prototype internals blindly.
- Do not render or screenshot prototype files unless the user asks; inspect source first.

## Work Guidance

- Preserve the visual intent while adapting to app tokens, RTL behavior, and production components under [../../src/AGENTS.md](../../src/AGENTS.md).
- If design intent conflicts with production accessibility, notification, i18n, or routing contracts, follow the source-code DOX chain and surface the tradeoff.

## Verification


## Child DOX Index

- No child AGENTS.md files.
