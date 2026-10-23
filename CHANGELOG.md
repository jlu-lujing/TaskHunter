# Changelog

<!-- Legacy copy for app versions up to 1.22.1, which fetch this file for their update notes. Generated from changelog/*.md while it exists; delete it after 2026-09-19 and nothing will recreate it. -->

## [2.0.2] - 2026-09-26

### Improvements

- **Chat: compaction and shell commands read like the rest of the turn.** Compaction is one collapsible row with the summary inside, and shell runs look like any other tool row.
- Sidebar: a project whose folder is missing is marked, so you can see why it won't open.
- Settings: Claude Code can be the small model for titles and commit messages.
- Models: the model picker stays fast with long provider lists.
- Models: context limits in model details match what OpenCode really uses.
- Chat: the retry countdown shows again while OpenCode waits to retry a request.
- Chat: the session goal strip sits on glass over the conversation.

### Fixes

- Startup: the app opens even when the last project's folder was deleted or moved.
- Chat: answers typed into a question form survive switching to another session and back.
- Agents: agents added by plugins show up in the composer without a reload (thanks to @hiro-nikaitou).
- Chat: reverting to a message or forking brings its attached context along (thanks to @hiro-nikaitou).
- Settings: edits to AGENTS.md made in another editor show up, and saving no longer overwrites them.
- Config: a global `opencode.jsonc` is picked up.
- Worktrees: the provider and agent lists in a worktree session match that worktree's config.
- Sessions: an archived session no longer shows up as still replying (thanks to @aiiibolo).
- Models: a Fast model variant is picked correctly (thanks to @hiro-nikaitou).
- Small model: background titles and commit messages keep working while plugins are still loading after startup.
- Chat: long identifiers in Markdown tables stay on one line when there is room and wrap when there isn't (thanks to @aiiibolo).
- Chat: a dollar sign in regular text no longer turns the rest of the line into math (thanks to @hiro-nikaitou).
- Chat: context chip preview actions stay inside the chat area (thanks to @aiiibolo).
- Chat: the actions for a reverted message stay visible on narrow screens.
- Chat: the stray scrollbar next to the send button is gone.
- Mobile: the trust dialog shows above the worktree sheet (thanks to @ChangeHow).
- Mobile: browser control works over the private relay (thanks to @aiiibolo).
- Mobile: sending over the private relay no longer fails on a slow connection.
- SSH: managed remote hosts find npm installed through nvm.

## [2.0.1] - 2026-09-24

### New

- **Diff: file tree mode.** A toolbar toggle turns the diff view into a file tree with one file open at a time, which makes large change sets easy to walk through. Alt+Up/Down moves between files.
- **Chat: comments stay on the reply.** Text you quote into a comment stays highlighted in the reply; hover or tap it to edit or remove the comment, and the quote chip scrolls back to it.
- **Chat: `/fork` with a message.** Type `/fork your message` to branch the session from its last finished reply and send the message into the new session right away. A reply that is still running keeps going in the original.
- Settings/About: the phone app shows About again, with separate buttons to update OpenChamber on the computer it's connected to and to update OpenCode. When the server can't update itself, About shows the command to run.
- Settings/Sessions: a new switch keeps an idle session's prompt cache warm with small background requests, so coming back to it later costs less.
- Mobile: the Files browser has an upload button that puts files into the folder you're looking at.
- Sidebar: sessions where the agent left something for you to pick up show a small next-step icon; hover it to read the suggested next step.
- Settings/OpenCode: a Restart OpenCode button, also in the command palette, for when a plugin or config change needs a restart.
- Sidebar: a Sort worktrees choice (Manual, Recent activity, A to Z). Manual is the default, so worktrees no longer jump around while sessions run.
- Notifications: OpenCode plugins and agents can send you an OpenChamber notification, for example when a long task is done.

### Improvements

- Git: the changes tree reads like a real tree, with collapsible folders, indent guides and file names only.
- Chat: the selection menu (Comment, By the way, Add to notes) follows the selected text while you scroll.
- Browser: agent browser actions go to the tab they were meant for and no longer replace the page you're looking at.
- Chat: long code blocks stay smooth while they stream, with far less CPU spent redrawing them (thanks to @deatheros).
- Chat: a fork shows up right away on your other open devices.
- Settings/Agents: agents that come from OpenCode or a plugin show their description and prompt as grey hints on the edit page.
- Models: the model info panel and the capability icons in Settings/Providers now show for models from custom providers.
- Chat: forks keep the session's goal, paused, so you decide whether the fork should pursue it too.
- Agents: pickers show an agent's display name.
- Startup: when OpenChamber can't finish starting, the screen says what failed and shows the error.
- Chat: the "did not start a reply" card has a Show OpenCode status button that works on every device.
- Settings/MCP: Code Mode has a Default choice that lets OpenCode decide per server.

### Fixes

- **Skills:** starting a message with `/skill-name` runs the skill again, no more "Command not found" error (thanks to @XiaChuerwu).
- **Skills:** Settings/Skills lists every skill OpenCode has, including skills in symlinked folders and Windows junctions, and built-in skills stay read-only (thanks to @aiiibolo and @hiro-nikaitou).
- Settings/Web search: picking a provider saves again.
- Chat: subagent rows show live activity again when you open or reload a session mid-run.
- Chat: the suggested next message shows up again after a reply.
- Startup: a project with a broken OpenCode config no longer blocks the app; a notice shows the file and the error, and other projects keep working.
- Chat: `@name` handles and emails in a message no longer turn into missing file attachments that failed the whole message (thanks to @hdp01).
- Chat: the "OpenCode did not start a reply" card no longer sticks on web and remote connections when the reply did arrive.
- Chat: "By the way" works on Windows, where the panel used to close without starting.
- iOS/Android: selecting lines to comment on in Files no longer hides the comment bar under the system copy/paste menu or the keyboard.
- Settings/Providers: editing a custom provider keeps its protocol, its API key variable and its reasoning levels as you configured them.
- Settings/About: after updating OpenCode and reloading, About shows the new version without reopening the page.
- Startup: connecting to an OpenCode 1.x server shows a clear "update OpenCode to 2.x" screen.
- Mobile: switching projects resets the Files browser to the new project (thanks to @ChangeHow).
- Chat: file mentions with spaces in the path attach the whole file.
- Chat: clicking a file link in a reply opens the file, no stray window or theme change (thanks to @aiiibolo).
- Browser: agents stop trying OpenCode's own browser tools, which never worked in OpenChamber, and use the built-in browser.
- Providers: GitHub Copilot and other known providers show their own logo (thanks to @aiiibolo).
- Usage: Kimi usage shows for the Kimi Code plan login (thanks to @bradywatkinson).
- Git: the branch walkthrough compares against the right base for branches checked out from a remote.
- Sessions: sessions you deleted no longer come back after a restart.
- Windows: ARM64 machines get the native OpenCode build and can update OpenCode again.

### SDK

- Status sections: use `contributes.statusSection` to add a section to the Work Status panel, sized with `host.setHeight`.
- Surfaces: input batches now carry `x-surface-viewer` and `x-surface-frame-seq`, so a service knows which viewer and frame an input came from, and docked pages can resize.

### Misc

- Bundled OpenCode updated to 2.0.16.

## [2.0.0] - 2026-09-23

### New

- **OpenCode 2:** OpenChamber now runs on OpenCode 2. Skills, agents, commands, MCP servers, plugins and settings apply the moment you save them, even in a session that is already running, with no OpenCode restart. [Read the story on our blog](https://openchamber.dev/blog/opencode-v2/).
- **Code Mode:** the agent can call your MCP tools and the tools your plugins add from one short script, so a multi-step lookup takes one step and far less context. The chat shows a Script row with every call it made, and you can turn it off per MCP server in Settings.
- **Stats:** a bar-chart button at the bottom of the sidebar opens your usage over time: sessions, prompts, tokens, cost, active days, daily activity and a breakdown by model, for any range and project.
- Web search: results show as cards with the site, title, date and snippet, the first-use provider question has its own card, and Settings has a Web search page for the provider and its keys.
- Settings/MCP: sign in to remote MCP servers that use OAuth, see why a server asks for authorization, and choose its protocol version and OAuth metadata URL.
- Settings/Plugins: each plugin shows whether OpenCode actually loaded it, with the error when it didn't, and plugins without a pinned version can be updated.
- Settings/Providers: custom provider models can list reasoning levels, which you then pick in the model selector.
- Settings/Providers: OpenCode Go can be connected by signing in to the OpenCode Console.
- Chat: fork a session from an agent answer, or start a new session or multi-run from it.
- Sidebar: a Timeline view lists recent sessions from every project in one chronological list. Switch between Grouped and Timeline in the display menu at the top of the sidebar.
- Extensions as the agent's browser: an installed extension can stand in for the agent's browser, with a Browser provider dropdown in Settings and a live picture in the rail that you can click to take over and hand back to the agent.
- File previews: play audio and video, browse CSV tables, inspect fonts, and view diagrams directly in the files panel.
- Files: upload files from a folder's menu or the file tree toolbar, including photos and files from your phone.
- Files: the agent can open a generated file in the app for you to inspect.
- Sidebar: an empty project group has a button to start a session in it.
- Themes: new built-in Cursor and Osaka Jade Refined palettes.

### Improvements

- Chat: writing `/skill` anywhere in a message loads that skill with the message every time, including when you steer a running turn.
- Chat: permission requests say in plain words what the agent wants to do and where, and "Always" names exactly what it will allow.
- Chat: permission requests and forms appear above the message box, and forms walk through their questions one step at a time.
- Memory: agents save what they learn without being asked to "remember", memory reaches review, multi-run and scheduled sessions, and agents stop re-reading the same entries every turn.
- Chat: the model name and context meter are right from the start of a turn.
- Settings: the theme picker is searchable, and settings dropdowns share one width and cut long values cleanly.
- Themes: softer text and borders in the built-in dark themes.
- Mobile: selected-text comments use the composer, with a quote preview and attachment controls; rejected comments keep their draft (thanks to @ChangeHow).
- Sessions: optional animated activity indicators show running sessions across lists, Timeline, tabs, and switchers (thanks to @mattv8).
- Sessions: the session list opens faster and scrolls smoothly through long lists.
- Sessions: idle chats and the work status panel use less memory.
- Reviews: new review sessions inherit the current session's permission auto-accept setting.
- Desktop: the app opens faster, the window shows up right away.
- Mobile: start a new chat directly from the Chats section of the session list.
- Mobile: opening the branch picker keeps the keyboard closed until you search.

### Fixes

- Sessions: a session whose subagents are still working stays marked as running, and the ready notification, queued messages and auto-review wait for them.
- Sessions: archiving or restoring a session keeps its title.
- Sidebar: renaming a session or updating its notes no longer moves it to the top of the list.
- Chat: the subagent link on a task card works as soon as the subagent starts.
- Chat: Git status and diffs refresh after agent edits, shell commands and failed patches.
- Chat: edit and patch rows show their added and removed line counts again.
- Settings/Agents: editing the built-in build or plan agent no longer turns it into a subagent that disappears from the picker.
- Web: a public tunnel won't start until a UI password is set.
- Startup: with OpenCode 1.x installed, the app shows a screen to update to OpenCode 2, with one-click install on macOS, Linux and Windows.
- Desktop: you can switch instances from the startup recovery screen, and dialogs respond to clicks near the window's title bar.
- Sessions: the sidebar lists recover after a failed first load.
- Windows: session lists page correctly beyond the first page (thanks to @XiaChuerwu).
- Sidebar: Recent rows in a worktree show the branch and pull request in their tooltip (thanks to @bashrusakh).
- Chat: an agent no longer refuses to send a prompt or remember something you explicitly asked for.
- Chat: agent browser tabs open in the background without taking over the side panel.
- Mobile: Enter adds a new line; buttons and external-keyboard Ctrl/Cmd+Enter send the message (thanks to @ChangeHow).
- Mobile: selecting chat text no longer opens the sessions or workspace drawer by accident (thanks to @ChangeHow).
- Web: switching sessions with two browser tabs open no longer stalls when live updates fall back to HTTP streaming (thanks to @TheUnlimited64).
- Sessions: renaming, sharing, and archiving worktree sessions use the correct folder, and failed actions show the reason.
- Sessions: restored sessions from deleted worktrees remain visible in their project and move to the top after restoration (thanks to @mattv8).
- Dictation: long recovered transcripts scroll within the composer, keeping Retry, Discard, and Insert visible (thanks to @karimodm and @Tobias-Conrad).
- Mobile: the searchable Settings project picker keeps every project reachable, even in long lists (thanks to @tomzx).
- Git: collapsed unchanged lines expand in pull request comparisons, including files from forks.
- Git: reusing a branch name no longer shows an unrelated old pull request as merged.
- Small Model: ChatGPT sign-in resolves the available Codex Luna model for background tasks.
- Files: previews of files outside the open folder load in browser and remote sessions.
- Files: relative images and links work in Markdown previews, and heading links scroll within the document.
- Chat: an explicit Steer stays a steer after dismissing blockers (thanks to @JustinKeltner).
- Chat: approval cards show file changes that were missing from the preview.
- Chat: comment quote previews fill the available width, and comment highlighting is translucent again.
- Chat: message image export works when a message links to an external page (thanks to @ChangeHow).
- Chat: the timeline popup scrollbar stays clickable while messages load.
- Mobile: Settings help icons respond to taps.
- Mobile: session rows keep their order and branch labels while the sessions drawer closes.
- Startup: when OpenCode fails to start, the app shows what went wrong.
- Desktop: pairing import failures say what actually went wrong, and SSH forms keep focus after confirmations.
- Server: shutting down stops extension services cleanly (thanks to @ICEY16360).

### SDK

- Services can declare `service.provides: ["browser"]` to answer the agent's browser actions and `service.surface: true` to show a live picture users can take over and hand back.

### Misc

- Requires OpenCode 2.0.15 or newer; the desktop app bundles it. Sessions from OpenCode 1.x carry over.
- OpenCode 2 reads project instructions from `AGENTS.md` and no longer loads `CLAUDE.md`.
- Settings/Behavior: the system prompt optimization option is removed, because OpenCode 2 has no way for a plugin to shorten the system prompt.

## [1.24.2] - 2026-09-18

### New

- Sessions: collapsed folders and groups show when an agent is waiting for permission or an answer.

### Improvements

- Diff: click a collapsed section to load and reveal surrounding lines for that file, with a loading indicator while you wait.
- Interface: widen the side panel to use more of a large screen while keeping the chat visible.

### Fixes

- **Startup:** opening the app no longer starts MCP servers and background work for every saved project and worktree, preventing runaway memory use (thanks to @knorby).
- **Desktop/SSH:** reconnecting reuses the running remote server, preventing duplicate servers from piling up and exhausting memory (thanks to @yulia-ivashko).
- Chat: malformed Markdown stays readable as plain text without crashing the chat.
- Chat: switching agents respects each agent's pinned model and thinking level (thanks to @maxiedaniels).
- Chat: context usage reflects the model that wrote the latest answer.
- Chat: fixes empty replies and provider errors with OpenChamber tools on affected OpenAI-compatible services (thanks to @mobileka).
- Chat: queued messages resume after a server restart even if the previous reply was interrupted (thanks to @JustinKeltner).
- Chat: session titles and summaries work again with GLM on OpenCode Go, Groq, and other affected providers (thanks to @yulia-ivashko).
- Sessions: Rename closes the session menu and opens the name field again (thanks to @karimodm).
- Chats: sessions stay visible when macOS reports different capitalization for the same home folder (thanks to @yulia-ivashko).
- Dictation: switching sessions during transcription keeps the text as a draft in the original session (thanks to @karimodm).
- Multi-run: Run fusion works with OpenRouter models and renamed sessions, and separate launches keep their own groups (thanks to @yulia-ivashko).
- Git: stalled Git commands no longer leave the changes panel stuck or lingering Git processes on Windows.
- Git: repositories rooted at your home folder or drive root are ignored, preventing accidental whole-disk scans.
- Git: staging and unstaging preserve the file's added and removed line counts (thanks to @Naputt1).
- Diff: open file diffs refresh after agent edits even when the added and removed line counts stay the same.
- Worktrees: Enter creates a worktree once from the branch or directory field; confirming text with an input method doesn't create it early.
- Mobile/iOS: the keyboard, message box, and chat move together when opening or closing the keyboard, removing sudden jumps.
- Mobile: resizing across phone and tablet layouts preserves the open file and unsaved edits (thanks to @yulia-ivashko).
- Desktop/Windows and Linux: installing an update no longer exits early and reopens the old version (thanks to @yulia-ivashko).
- Terminal: programs on macOS and Linux get time to finish when the server shuts down or the desktop app quits, restarts, or updates (thanks to @yulia-ivashko).
- Desktop: terminals connect to password-protected remote servers when the connection uses custom headers (thanks to @yulia-ivashko).
- Server: agent controls for sessions, the browser, and memory work when the server listens on a specific IP address (thanks to @yulia-ivashko).
- Docker: fixes startup permission errors and rebuild failures involving built-in extensions (thanks to @yulia-ivashko).
- Chat: math formulas use the correct KaTeX fonts (thanks to @Dawnfz-Lenfeng).
- Themes: Catppuccin dark and light consistently use the Mocha and Latte palettes (thanks to @gbPagano).

### Misc

- Installation: npm installs no longer show dependency compatibility and deprecated-package warnings.

## [1.24.1] - 2026-09-18

### New

- Chat: attach files and images to `/btw` messages through the file picker, paste, or drag and drop.
- Mini Chat: use installed extensions from a message's action menu.

### Improvements

- **Sessions:** large session lists open faster and use less memory, with smoother scrolling across projects (thanks to @deatheros).
- **Chat:** lower CPU use while the agent thinks or writes a response (thanks to @deatheros).
- Interface: clearer checkbox and radio outlines, brighter secondary text, and larger labels make controls easier to read.
- Interface: lighter text rendering on macOS.

### Fixes

- Web: instances on different ports stay signed in independently. Existing browser sessions on an explicit port need one fresh sign-in after upgrading (thanks to @jlu-lujing).
- Chat: sending a message no longer briefly flashes "OpenCode did not start a reply".
- Chat: the queue panel starts expanded, remembers your choice across sessions, and leaves the last messages readable above the queue and `/btw` panels.
- Chat: inline `$...$` formulas render correctly, and display formulas with apostrophes or ampersands no longer appear as red errors (thanks to @Dawnfz-Lenfeng).
- Chat: reconnecting mid-response no longer drops part of the streamed text (thanks to @deatheros).
- Git: Commit & Push and Sync publish new branches to the configured push remote and confirm success only when something was pushed (thanks to @IbrahimKhan12).
- Git: staged and unstaged rows show their own added and removed line counts for partially staged files (thanks to @Naputt1).
- Git: large repositories no longer spawn dozens of git processes, and very large untracked folders appear as one folder entry.
- Settings/Usage: Gemini 3.x models such as Gemini 3.1 Pro are included in the initial model selection (thanks to @DeryFerd).
- Mini Chat: the dictation keyboard shortcut now starts voice input.
- Extensions: clicking an option in an extension's dropdown or menu now applies the selection reliably.
- Desktop/SSH: remote setup finds Bun-installed programs in custom cache locations, fixing "installed but no openchamber binary could be found" (thanks to @hdp01).
- Desktop/Linux: the AppImage shows the OpenChamber icon in GNOME's launcher (thanks to @bashrusakh).
- Installation: fresh npm installs include the dependencies needed to start the server (thanks to @presswizards).

### SDK

- Actions: use `mode: "background"` and `host.onAction` to handle message and session actions without opening a panel.
- Extensions: declare `background.entry` to run actions and slash commands on demand. A visible panel and sidebar icon are optional.
- Notifications: `host.toast` now supports `copy`, `dismiss`, and `persistent` options for Copy and OK buttons and notifications that stay until dismissed.

## [1.24.0] - 2026-09-17

### New

- **Extensions:** Add third-party tools to web and desktop, with their own panels, pages, and chat actions. Get started with [using extensions](https://docs.openchamber.dev/extensions/) or [building your own](https://docs.openchamber.dev/sdk/). A catalog of our own and community-made extensions is coming soon to the OpenChamber website (thanks to @AlexKutas).
- **Themes:** Browse VS Code themes from Open VSX or import a theme file in Settings. Choose individual color variants and remove imported themes from the theme picker.
- Projects: Choose a default agent for new chats in each project, including chats in its worktrees (thanks to @MltStephane).
- Files: Keep the file tree open while the editor is closed, so you can browse your project alongside the chat (thanks to @cmdaltctr).

### Improvements

- Desktop: The app window opens much faster.
- Sessions: Sticky sidebar headers now fade smoothly between sections as you scroll, keeping the current section's name and actions within reach.
- Themes: Menu text and selected items are easier to read, and code block backgrounds blend better with the rest of the app.
- Chat: Agent labels and icons use more distinct colors from your theme, making agents easier to tell apart.
- Appearance: The loading screen fades into the app without the logo changing colors between loading steps.

### Fixes

- Chat: Switching chats or starting a new one no longer loses your draft attachments or moves them to another chat.
- Chat: Your chosen model no longer resets while models are loading. Thinking levels, including Default, are remembered after a reload.
- Chat: Fixed growing memory use when switching between conversations.
- Chat: Completed subagent results display formatted Markdown again (thanks to @bashrusakh).
- Chat: The selection menu opens above or below the text you select, keeping it accessible for copying (thanks to @yulia-ivashko).
- Context: Fixed incorrect percentages after compaction. The counter shows a dash until the next response reports usage (thanks to @yulia-ivashko).
- Git: Fixed blank diffs for submodules and repeated errors for nested repositories. Changes now shows submodule status and identifies separate repositories (thanks to @yulia-ivashko).
- Settings/Behavior: Instructions edited outside the app appear when you reopen settings, including when the file was cleared (thanks to @bashrusakh).
- Desktop: Fixed background OpenCode and tool processes left behind after quitting the app, restarting OpenCode, or a failed start.
- Files: Fixed file searches getting stuck in some repositories.
- Files: Escape closes an open menu while keeping the file panel open.
- macOS: The Dock's unread badge keeps updating when the menu bar icon is disabled.
- Mobile: Theme import fits above the keyboard, and long theme lists stay clear of the status bar and home indicator.

### Misc

- Usage: Removed Crof usage tracking after the service shut down (thanks to @kydorn).
- Tooling: Updated Bun to 1.4.2 for local development, CI, and Docker images (thanks to @osztenkurden).

## [1.23.2] - 2026-09-14

### New

- Chat: Reorder sections in the work status panel. Your preferred order is saved across devices.

### Improvements

- **Performance:** The app becomes ready to use sooner, with faster session lists across projects and worktrees and less background work competing with opening a chat.
- Sessions: Press Enter to search in the sidebar, archive, and mobile session list. Typing stays responsive in large lists, and clearing the field resets results immediately.

### Fixes

- **Sessions:** Archiving or deleting a parent in Mobile, Recent, or Chats includes nested subagents, including those below an archived subagent (thanks to @yulia-ivashko and @alexandrereyes).
- Sessions: Archived subagents stay out of the active list when an older refresh finishes (thanks to @yulia-ivashko and @alexandrereyes).
- Sessions: Empty worktrees stop showing a loading spinner once their session list has loaded.
- Sessions: Show more in Chats reveals the next batch and follows the same display limit as project sessions.
- Projects: Renaming keeps every typed letter and preserves the project's default model and thinking setting (thanks to @yulia-ivashko).
- Windows: Updating the web app installs the new version and brings the server back online (thanks to @yulia-ivashko).
- Editor: Escape returns Vim to Normal mode while keeping the file editor open (thanks to @yulia-ivashko).
- Git: The repository picker appears again for projects containing nested repositories.
- Usage: Quotas load on startup when opening the web app through its server or running the desktop development app.
- Settings/Usage: Each provider shows only its own errors, and balance-only cards no longer show an empty usage bar (thanks to @yulia-ivashko).
- Chat: Turn stats hide implausible token speeds caused by unreliable timing measurements (thanks to @yulia-ivashko).
- Chat: Text and buttons from the message box no longer show through the dictation overlay.

## [1.23.1] - 2026-09-11

### New

- **Diff review:** Review the changes in a published pull request directly in Changes, on desktop and mobile.
- Sessions: Ask AI to rename a session based on its recent conversation from the session menu or mobile actions.
- Settings/Sessions: Limit retention cleanup to archived sessions, with the retention period starting when each session was archived.
- Chat: Paste or drop non-image files into a message, with file references added to the draft automatically.

### Improvements

- **Chat:** Visual refinements across the message box, attachments, menus, and panels give the conversation more room and a more consistent look on desktop and mobile.
- Chat: Attachments and linked issues sit inside the message box, with model and agent controls grouped together on mobile. Queued messages start collapsed.
- Chat: Recaps retain the substance of recent work after short closing exchanges, and follow-up suggestions can stay quiet when there's nothing useful to add.
- Sessions: Markdown exports include attached quotes and comments with their source.
- App: Hidden Files, Changes, terminal, and walkthrough panels pause background work while you're using another panel.
- Chat: Inline code colors follow the selected theme.
- Mobile: A dot on the workspace button marks uncommitted changes.
- Chat: Removed the extra changed-files dropdown under answers in non-Git folders.

### Fixes

- Sessions: Default model, agent, and thinking choices survive restarts and instance switches, with faster loading in the model and agent pickers (thanks to @alvins82).
- Chat: Model favorites save from the first change, including when you reload immediately (thanks to @alvins82).
- Chat: Reading older messages keeps your place as earlier history loads, and a growing message box keeps the latest message in view.
- Chat: Reasoning and shell output keep scrolling with incoming text until you scroll up yourself.
- Chat: File lists under answers use the turn's direct edits, reducing unrelated files from other sessions. Long lists collapse after four files (thanks to @yulia-ivashko).
- Chat: Queued messages containing only quotes or comments show a preview of their attached context.
- Chat: Slash commands stay available when switching projects.
- Chat: Session recaps disappear without making the conversation jump when you send a message.
- Files: Large text files can be edited and saved in full without cutting off their contents or changing line endings.
- Sessions: Retention cleanup protects child sessions that should be kept and avoids false failures when deleting session families.
- Sessions: Pressing Enter saves a renamed session.
- Worktrees: New sessions pick up the project's settings after checkout, fixing missing configuration in freshly created worktrees.
- Worktrees: Worktrees added or removed in another window, by an agent, or from a terminal appear in the sidebar on the next Git refresh (thanks to @yulia-ivashko).
- Projects: Deeply nested projects can save settings, notes, plans, and memory without file-name errors (thanks to @yulia-ivashko).
- Scheduled tasks: A project that fails to load no longer stops tasks in other projects from starting (thanks to @yulia-ivashko).
- Scheduled tasks: Run now works for paused tasks while their schedule stays paused.
- Terminal: Right-click opens Copy and Paste actions again.
- Terminal: On macOS, Option+Left/Right moves by word and Option+Backspace deletes the previous word at shell prompts.
- Terminal: Attaching selected output to chat puts the cursor in the message box.
- Shortcuts: Cmd/Ctrl number shortcuts for sessions and panels work while typing in chat.
- Desktop: After an AppImage update, OpenCode starts from the current app bundle, fixing stale paths and incorrect upgrade offers (thanks to @yulia-ivashko).
- Sessions: Long tab titles fade before the buttons when you hover over a tab.

### Misc

- MCP: Removed OpenChamber's automatic reconnects, which could repeatedly start failed local servers. Failed connections now need manual reconnection.
- Desktop: Updated Electron to 43.7.0.

## [1.23.0] - 2026-09-09

### New

- **Git:** Stage, unstage, or discard individual blocks of changes with controls beside each block in the web and desktop Changes view (thanks to @LABCAT).
- **Turn stats:** The work status panel now shows response speed, model and tool time, tokens, and reported cost after a turn finishes. It's enabled by default (thanks to @alvins82).
- **Projects:** Move project actions, worktree setup commands, and draft starters into the repository for teammates to use. Repository commands ask for trust before running, and ask again when they change.
- Plans: Move plans into the repository, or point the Plans tab at an existing folder of Markdown files in your project.
- Git: Choose a recent commit to review in Changes or Walkthrough, with the same selection shared between both panels.
- Mobile: Compare branches and review individual commits from the Changes panel (thanks to @gaojunran).
- Mobile: Manage snippets, agents, commands, plugins, and skills from Settings on your phone.
- Mobile: Start a session in a project's root folder with the + beside its name in the sessions drawer.
- Sessions: Search projects by name or path in the new-session project picker on web and desktop (thanks to @maximtop).
- Sessions: Paste a full session ID into sidebar or archive search to find an exact match on web and desktop (thanks to @yulia-ivashko).
- Chat: Open and close collapsible Markdown sections in replies, including while the answer is still arriving.
- Usage: ClinePass shows five-hour, weekly, and monthly limits in Usage settings, with an option to show them in work status (thanks to @NemeZZiZZ).
- Usage: Charm Hyper now shows your remaining Hypercredits and their dollar value (thanks to @airtaxi).
- Settings: "Always show scrollbars" keeps scrollbars visible on this device when you move the pointer away.

### Improvements

- Chat: Completed live Activity can collapse into a summary of tools used and files changed, keeping the final answer visible. It follows your Activity Default setting.
- Chat: `/btw` now opens a separate composer with its own draft, model, and effort. Select message text and choose "By the way…" to ask about it, or use `/btw <question>` to send immediately (thanks to @ChangeHow).
- Files: Returning to a file restores your place in its code or Markdown preview, including the cursor position in the editor.
- Settings: Theme, fonts, and chat layout can differ between web, desktop, mobile, and VS Code. Panel sizes and other device choices stay on the device.
- Desktop: Zoom controls act on the focused browser, terminal, or file editor, and adjust interface scale when you're in chat or Mini Chat (thanks to @khafaji-ahmed).
- Mobile: Back steps through Settings from an item to its list, then to the settings menu.
- Mobile: Choose project sorting from the sessions drawer header. The drawer follows the same project order as desktop.
- Mobile: Close either drawer with the reverse edge swipe. Swipe session, project, and worktree rows right to reveal their actions.
- Comments: Enter attaches a code comment on desktop; Shift+Enter adds a newline.
- Terminal: Text renders consistently across tabs, borders and block graphics join cleanly, and touch users get a copy button beside the tabs.
- Chat: Ctrl+N/P navigation works across model lists, menus, and autocomplete. Reopening the model picker brings the selected model into view (thanks to @ChangeHow).
- Settings/Chat: Send-shortcut choices and large-text paste behavior have clearer descriptions (thanks to @ChangeHow).
- Chat: Tighter text and Activity spacing, stronger headings, and a softer divider make final answers easier to read. Message action buttons are smaller, with touch actions grouped in a menu.
- Chat: Selected text uses the same visible highlight in messages, file previews, and comments across themes.

### Fixes

- Chat: Queued messages already sent by the server disappear from the queue after reconnecting (thanks to @IbrahimKhan12).
- Sessions: Creating a session or opening a worktree session no longer shows a false history-loading error.
- Remote access: Large streamed replies no longer hold up other requests on slow tunnel connections, and broken connections stop leaving new requests hanging.
- Chat: Forking a user message restores its text and attachments in the new composer's draft and preserves the source draft (thanks to @karimodm).
- Chat: Interrupted tools stop showing an endless running timer after a reload (thanks to @alvins82).
- Chat: Attached images no longer appear twice just after sending.
- Chat: Opening panels or resizing the window keeps you at the end when following the latest reply. Sending or collapsing Activity no longer leaves a large blank area below it.
- Chat: Message details fit narrow columns without leaving gaps, keeping the model name readable as less important details disappear.
- Chat: Streaming Thinking stays inside its scroll box. Scrolling or dragging upward pauses its automatic scrolling so you can read earlier reasoning (thanks to @alvins82).
- Chat: Enter adds a newline in the expanded composer; Ctrl/Cmd+Enter sends. Keyboard selection of a project or worktree returns focus to the input (thanks to @ChangeHow).
- Chat: Narrow Markdown tables fit their columns, removing the empty bordered space on the right (thanks to @ChangeHow).
- Sessions: Opening or restoring a session whose worktree was deleted leaves moving it to another directory up to you.
- Mobile: The uncommitted-changes warning no longer flashes over the chat when starting a session.
- Mobile/Android: Settings, drawers, and chat controls stay clear of the system navigation bar.
- Terminal: Switching projects or tabs keeps each terminal's output separate. Reopening or resizing the panel no longer leaves stray prompt fragments.
- Terminal: Exiting Node-based commands on macOS and Linux no longer prints an empty IPC-channel warning.
- Updates: Updating a desktop host from the browser uses its native updater, confirms the installed version, and reports restart failures with a retry option (thanks to @ChangeHow).
- Git: Switching to a token-based identity no longer fails with a credential-helper permission error (thanks to @ICEY16360).
- Git: Branch comparisons include local edits and follow the selected base branch when you switch comparisons.
- Git: New-file diffs and walkthroughs still load when Git prints line-ending warnings (thanks to @jakoss).
- Usage: A failed refresh keeps the last known usage visible and shows the error without clearing other providers.
- Usage: OpenCode Go shows the correct reset countdowns for its usage limits.
- Usage: OpenRouter shows per-key spending and limits, or monthly spending for unlimited keys, fixing misleading zero balances (thanks to @leducmaxime).
- Usage: Ollama Cloud's dollar-based plans show monthly spending and extra credits, fixing missing usage and rejected credentials (thanks to @kydorn).
- Usage: NeuralWatt allowance rows show usage percentages and respond to the used/remaining toggle (thanks to @kydorn).
- Usage: Slow connections to providers such as z.ai no longer fail because the connection attempt ends too early (thanks to @ouyangjian28).
- Model tools: Summaries, titles, and walkthroughs use the selected model's connection details, fixing failures with providers whose models use different addresses (thanks to @mcowger).
- Desktop: Reachable instances no longer appear offline just because their connection check takes longer to respond (thanks to @jibanez-staticduo).
- Layout: Interface scaling keeps panels and controls usable, with room for macOS window buttons at smaller scales (thanks to @khafaji-ahmed).
- Sidebar: Closing and reopening the sidebar preserves the width you chose.
- Desktop/Linux: "Open in" no longer lists unrelated editors or launches the wrong app when an installed app has a non-Latin name (thanks to @ouyangjian28).
- Scrollbars: Hovering over a scrollable area reveals its scrollbar, including in Settings and dialogs, without shifting the content (thanks to @sergiofspedro).
- Language/Turkish: Agent and prompt labels use consistent terminology in Activity, turn stats, and input-history settings (thanks to @fitzgpt).

### Misc

- Server: `OPENCHAMBER_DATA_DIR` also covers project settings, themes, speech models, and new managed chats. Existing managed chats stay in their current location.

## [1.22.2] - 2026-09-05

### New

- **VS Code: comments on code.** Select lines, click the `+` in the gutter or right-click → OpenChamber → Add Comment, and write your note. It stays pinned to the code and goes out with your next message as a context card. Works in diffs too (thanks to @felipegenef).
- Chat: prompt history. Arrow up and down in the composer bring back your earlier prompts, attachments included, and the history survives a reload. It covers the current session; Settings → Chat can widen it to every project on this server and set how many prompts to keep, 40 by default (thanks to @mattv8).
- Chat: an "Enter sends" switch in Settings → Chat. On, Enter sends and Shift+Enter adds a line; off, the other way round. Ctrl/Cmd+Enter always sends. Nothing changes until you flip it (thanks to @claymor333).
- Server: `OPENCHAMBER_CHATS_DIR` moves the folder that holds chats without a project, for setups where OpenCode runs as a different user (thanks to @steffenmaechtel).
- CLI: on Linux, `openchamber startup enable` warns when the service would stop at logout and shows the `loginctl` command that keeps it running (thanks to @IbrahimKhan12).
- Project actions in worktrees: a session in a worktree can use the parent project's saved actions (thanks to @mattv8).
- VS Code: the extension is available in Turkish (thanks to @fitzgpt).

### Improvements

- **Project actions:** the running state of a saved action is reliable now. It shows as running only while the command is really running, every device sees the same state, and the sidebar shows which project has something running (thanks to @mattv8).
- Chat: Markdown tables are readable again, columns take the width their content needs (thanks to @ChangeHow).
- Chat: the Summary, Tree, or Raw view you pick for a JSON tool result is remembered for every JSON card and after a reload (thanks to @karimodm).
- Mobile: with a draft typed, the collapsed composer always has a send button. While the agent is working, that button queues the message (thanks to @ChangeHow).
- Server: OpenCode config paths respect `XDG_CONFIG_HOME` (thanks to @travisdoherty).
- VS Code: a fresh install uses VS Code's language until you choose one in Settings.
- Updates: the update dialog shows each new release with its title and its New, Improvements, and Fixes groups.

### Fixes

- **Settings/Providers:** editing a custom provider keeps all of its model settings, and VS Code saves the protocol you chose (thanks to @hehuaiyu).
- Sessions: opening a session from a deleted worktree moves it back to the project (thanks to @yulia-ivashko).
- Sessions: restoring an archived session from a deleted worktree moves it back to the project (thanks to @mattv8 and @yulia-ivashko).
- Sidebar: a missing worktree stays visible with a warning until you remove it (thanks to @yulia-ivashko).
- Sessions: forks, side threads, and subagents keep working after their original chat is deleted (thanks to @yulia-ivashko).
- Chat: huge patches in tool cards open without freezing the page (thanks to @karimodm).
- Files: an open file stops flickering through reloads when nothing changed, and an edit made in another app shows up in place while your unsaved changes stay (thanks to @IbrahimKhan12).
- Chat: pressing Enter to confirm text on a Japanese, Chinese, or Korean keyboard no longer sends a comment by accident (thanks to @ChangeHow).
- Chat: a queued slash command with attached context is delivered correctly, and the "Queued messages" card disappears after the last message goes out.
- Goal Mode: when a reply is cut off by the length limit, the goal continues, and Resume gives it another try (thanks to @bashrusakh).
- Sessions: subagent sessions are found in projects with more than 200 sessions (thanks to @bashrusakh).
- Server: the terminal works in the Docker image, and non-Latin text renders correctly there (thanks to @yulia-ivashko).
- CLI: on Windows, `openchamber` starts the server under Bun when Bun is installed.
- VS Code: on Windows, the status command and adding a folder to the workspace handle drive-letter case correctly (thanks to @pttydou).
- VS Code: permission auto-accept works again with the stable OpenCode (thanks to @bashrusakh).

## [1.22.1] - 2026-09-04

### New

- **Message queue:** messages you queue while a session is busy are now sent by the OpenChamber server. They go out even if you close the tab that queued them, and every device shows the same queue.
- **Git:** switching branches with uncommitted changes now stops at a dialog to commit or revert first, with an optional push. A failed push cancels the switch (thanks to @yulia-ivashko).
- Chat: the plus button inside a chat opens a new chat draft (thanks to @yulia-ivashko).
- Git: the mobile Changes view has a branch picker (thanks to @yulia-ivashko).
- Settings: Fixel Text is available as an interface font.
- Usage: exe.dev usage windows are tracked.
- Desktop: dev server previews work over the private relay.

### Improvements

- **OpenCode Go:** every request OpenChamber sends on its own, such as commit messages, pull request text, recaps and follow-ups, walkthroughs, Goal Mode checks, notes, and usage, now carries the `x-opencode-session` header OpenCode Go requires from 6 September. Chat traffic already had it. Update before that date if you use OpenCode Go.
- Chat: a queued message keeps its attached context, file mentions, and skill, and editing it brings them back to the composer.
- Worktrees: archiving a worktree's sessions is much faster, about a second for 121 sessions instead of fifteen. Archiving several sessions picked in the sidebar is just as fast (thanks to @yulia-ivashko).
- MCP: a server that failed to start or lost its connection reconnects on its own, waiting up to thirty seconds between tries. Disabled servers and ones waiting for a login are left alone. Web and Desktop only.
- Git: the branch picker lists recent branches and marks the ones with unpushed commits (thanks to @yulia-ivashko).
- Git: a draft over a directory with uncommitted changes shows a warning on its branch selector (thanks to @yulia-ivashko).
- Git: status refreshes after a tool finishes a change or a worktree changes (thanks to @yulia-ivashko).
- Chat: a new session opens on the Chat or Project side you used last (thanks to @yulia-ivashko).
- Sessions: starting a rename selects the whole title (thanks to @yulia-ivashko).
- Settings: new installs start on the OpenChamber light and dark themes. An existing Flexoki choice is kept.
- Desktop: the instance switcher keeps its statuses between opens, never shows the connected instance as checking, waits up to fifteen seconds for a relay instance before calling it unreachable, and shows the full instance name.

### Fixes

- Worktrees: removing a worktree no longer freezes the interface. It runs in the background with a progress toast (thanks to @yulia-ivashko).
- Worktrees: a worktree created from a branch behind its upstream now fetches first and branches from the remote (thanks to @jtatum).
- Worktrees: the New Worktree dialog keeps what you typed when the worktree list changes while it is open (thanks to @yulia-ivashko).
- Worktrees: a removed worktree leaves the sidebar under every project it was listed in (thanks to @yulia-ivashko).
- Git: status no longer flashes half-finished changes while a new worktree runs its setup commands (thanks to @yulia-ivashko).
- Chat: starting an isolated-worktree session from an answer picks the right project when the open session already lives in a worktree (thanks to @yulia-ivashko).
- Chat: resizing the window no longer snaps an idle reader back to the end of the conversation.
- Thinking effort: picking Default sticks after a send and across agent or session switches, and a reopened session restores the effort its last message used (thanks to @yulia-ivashko).
- Settings: the theme no longer flips when you switch sessions across directories, and missing theme fields keep your current preference (thanks to @kydorn).
- Terminal: text no longer renders wrong until you resize the terminal, and terminals connect on servers running under Bun.
- Server: a browser on https behind an HTTP proxy hop is no longer rejected as a mismatched origin.
- Sidebar: the project label no longer shifts when its hover actions appear.
- Desktop: switching instances clears the previous instance's Linear and GitHub logins, quotas, MCP status, skills, and memory.
- Turkish interface: the missing Git repository discovery labels are back (thanks to @kydorn).

### Misc

- Settings → Integrations no longer offers the Claude Code and Cursor plugin installs. It now holds GitHub and Linear.

## [1.26.1] - 2026-09-19

- Shortcuts: a new "Latest unread session" action (default ⌘K U / Ctrl+K U, rebindable in Settings → Keyboard shortcuts) jumps to the session that most recently finished unviewed — completed or failed — and repeated presses walk toward older unread ones. Pairs with the existing previous/next session history shortcuts for driving the app from a remote control or keyboard-only.

## [1.26.0] - 2026-09-04

- **Kanban:** unified the board scheduler to a single reconciler loop with optimistic CAS (409 on concurrent edits), fixed the resume budget being cleared on every heartbeat, and made queued/running cards visible in the pipeline badge counts.
- **Kanban:** delivery checks no longer stall — waiting for CI, diff, or report answer now times out after 10 minutes and re-enters the retry budget, large PR diffs are paginated (100/page) and truncated intelligently within the 40k prompt budget, and a transient evaluator failure auto-retries once.
- **Kanban:** returning a card from Review now asks for a note that is sent back to the worker, Blocked cards get a one-click retry (queued if a plan exists, otherwise planning), In Progress shows P/Q/R/C/M badges, and editing title/description warns before resetting the card to Planning.
- **Kanban:** git detection now handles worktrees (`.git` file), init safely appends `.gitignore` and warns when `.env` would be staged, and worktrees/branches are GC'd on block/merge/remove.
- **Providers:** custom models can now declare thinking levels per model — OpenAI `reasoningEffort` or Anthropic budget — in Settings → Providers, with comma-separated levels that round-trip and appear in the thinking picker.

## [1.25.10] - 2026-09-03

- Desktop/macOS: traffic lights and the sidebar toggle now sit level with the conversation title and right-side header buttons (was ~2px high).

## [1.25.9] - 2026-09-03

- **Git:** branch switches with uncommitted changes now stop at a dialog to commit or revert instead of failing silently. Commit-and-switch can generate the message and optionally push before switching; a failed push leaves the commit and cancels the switch with a toast (thanks to @yulia-ivashko).
- Git: the branch picker keeps recent branches per repository and marks branches that have local commits ahead of their upstream, without fetching (thanks to @yulia-ivashko).
- Git: a new-session draft over a directory with uncommitted files now flags its branch selector with a warning that opens for five seconds (thanks to @yulia-ivashko).
- Git/Mobile: the mobile Changes view uses the shared branch picker instead of a read-only label (thanks to @yulia-ivashko).
- Projects: the project label area reserves space for its action buttons so the row no longer shifts when actions appear.
- Server: external https origins are accepted when TLS terminates before an HTTP proxy hop, fixing hosts behind a proxy while still rejecting mismatched origins.

## [1.25.8] - 2026-09-01

- **Kanban:** a card whose project folder is not a git repository is no longer stuck in "queued" forever. Moving it into planning now stops with the reason on the card, and right-click offers "Initialize Git repository" to init + first-commit the folder in one click and kick dispatch again. A card whose dispatch keeps failing also stops retrying after the attempt budget and lands in Blocked with the actual error, instead of re-dispatching in silence.
- Kanban: a task's worker worktree and its sessions now appear live under the project section in the sidebar while the card runs. Before, the freshly created worktree stayed invisible for at least 30 seconds — often indefinitely — because a cached empty worktree list swallowed the refresh.
- Brand: the check mark in the logo now has rounded caps and a rounded corner, matching the ring and ticks, across all app icons (desktop, mobile, VS Code, web, README badges).

## [1.25.7] - 2026-09-01

- **Kanban:** right-click a card for a quick menu — open its details, worker session, or pull request, move it between columns, approve/merge/accept/return, or delete it. When a card can't be deleted yet, the reason now appears as a toast instead of the delete silently failing.
- Kanban: a task whose worker session was archived or removed mid-run now lands in Review with the reason, instead of sitting "in progress" until its lease expires and quietly re-running work that was already done. Workers must also hand back an outcome — done, nothing-to-do (goes to Review for a human), or blocked — before they stop.

## [1.25.6] - 2026-09-01

- Git: the Graph page now reads as a table — branch and tag badges sit inline with the message, and author, date, and commit SHA line up in fixed right-side columns so rows are easy to scan side by side. The surface is titled "Git Graph".

## [1.25.5] - 2026-09-01

- **Git:** a new Graph surface on the right rail shows the whole repository as a colored commit graph with branch, tag, and HEAD badges. Clicking a commit expands its files with inline diffs, and each commit offers checkout, create branch, cherry-pick, revert, reset, merge, and rebase — the Git panel's history dialog now opens this surface instead.
- Mobile: the board is available on phones as its own page — swipe between the five columns and jump to one from the column chips at the top.
- Settings/Providers: models marked "Accepts image input" before 1.25.4 now get their image input back without re-toggling the checkbox — the server backfills the missing input-modality declaration for those legacy configs at startup.

- Settings/Providers: the "Accepts image input" checkbox on a custom-provider model now really unlocks image input. It previously only set an attachment flag, while both TaskHunter's paste warning and OpenCode gate images on the model's declared input modalities — pasted images were still rejected with "this model does not support image input". Models already flagged as accepting attachments also no longer trigger the warning.

## [1.25.3] - 2026-09-01

- Kanban: restarting TaskHunter no longer abandons in-progress cards. Cards that were Running when the app closed now wake their original worker session and continue in the same worktree and branch — a fresh attempt on a new worktree only happens when the old session is genuinely gone or can't be woken after the retry budget.

## [1.25.2] - 2026-09-01

- Kanban: board tasks now run fully unattended. Worker sessions no longer pause to ask you questions or sit on permission prompts — ambiguous calls are made by the worker and recorded in the pull request, permission requests are accepted automatically, and if a worker goes quiet before opening a pull request the delivery checker nudges it to keep going (including answering its own questions) instead of waiting on you. Cards that exhaust their retry budget move to Blocked with a reason.

## [1.25.1] - 2026-08-31

- Kanban: the board shows five columns — Backlog, In progress, Review, Done, Blocked — instead of one column per pipeline stage. Cards the agent is working on share the In progress column, each badged with its exact stage (Planning, Queued, Running, Checking, Merging). Card actions, agent gates, and manual stepping are unchanged.

## [1.25.0] - 2026-08-31

- **Kanban:** a new board, opened from the sidebar, runs tasks as an agent pipeline instead of a human checklist. Drag a card to Planning and an AI evaluator writes its launch plan — completion criteria, whether the deliverable is a pull request or a report, and whether the finish needs human review or can auto-merge on green CI. Approve it (or let auto mode) and the card queues; whenever a concurrency slot is free the scheduler spawns a worker session in its own git worktree. When the session goes idle, a delivery checker grades the deliverable — reading the final report, or pre-reviewing the diff once CI passes — and bounces a failing deliverable back to the worker with concrete fix notes before anyone sees it. Green plans go straight to a strictly-serial merge queue that rebases conflicts on its own; human-review plans land in Review with a PR link and Merge/Accept/Return actions. Cards carry plan badges, session counts, PR links, queue state, and a Blocked column that lists exactly why each stuck card needs you.
- Kanban settings: the board header's settings button picks the dispatch model, how many cards may run at once, plan-vs-auto approval mode, and the retry budgets for self-healing checks, merge rebases, and re-dispatches.
- Settings/Magic Prompts: a Board group exposes the five prompts the pipeline runs on — the launch evaluator, the PR/report worker instructions, and the report/PR delivery-check rules — so you can retune how tasks are judged and checked without a code change. Defaults stay in sync with what the server runs.

## [1.24.5] - 2026-08-31

- UI: every app icon now uses one artwork at one size. Previously the mark was drawn at different sizes per surface (nearly full-bleed on Android, smaller on iOS, cropped on macOS) and some logo assets were outright broken — an empty transparent web logo PNG, empty macOS menu-bar images, white-disc Android round icons. All app icons now share the same full-bleed dark plate with the mark sized safely inside every platform's mask (launchers, squircles, adaptive circles); a single generator (`npm run icons:brand`) produces them all from one definition.

## [1.24.4] - 2026-08-31

- **Mobile:** the apps now live under `com.taskhunter.app` (was `com.openchamber.app`). Android and iOS treat this as a new app — uninstall the old build first; stored data does not carry over. The iOS deep-link scheme also moves to `taskhunter://`, matching the desktop app.

## [1.24.3] - 2026-08-31

- UI: every loading screen — web, desktop startup splash, mobile shell, VS Code webview, and the headless server landing page — now shows the TaskHunter target mark instead of the old isometric cube. No animations; the mark is static.
- Desktop: the macOS menu-bar tray icon is visible again — the icon refresh in 1.23.0 wrote empty images, leaving the menu bar iconless. The busy "breathing" animation and per-session menu icons (working / needs review / failed / retrying) are drawn from the new mark.
- Mobile: the round Android launcher icon rendered as a plain white disc in the app drawer and system settings; it is now the new mark clipped to a circle. Launch screens keep the launch mark at its legacy size across re-generations.

## [1.24.2] - 2026-08-31

- macOS: releases are now signed with a stable repository certificate, so in-app auto-update installs across releases instead of being rejected for a mismatched code signature. This is the bootstrap release — update from an ad-hoc-signed version by downloading the DMG from the release page once (open it via right-click → Open); from then on updates flow automatically.

## [1.24.1] - 2026-08-31

- Mobile: the iOS and Android apps now ship the TaskHunter mark everywhere — launcher icons (all densities, adaptive and round), launch screens, the Android notification icon, and the iOS home-screen widget symbol replace the old OpenChamber cube. Launch screens now sit on the brand's dark background.

## [1.24.0] - 2026-08-31

- **Settings/Providers:** each model row in the custom-provider form now takes a context window and max output token limit, plus an "accepts image input" checkbox, and editing an existing provider reads them back. Only models with a declared context length can be auto-compacted near the limit, and image attachments in chat reach a model only when you mark it as accepting images — until now the form silently dropped or omitted both.
- **Settings/Behavior:** a new "Context compaction" section toggles auto-compaction and pruning of old tool output. It writes into the config layer that already defines compaction and leaves hand-written keys such as `reserved` untouched.
- Desktop: on macOS, the floating conversation panel's corners now follow the native window radius instead of the larger web one.
- UI: the sidebar drag-to-resize indicator line no longer runs past the panel's rounded corners.
- Turkish: the Git panel's empty states show translated text instead of English.

## [1.23.0] - 2026-08-31

- **UI:** the conversation area is now a rounded floating panel over the sidebar background, macOS-style. While the sidebar is open the panel sits flush against the divider — its own rounded border is the only line between the two; collapsing the sidebar lets the panel float free on all sides.
- Android: signed release APKs and AABs are attached to each GitHub Release, built with this fork's own keystore. Push notifications are unavailable in fork builds (the bundled Firebase config is the upstream one).
- Release notes and documentation links now point at this repository throughout.

## [1.22.0] - 2026-08-30

- **Linear integration:** connect a workspace in Settings → Integrations, browse and filter issues, and start a session or worktree from an issue. TaskHunter reports session progress back to Linear and can attach an issue to the next chat message (thanks to @AlexKutas).
- **Voice:** local text-to-speech and macOS say now choose a voice that matches the reply's language. Additional local models download on first use, and the voice picker lists voices from every installed model.
- **Git:** projects containing several repositories can now switch between them from the Git tab. Diff, pull request, walkthrough, mobile Changes, and work status follow the selected repository (thanks to @jaygupta17).
- **Chat:** sessions opened from the sidebar stay at the latest message, and switching sessions no longer causes jumps, partial rendering, crossfades, or tab-title shifts.
- Chat: command, skill, and file autocomplete in projectless chats no longer uses the previously selected project.
- Chat: reverting to a message, or forking from one, now brings its attached context back to the composer — review comments, chat and file quotes, terminal selections, and browser annotations are no longer lost.
- Chat: stopped and unanswered turns now explain what happened. The status report includes recent session, send, and managed OpenCode errors, plus log locations.
- Files: Ctrl/Cmd+F opens search in the Markdown preview even when the preview is not focused.

### Fixes

- Chat: command, skill, and file autocomplete in a chat without a project no longer uses the project you had selected before.
- Chat: reverting to a message or forking from one brings its attached context back to the composer. Review comments, chat and file quotes, terminal selections, and browser annotations are kept.
- Chat: a stopped or unanswered turn now says what happened. The status report lists recent session, send, and managed OpenCode errors, and where to find the logs.
- Scheduled tasks: Goal, Auto-accept, and the other task settings survive when an older OpenChamber build shares the same project config.
- Git: the commit graph no longer leaves a lane gap when the same branch is merged twice (thanks to @Naputt1).
- Settings: themes are now remembered per TaskHunter instance, so windows connected to different instances keep their own theme (thanks to @kydorn).
- Scheduled tasks: Goal, Auto-accept, and other task settings are preserved when older TaskHunter builds share the same project config.
- Desktop: on Windows and Linux, the close button reaches the top-right corner and follows the theme on hover (thanks to @kydorn).

## [1.21.1] - 2026-08-29

- **Turkish interface:** TaskHunter can now be used in Turkish (thanks to @fitzgpt).
- **Git/Worktrees:** session menus can now move an idle session and its sub-sessions into an existing worktree. TaskHunter discovers worktrees created elsewhere when the target list opens, asks before transferring uncommitted changes, and keeps those changes safe if a move fails partway (thanks to @mattv8).
- `/btw` side questions: a btw session now answers the side question instead of carrying on with the parent's plan, and forks at the last completed turn so a reply that is still streaming is never inherited (thanks to @pocharlies).
- Chat scrolling: with "Follow new content while streaming" off, sending from the middle of a conversation no longer jumps to the new message; a middle-button pan or Shift+Space stops auto-follow like the wheel does, and an upward wheel inside a tool output box scrolls that box instead of the chat (thanks to @pascalandr); PageUp/PageDown in the prompt box no longer shifts the whole window up and hides the title bar.
- Chat no longer crashes or freezes on: very large tool results, which are capped before rendering (thanks to @JSap0914); a code block with JavaScript template strings, which could send the syntax highlighter into endless backtracking (thanks to @makeittech); a diff with a truncated header (thanks to @pascalandr); and a draft or recalled message containing Windows line endings, which threw "Selection points outside of document" on every visit (thanks to @yulia-ivashko).
- Chat: a session no longer looks frozen after a page reload or a late second client — pending permission and question cards come back (thanks to @yangyaofei) — nor after dismissing the agent's questions and sending a new task (thanks to @bashrusakh).
- Work status: the session cost now includes what its subagents spent, split under the context meter and shown per subagent (thanks to @igorvelho), and undoing or redoing a parent session keeps its subagents at the same point in history (thanks to @alexandrereyes).
- Chat rendering: question prompts render Markdown (thanks to @pascalandr); bare links next to CJK or full-width punctuation no longer absorb it (thanks to @gaojunran); inline code and chips are readable in every theme (thanks to @difagume); a completed reasoning block shows in full instead of replaying as if still thinking, the text-selection menu stays inside the viewport, and the sticky user-message header no longer fades over the first lines of the reply (thanks to @makeittech).
- Chat actions: tool cards with a file path get a quick-open button (thanks to @robertoberto); sending without a selected model explains what is missing (thanks to @rvaldemar); `/init` stays in slash-command autocomplete after the conversation starts (thanks to @Dawnfz-Lenfeng); copying a message keeps Markdown paragraph, list, and code-block spacing (thanks to @ChangeHow); Ctrl/Cmd+digit is ignored while typing in a field, and a manually chosen model survives switching between Build and Plan (thanks to @makeittech).
- Composer: pasting a large block of text (about 2,000 characters or 25 lines) now offers to attach it as a `pasted-context-N.txt` file instead of flooding the input, with a `[pasted-context-N.txt]` reference left at the caret; Settings → Chat can make it always attach or always paste inline (thanks to @makeittech).
- Chat: the text the model writes before asking a question is shown right away instead of staying hidden in the Activity group until the turn ends (thanks to @makeittech).
- Chat: when the turn-ending signal from OpenCode is lost, the working spinner now clears within about a second instead of up to ten (thanks to @makeittech).
- Composer: typing three backticks leaves the caret inside the completed code fence, empty inputs keep a visible caret, and platform autocorrect behavior is preserved (thanks to @franzudev, @TTTPOB, and @IbrahimKhan12).
- Usage: GitHub Copilot now shows a single AI Credits window, matching Copilot's token-based quota, in place of the old Chat Requests and Completions windows (thanks to @jakoss).
- Multi-Run: groups can now contain more than five models, including isolated runs that create one worktree per model (thanks to @tomzx).
- Files: the Markdown preview has an in-document search (Ctrl/Cmd+F) with highlighting and next/previous, and clicking a folder or file in the sidebar tree opens it reliably on macOS trackpads, where a tiny pointer move used to swallow the click (thanks to @makeittech); files up to 20,000 lines open in the full-file preview instead of being rejected at 5,000 (thanks to @gaojunran).
- Panels: right-click an editor, chat, or browser tab to close it, close others, close left/right, or close all (thanks to @adavila0703).
- Plans: saved plans open with their content again for chats, worktrees outside the project path, and tabs restored after a reload, and an edit made right before closing is no longer lost.
- Browser: when the agent captures a page while the browser panel is hidden, the panel is revealed first instead of the capture failing.
- Sidebar: Recent rows show a compact timestamp on web and desktop, and pending permission/question badges are no longer covered by the hover actions (thanks to @makeittech).
- Mobile: Chats — sessions that belong to no project — now appear in the sessions sheet above the project list; opening an already-open agent switches to its editor instead of duplicating it (thanks to @bashrusakh); Android connections can trust user-installed certificate authorities, such as a local proxy's (thanks to @Silvenga).
- Settings: the editor font size survives a restart (thanks to @pascalandr); a change made right before closing the window is saved (thanks to @makeittech); number fields and selects no longer clip at large font sizes (thanks to @makeittech); refreshing GitHub account state no longer interrupts the page (thanks to @floze-the-genius); the Cloudflare Tunnel download link is fixed (thanks to @AyoubAchour); Windows skill paths are classified correctly, so disabled and duplicate skills are hidden as intended (thanks to @Ttungx).
- Small model: requests send the provider's configured headers, such as an API-gateway subscription key (thanks to @dmitrii-galantsev); a configured Anthropic endpoint is used without a doubled `/v1`, and Google models without reasoning no longer receive a thinking option (thanks to @mpeter and @IngTian).
- Projects: the folder picker can select several directories at once and add them together (thanks to @herjarsa).
- Files: files reached through a symlink inside the workspace, or under a project root that is itself a symlink, open again instead of failing with an access error (thanks to @herjarsa).
- Sidebar: searching sessions now also finds Chats — sessions that belong to no project — which used to vanish from the list as soon as anything was typed (thanks to @yulia-ivashko).
- Chat: a message made only of quoted context fragments now appears in the prompt navigator; opening or closing the context panel no longer leaves a blank tail under the last message.
- Settings/Providers: after saving an API key or signing in, the provider no longer shows "Credentials missing" with its models hidden until you switch away and back (thanks to @herjarsa).
- Projects: the folder picker can enter a directory that is already a project to browse from there (thanks to @weixiang1862), and sending, forking, and image attachments work in projects whose path has non-ASCII characters, such as `Masaüstü` (thanks to @fitzgpt).
- Git: the status panel refreshes from real repository state after checkout, branch, stash, merge, rebase, or reset, and remote branches that were never fetched appear in branch lists (thanks to @makeittech); the Branch diff scope no longer compares against the wrong base for branches created from the current branch (thanks to @gaojunran); picking `origin/main` in the branch selector checks out the local branch instead of a detached `HEAD` (thanks to @yulia-ivashko); branch search hides non-matching branches (thanks to @bashrusakh).
- Updates: "Update OpenCode" no longer fails with a bare "Bad Request" — TaskHunter names the release to install and shows OpenCode's reason when refused — and the desktop "Restart to Update" button shows why an install failed, including an unsigned local build, and stays available to retry (thanks to @mdatsev and @yulia-ivashko).
- Desktop: a crashed renderer window recovers automatically, with a visible failure page instead of a reload loop after repeated crashes (thanks to @wqpan); a slow or interactive shell startup file no longer stalls startup while TaskHunter looks for OpenCode — each probe gives up after five seconds, which is what left a Homebrew OpenCode looking undetected from a Dock launch (thanks to @mskadu).
- Windows: managed OpenCode restarts clean up orphaned listeners and process trees, closing the app stops OpenCode, and scheduled startup no longer fails on Task Scheduler's command length limit (thanks to @sergiofspedro, @a0000001, and @HAHH9527).
- Server: an `OPENCODE_BINARY` from the environment is no longer discarded when `settings.json` clears its own override (thanks to @bashrusakh); recovery through `OPENCODE_HOST` keeps the configured host and port (thanks to @colinmollenhour); `taskhunter connect-url` no longer risks tearing `settings.json` while the desktop app runs, which could unpair every device (thanks to @shijie152).
- Web/PWA: notification clicks focus an existing window, and the installed app uses the shorter "TaskHunter" name (thanks to @bketelsen and @greghaynes).
- VS Code: the extension starts in the current workspace folder instead of one restored from storage (thanks to @makeittech).
- Themes: custom themes loaded through symlinks now work (thanks to @divyam234).
- Debug: the debug panel (Ctrl/Cmd+Shift+D) has a Requests tab showing in-flight requests and their age over the last five minutes (thanks to @tomzx).

### Improvements

- Chat: the text the model writes before it asks a question appears right away instead of waiting in the Activity group until the turn ends (thanks to @makeittech).
- Usage: GitHub Copilot shows a single AI Credits window matching Copilot's token-based quota, in place of the Chat Requests and Completions windows (thanks to @jakoss).
- Files: files up to 20,000 lines open in the full-file preview, up from 5,000 (thanks to @gaojunran).
- Mobile: Chats, the sessions that belong to no project, appear in the sessions sheet above the project list.
- Projects: the folder picker can step into a directory that is already a project and browse from there (thanks to @weixiang1862).
- Web/PWA: the installed app uses the shorter name "OpenChamber" (thanks to @bketelsen and @greghaynes).
- Sidebar: Recent rows show a compact timestamp on web and desktop.

### Fixes

- **Chat:** a very large tool result is capped before it renders, so it no longer freezes the page (thanks to @JSap0914).
- Chat: a code block with JavaScript template strings no longer sends the syntax highlighter into endless backtracking (thanks to @makeittech).
- Chat: a diff with a truncated header no longer crashes the conversation (thanks to @pascalandr).
- Chat: a draft or recalled message with Windows line endings no longer throws "Selection points outside of document" every time you open it (thanks to @yulia-ivashko).
- Chat: a session no longer looks frozen after a page reload or a late second client. Pending permission and question cards come back (thanks to @yangyaofei).
- Chat: a session no longer looks frozen after you dismiss the agent's questions and send a new task (thanks to @bashrusakh).
- Chat: when the turn-ending signal from OpenCode is lost, the working spinner clears within about a second instead of up to ten (thanks to @makeittech).
- `/btw` side questions: a btw session answers the side question instead of carrying on with the parent's plan, and it forks at the last completed turn, so it never inherits a reply that is still streaming (thanks to @pocharlies).
- Composer: typing three backticks leaves the caret inside the finished code fence, an empty input keeps a visible caret, and platform autocorrect behaves as it should (thanks to @franzudev, @TTTPOB, and @IbrahimKhan12).
- Chat scrolling: with "Follow new content while streaming" off, sending from the middle of a conversation no longer jumps to the new message.
- Chat scrolling: a middle-button pan or Shift+Space stops auto-follow the way the wheel does, and an upward wheel inside a tool output box scrolls that box instead of the chat (thanks to @pascalandr).
- Chat scrolling: PageUp/PageDown in the prompt box no longer shifts the whole window up and hides the title bar.
- Chat: question prompts render Markdown (thanks to @pascalandr).
- Chat: a bare link next to CJK or full-width punctuation no longer swallows it (thanks to @gaojunran).
- Chat: inline code and chips are readable in every theme (thanks to @difagume).
- Chat: a finished reasoning block shows in full instead of replaying as if it were still thinking, the text-selection menu stays inside the window, and the sticky user-message header no longer fades over the first lines of the reply (thanks to @makeittech).
- Chat: sending without a selected model says what is missing (thanks to @rvaldemar).
- Chat: `/init` stays in slash-command autocomplete after the conversation starts (thanks to @Dawnfz-Lenfeng).
- Chat: copying a message keeps Markdown paragraph, list, and code-block spacing (thanks to @ChangeHow).
- Chat: Ctrl/Cmd+digit is ignored while you type in a field, and a model you picked by hand survives switching between Build and Plan (thanks to @makeittech).
- Chat: a message made only of quoted context fragments appears in the prompt navigator.
- Chat: opening or closing the context panel no longer leaves a blank tail under the last message.
- Files: a file reached through a symlink inside the workspace, or under a project root that is itself a symlink, opens again instead of failing with an access error (thanks to @herjarsa).
- Files: clicking a folder or file in the sidebar tree opens it reliably on macOS trackpads, where a tiny pointer move used to swallow the click (thanks to @makeittech).
- Browser: when the agent captures a page while the browser panel is hidden, the panel is revealed first instead of the capture failing.
- Work status: undoing or redoing a parent session keeps its subagents at the same point in history (thanks to @alexandrereyes).
- Mobile: opening an agent that is already open switches to its editor instead of duplicating it (thanks to @bashrusakh).
- Sidebar: searching sessions also finds Chats, the sessions that belong to no project, which used to vanish as soon as you typed (thanks to @yulia-ivashko).
- Sidebar: pending permission and question badges are no longer covered by the hover actions (thanks to @makeittech).
- Projects: sending, forking, and image attachments work in projects whose path has non-ASCII characters, such as `Masaüstü` (thanks to @fitzgpt).
- Web/PWA: a notification click focuses an existing window (thanks to @bketelsen and @greghaynes).
- Themes: custom themes loaded through symlinks work (thanks to @divyam234).
- Plans: a saved plan opens with its content again for chats, worktrees outside the project path, and tabs restored after a reload, and an edit made right before closing is no longer lost.
- Settings: the editor font size survives a restart (thanks to @pascalandr).
- Settings: a change made right before you close the window is saved (thanks to @makeittech).
- Settings: number fields and selects no longer clip at large font sizes (thanks to @makeittech).
- Settings: refreshing GitHub account state no longer interrupts the page (thanks to @floze-the-genius).
- Settings: the Cloudflare Tunnel download link works (thanks to @AyoubAchour).
- Settings: Windows skill paths are classified correctly, so disabled and duplicate skills are hidden as intended (thanks to @Ttungx).
- Settings/Providers: after you save an API key or sign in, the provider no longer shows "Credentials missing" with its models hidden until you switch away and back (thanks to @herjarsa).
- Small model: requests send the provider's configured headers, such as an API-gateway subscription key (thanks to @dmitrii-galantsev).
- Small model: a configured Anthropic endpoint is used without a doubled `/v1`, and Google models without reasoning no longer get a thinking option (thanks to @mpeter and @IngTian).
- Git: the status panel refreshes from the real repository after checkout, branch, stash, merge, rebase, or reset, and remote branches that were never fetched appear in branch lists (thanks to @makeittech).
- Git: the Branch diff scope compares against the right base for branches created from the current branch (thanks to @gaojunran).
- Git: picking `origin/main` in the branch selector checks out the local branch instead of a detached `HEAD` (thanks to @yulia-ivashko).
- Git: branch search hides branches that do not match (thanks to @bashrusakh).
- Updates: "Update OpenCode" no longer fails with a bare "Bad Request". OpenChamber names the release it will install and shows OpenCode's reason when it refuses (thanks to @mdatsev and @yulia-ivashko).
- Updates: the desktop "Restart to Update" button says why an install failed, including an unsigned local build, and stays available to retry (thanks to @mdatsev and @yulia-ivashko).
- Desktop: a crashed window recovers on its own, and repeated crashes end in a visible failure page instead of a reload loop (thanks to @wqpan).
- Desktop: a slow or interactive shell startup file no longer stalls startup while OpenChamber looks for OpenCode. Each probe gives up after five seconds, which is what left a Homebrew OpenCode looking undetected from a Dock launch (thanks to @mskadu).
- Windows: restarting managed OpenCode cleans up orphaned listeners and process trees, closing the app stops OpenCode, and scheduled startup no longer fails on Task Scheduler's command length limit (thanks to @sergiofspedro, @a0000001, and @HAHH9527).
- Windows: startup cleanup of leftover processes no longer blocks the server (thanks to @bashrusakh).
- Server: an `OPENCODE_BINARY` from the environment is kept when `settings.json` clears its own override (thanks to @bashrusakh).
- Server: recovery through `OPENCODE_HOST` keeps the configured host and port (thanks to @colinmollenhour).
- Server: `openchamber connect-url` no longer risks tearing `settings.json` while the desktop app runs, which could unpair every device (thanks to @shijie152).
- Sessions: switching quickly no longer saves the wrong scroll position, and the log no longer fills with worktree warnings for folders that are not Git repositories (thanks to @herjarsa).
- VS Code: the extension starts in the current workspace folder instead of one restored from storage (thanks to @makeittech).

## [1.21.0] - 2026-08-26

- **Chat scrolling rebuilt around your message.** Sending parks your message near the top and the reply streams in below it, gliding smoothly a paragraph at a time. Scrolling up immediately hands you the wheel; the scroll-to-bottom pill carries the model's working status while you're away.
- **Keyboard shortcuts redesigned:** single chords for everyday actions, a Cmd/Ctrl+K leader for two-step open/go actions, held Cmd/Ctrl+digit for session tabs and Cmd/Ctrl+Option+digit for panel surfaces. Shortcuts work on non-English keyboard layouts now, tooltips show the binding you actually have set, and old custom bindings reset once. The full map lives in Settings → Shortcuts (registry contributed by @ChangeHow — thanks!).
- **Chat context attachments:** diff comments, terminal selections, browser annotations, linked issues/PRs and the rest now appear in the conversation as compact context cards instead of walls of raw text.
- **Session tabs (opt-in):** the web/desktop header can show open sessions as browser-style tabs (Settings → General → Navigation). A tab switches the whole workspace; closing one never touches the session itself.
- Sessions: switching is much faster in large workspaces — the sidebar no longer rebuilds on switch and recently viewed sessions restore their rendered messages; end-to-end switch time roughly halved with thousands of loaded sessions (thanks to @c-w-xiaohei).
- Permission: cards answer to the keyboard Alt+Enter allows once, Alt+Shift+Enter allows always, Alt+Backspace denies — the keys are printed on the buttons. The auto-accept toggle got Cmd/Ctrl+K, A.
- Sessions: Cmd/Ctrl+Alt+Left/Right steps back and forward through the sessions you opened in this window, browser-history style; with session tabs enabled it moves between neighbouring tabs instead.
- Git: Cmd/Ctrl+Enter in the commit message box commits. Diff review moves between changed files with Alt+Down/Up, expanding a collapsed file on arrival.
- Chat: Cmd/Ctrl+Shift+T now cycles through every thinking level offered by the selected model instead of skipping levels after reaching the end (thanks to @nimobeeren).
- Panels: the context rail got a configure button — a dialog chooses which panels the rail shows. Hidden panels keep their data, stay reachable from the command palette, and leave the digit switcher, so digits always match the icons you see.
- Chat: comment on a reply — select text in a chat message (or a rendered markdown preview in Files) and choose Comment to attach exactly that quote, with a source line range when it can be located, plus your note. The selection stays highlighted while you type.
- Diff: comment like a review — hovering a line shows a + in the gutter; clicking or dragging across lines opens the comment editor for that range, styled like the chat's comments.
- Composer: hovering or tapping a context chip opens a stacked preview of everything attached, where a comment can be edited in place or an item removed before sending.
- Mobile: the chat comment input overlays the composer exactly and rides the keyboard; Enter makes a new line there, with attach on the button.
- Terminal: terminals no longer vanish behind your back — every tab and device shows the ones already running on the server, and background tabs survive the idle cleanup.
- Search: every searchable picker uses one matcher now — best matches first, multi-word queries in any order, punctuation ignored ("gpt4o" finds "gpt-4o"). Ctrl/Cmd+P matches whole file paths.
- Chat: @ file mentions rank files and directories together by match quality, and long paths keep the folder next to the file name visible.
- Chat: a "Follow new content while streaming" checkbox (Settings → Chat → Streaming, on by default) turns automatic following off entirely; with it off, the scroll-to-bottom pill now appears as soon as the reply grows past the visible area.
- Command palette: rarely used commands (pin session, copy session ID, multi-run launcher, archived sessions, notes, todos, status, theme) are found by typing but stay off the first screen.
- Mobile: narrowing a browser window past phone size switches into the mobile layout (and back when widened); the old/new mobile layout setting is gone.
- Browser: an agent opening a page with the browser tool no longer pops the browser panel open (or switches the surface you're on) — the page loads in the background and the rail is where you peek at it.
- Usage: the Command Code tile is gone — their official API exposes no usage data, so the tile could only fail.
- Desktop: a relay-paired default host no longer greets every restart with the "Remote Server Unreachable" screen — the stored direct address (often the pairing machine's own loopback) failing its probe now boots the app normally and connects over the relay, picking the direct route back up automatically when it answers again.
- Mobile: on Android browsers the composer now stays above the keyboard in the chat too — the keyboard could cover it with no way to scroll it into view; the draft screen's viewport pinning now covers the chat screen on Android.
- Auth: an expired TaskHunter login is announced within seconds by a banner with a Log in button, instead of being discovered through failing actions. Sending pauses until login, and a conversation that failed to load reloads itself afterwards.
- Chat: a failed send returns your typed prompt to the input — whatever the reason — instead of losing it to an error toast; a mid-send session switch lands it in that session's draft.
- Chat: opening a session or resizing panels could strand the view in a large empty space below the last message; the list now returns to the real end, and a width resize keeps a reader who was at the bottom at the bottom.
- Chat: prompt-rail and message jumps land exactly on the target once the layout finishes measuring, and clicking the last rail item always works.
- Desktop: two windows on different projects no longer hijack each other — one window's session switch could make the other adopt its project mid-typing. Notification clicks and taskhunter:// links now open in one window instead of all of them.
- Git: the branch's PR badge no longer picks up a stranger's pull request — with contributor forks added as remotes, a fork's closed PR sharing only the branch name could show up on the local branch.
- Chat: streamed code blocks are syntax-highlighted while streaming, and finished messages no longer jump when line numbers fill in.
- Chat: finished replies no longer flicker — tool cards stopped replaying their reveal animation on completion, and window resizing no longer throws the conversation around at the bottom.
- Mobile: scrolling during a streaming reply works again — a drag immediately takes over, the pill shows up, and load-older no longer throws you to the bottom.
- Fixed file links in messages being checked twice, and against the wrong project directory on the first pass.
- Fixed the selected project or session briefly jumping back to a previous choice when settings responses arrived out of order.
- Fixed sessions staying on "loading sessions" forever after a half-open connection to OpenCode — stalled reads now time out and retry (thanks to @herjarsa).
- Files: previews above the editable size cap show the whole file, virtualized so huge files no longer freeze the app (thanks to @gaojunran).
- VSCode: the chat view no longer sticks on its loading screen on slow or remote connections (thanks to @VinciYan).
- Terminal: mobile keyboards no longer capitalize the first letter of every command.
- Browser: an agent opening a page with the browser tool no longer pops the browser panel open or switches the surface you are on. The page loads in the background.
- Auth: an expired OpenChamber login is announced within seconds by a banner with a Log in button. Sending pauses until you log in, and a conversation that failed to load reloads itself afterwards.
- Chat: a failed send returns your typed prompt to the input instead of losing it to an error toast, and a session switch mid-send lands it in that session's draft.
- Chat: prompt-rail and message jumps land exactly on the target once the layout finishes measuring, and clicking the last rail item always works.
- Chat: opening a session or resizing panels no longer strands the view in a large empty space below the last message, and a width change keeps a reader who was at the bottom at the bottom.
- Chat: streamed code blocks are highlighted while they stream, and a finished message no longer jumps when line numbers fill in.
- Chat: finished replies no longer flicker. Tool cards stopped replaying their reveal animation on completion, and resizing the window no longer throws the conversation around at the bottom.
- Chat: file links in messages are no longer checked twice, and the first check no longer uses the wrong project directory.
- Mobile: scrolling during a streaming reply works again. A drag takes over at once, the pill shows up, and loading older messages no longer throws you to the bottom.
- Mobile: on Android browsers the composer stays above the keyboard in the chat, which used to cover it with no way to scroll it into view. The draft screen's viewport pinning now covers the chat screen too.
- Desktop: two windows on different projects no longer hijack each other. One window's session switch could make the other adopt its project while you were typing.
- Desktop: notification clicks and openchamber:// links open in one window instead of all of them.
- Desktop: a relay-paired default host no longer greets every restart with the "Remote Server Unreachable" screen. The app boots and connects over the relay, and picks the direct route back up when it answers again.
- Desktop: a freshly installed or updated build no longer loads the previous version's interface from cache.
- Devices: re-pairing a phone keeps the device's existing name instead of resetting it to "TaskHunter Mobile".
- Relay: paired devices no longer get logged out when the app restarts while another local TaskHunter process is running.
- Sessions: headers now find archived sessions too, so an archived session's title no longer goes missing.
- Files: the editor toolbar is always docked under the file tabs; the floating hover toolbar and its setting were removed.
- UI: the chat's scroll fades are back, the first uncached session open fades in, the timeline dialog fits small screens (thanks to @gaojunran), OpenCode notices share one style, draft target menus stay inside the chat area, Linear and Cloudflare tools show their own icons, sidebar tooltips no longer appear on passing hover, and the btw panel's shadow matches the composer.

## [1.20.0] - 2026-08-23

- **Session: /btw side questions.** Type `/btw` followed by your question to ask something off-topic in a temporary session forked from the current conversation, so it inherits the full context but leaves the chat itself untouched. The answer streams into a panel above the composer, which talks to that session while the panel is open; you can collapse it to a slim header bar, keep it as a full session, or discard it. The temporary session stays out of the sidebar and session lists until you keep it (thanks to @jaygupta17).
- **Chat sessions:** start chats without choosing a project. They live in their own Chats section, rather than inheriting a project's repository and worktree context.
- **Desktop/Remote instances:** adding an SSH connection now starts from the hosts in your SSH config instead of a blank command field. Ports, install method and passwords moved behind Advanced settings, and each connection shows Connected, Connecting, or Needs attention with the failure text and a button that resolves it.
- Desktop/Remote instances: connecting to a remote machine now works when bun, TaskHunter or the opencode CLI live in your home directory rather than on the system path. Installing no longer fails with a permission error, and a missing opencode CLI is now reported before the connection starts instead of as a stack trace.
- Desktop/Remote instances: a managed remote server can now also be published to the remote machine's own network, so other devices there reach it without the SSH tunnel. It requires a UI password, and stays private to the tunnel otherwise.
- Desktop/Remote instances: disconnecting from a connection set to not keep the server running now actually stops that remote server.
- Skills catalog: browse curated GitHub skill collections in a card-based catalog with cross-source search, skill counts, stars, recent updates, and links back to each skill's repository.
- Diff: the context-panel diff can now show every change on the current branch against its base branch. TaskHunter detects the base when Git knows it, or lets you choose one once when it does not.
- Dictation: speech is now transcribed after you stop recording. The composer shows a live waveform and timer, and long recordings split at pauses instead of cutting words.
- Settings: the project selector on Providers, Agents, MCP, Commands and Skills now only changes what those pages show. It used to switch the whole app, so opening another project's configuration moved your chat, session list and file tree with it.
- Settings/Projects: a project can now pin a thinking level next to its model, for models that offer levels. Both sit in one Defaults for new chats group, laid out like the Sessions defaults.
- Settings/General: changing the default model, variant or agent no longer repoints an open chat that already carries a model you picked for it. Chats following the default still switch immediately.
- Settings/Providers: the provider you select no longer jumps to a different one on its own. Changing the chat's model or agent, and background provider refreshes, used to move the settings selection with them.
- Settings/Integrations: the experimental page now only lists integrations that can be installed; unavailable and Coming soon entries were removed.
- Chat: file paths in messages now open from the session's project, even if you last browsed files in another project (thanks to @tomzx).
- Chat: app links such as `spotify://` now ask for confirmation before opening another app. You can trust an app link type on one device and manage trusted links in Settings.
- Files/Desktop: files opened from outside the workspace remain readable after their temporary access expires instead of failing until you reopen them (thanks to @pascalandr).
- Diff: creating an inline comment now opens the chat and focuses the composer for your follow-up.
- Chat: in the expanded composer, Enter now starts a new line and Cmd/Ctrl+Enter sends, so a long prompt is harder to send by accident.
- Providers: expanded support for custom providers.
- Small Model: summaries, goal audits, commit messages, and walkthroughs now support more providers.
- Git: generated commit messages now match the repository's recent commit style and language.
- Git: generating a pull request description now picks up the repository's own PR template when it has one, so the draft comes back in your project's sections and checklists instead of the built-in Summary/Why/Testing layout.
- Sidebar: switch between the full project list and a focused view of one project. Sessions created outside TaskHunter now also appear in the sidebar and Recent list without a page refresh (thanks to @tomzx).
- Chat: if OpenCode restarts while a response is still running, the chat now stops with an interrupted state and a notification to continue instead of hanging silently (thanks to @sum117).
- Chat: while a reply streams, the model status line under the last message now turns into the finished message's info row in place, instead of jumping when the reply completes.
- Chat: newly sent messages and syntax-highlighted code blocks no longer briefly flicker. Bash output can also grow with its content instead of being cut off.
- Chat: long user messages can be expanded even when their final layout finishes after they first appear.
- Chat: in a chat without a project, the work status card again steps aside when the context panel is open, instead of sitting next to it.
- Usage: Z.ai credit limits now appear alongside its other quota windows.
- Git: pull-request checks in Work status stay current as their status changes.
- UI: the default dialog close button is easier to click or tap (thanks to @rockinrimmer).

### Fixes

- Desktop/Remote instances: connecting to a remote machine works when bun, OpenChamber, or the opencode CLI live in your home directory rather than on the system path. Installing no longer fails with a permission error, and a missing opencode CLI is reported before the connection starts instead of as a stack trace.
- Desktop/Remote instances: disconnecting from a connection set not to keep the server running actually stops that remote server.
- Settings/General: changing the default model, variant, or agent no longer repoints an open chat that already carries a model you picked for it. Chats following the default still switch right away.
- Settings/Providers: the provider you select no longer jumps to another one on its own. Changing the chat's model or agent, and background provider refreshes, used to move the selection with them.
- Chat: if OpenCode restarts while a response is running, the chat stops with an interrupted state and a notification to continue instead of hanging silently (thanks to @sum117).
- Chat: newly sent messages and highlighted code blocks no longer flicker, and Bash output grows with its content instead of being cut off.
- Chat: file paths in messages open from the session's project, even if you last browsed files in another project (thanks to @tomzx).
- Chat: in a chat without a project, the work status card steps aside when the context panel is open instead of sitting next to it.
- Chat: a long user message can be expanded even when its final layout finishes after it first appears.
- Sidebar: sessions created outside OpenChamber appear in the sidebar and Recent list without a page refresh (thanks to @tomzx).
- Files/Desktop: a file opened from outside the workspace stays readable after its temporary access expires, instead of failing until you reopen it (thanks to @pascalandr).
- Session assist: recaps and suggested follow-ups work when the Anthropic provider uses a custom endpoint. They used to fail every time.
- Desktop/Windows: the close button lines up with the rest of the window chrome.

### Misc

- Settings/Integrations: the experimental page lists only integrations you can install. Unavailable and Coming soon entries are gone.

## [1.19.0] - 2026-08-19

- **Settings/Integrations:** a new Integrations settings page lists Claude Code, Command Code, and Cursor plugins with install, update, setup, and remove actions, plus Discord and Telegram Coming soon placeholders.
- **Project knowledge:** the Project notes panel is now Project knowledge, with notes, todos, plans and their search in a resizable sidebar. Notes are cards you expand by clicking anywhere on them, plans open and edit in the panel itself instead of a separate tab, and notes and plans can be pinned as context.
- **Files:** drag files onto the Files sidebar to upload them into the project or a specific folder; existing files require confirmation before replacement, and open previews refresh after an upload (thanks to @makeittech, @alanzchen).
- Settings: TaskHunter no longer replaces a full OpenCode config with an empty `$schema`-only stub when the file uses JSON5-style unquoted keys; Settings changes now fail instead of wiping plugins, MCP servers, and providers (thanks to @makeittech).
- Chat: an open conversation no longer keeps re-coloring the same code blocks in the background, so browsing files with a chat open stops pinning a CPU core and spinning up the fans (thanks to @makeittech).
- Stability/Proxy: the local server now reuses its connection to OpenCode instead of opening a new one for every API request. Under sustained traffic the old behavior could use up every outgoing network port on the machine, at which point nothing on the computer could open a new connection until the traffic stopped and the ports were released (thanks to @alohaninja).
- Usage/Claude: Claude plan limits now work when you are signed in through Claude Code, without also signing into Anthropic in OpenCode; the account is read from Claude Code's own login on macOS, Linux, and WSL. The page shows your session and weekly limits again, adds per-model weekly limits and extra usage spending, and names your plan. Limits are kept on screen instead of disappearing when Anthropic temporarily blocks refreshes.
- Usage/Command Code: Command Code plan limits now appear in the Usage page and work status panel.
- Git: the pull request panel now follows the branch's current open PR, and an open PR always wins over an older merged or closed one. After a PR is merged or closed the panel keeps showing it as the branch's last PR and offers creating the next one right below it (thanks to @makeittech).
- Git/Worktrees: creating a worktree from a pull request now falls back to GitHub's pull-request reference when the source fork was deleted or cannot be reached, instead of failing before creating the worktree (thanks to @makeittech).
- Chat: new chats no longer start against a deleted last worktree directory; they fall back to the active project instead of saving the first message and never starting.
- Chat: typing with Chinese, Japanese, or Korean input methods no longer interrupts composition or jumps the cursor to the end of the composer (thanks to @makeittech).
- Chat: opening a busy subagent in the context panel now shows its history instead of only the working-status line (thanks to @makeittech).
- Chat: saved chats in the context panel open again instead of staying blank.
- Chat: the context meter no longer climbs over 100% (330% readouts) after turns with many tool calls and no longer jumps when reopening an older session; it now shows what the window actually holds, everywhere the value appears — header, context sidebar, work status panel, mini chat, and mobile (thanks to @pocharlies).
- Chat/Attachments: extracted Office and OpenDocument content is now capped and presented more compactly, preventing large documents and their images from overwhelming the message context.
- Projects: project names now match the folder name exactly, so `.ssh` and `opencode-claude` are no longer shown as `.Ssh` and `Opencode Claude` in the sidebar, window title, settings and notifications; names you renamed yourself are kept.
- Files: files reached through a symlink inside the workspace now open correctly instead of being rejected as outside the workspace.
- Settings: the session retention action you pick is now saved instead of being dropped (thanks to @Gautam0507).
- Mobile: connecting through an ngrok address now bypasses ngrok's browser warning page instead of failing the server check.
- Mobile/iOS: text selection in the chat composer now uses native CodeMirror selection handles.
- Desktop: browser pages served from a self-signed loopback HTTPS address now load instead of being blocked by the certificate warning.
- Browser: typing a comment on a page no longer triggers app shortcuts.
- UI: the model menu no longer paints white text on a white highlight in a high-contrast theme, so the hovered or selected model stays readable (thanks to @bashrusakh).
- Skills Catalog: the misspelled source name ClawdHub now reads ClawHub (thanks to @makeittech).
- VSCode: Add Project adds the chosen folder to the workspace instead of showing a "Failed to add project" toast.

## [1.18.4] - 2026-08-14

### Fixes

- **Stability:** a single internal error no longer takes the local server down and leaves the instance unreachable until you restart it. The error is logged and the server keeps running.
- **Chat:** new messages no longer jump above older ones once the message ID sequence rolls over. Loading history, reverting and redoing follow the same order as the conversation.
- Mobile: connecting to a server that has authentication turned off survives closing and reopening the app. Auto-reconnect and the return-to-app check no longer read the missing password token as a lost connection and send you back to the connect screen.
- Browser: opening or restoring a dev server preview while you are connected over a relay or another non-standard address no longer crashes the app; the preview says the tunnel is unavailable.

## [1.18.3] - 2026-08-14

- **Browser panel:** the preview and browser panels are now one panel, backed by a real browser view on the desktop app. Pages that previously refused to load because they were being rewritten now open normally, logins persist, and developer tools are available. Point at an element or drag a region, write a comment, and it goes to chat with a screenshot of what you marked.
- **Agent browser control:** agents can now open a page and work with it — read what is on screen, click, type, scroll, look at how an element renders, switch between mobile, tablet and desktop layouts, and save a screenshot into the project — so they can check their own work instead of describing what they expect. It is a separate TaskHunter Web tool, turned on or off in the new Settings → General → TaskHunter Tools section.
- **Chat images:** completed assistant replies now collect Markdown images into a compact gallery with thumbnails and full-screen previews, including workspace-local images and a horizontally scrollable mobile layout (thanks to @ChangeHow).
- Sessions: switching projects now selects a session owned by the new project, and a message already being prepared stays with the session where it was submitted instead of being rerouted by a later project switch (thanks to @makeittech).
- Browser: dev servers are listed from what is actually listening, so one is offered no matter how it was started, and a server that is still starting is waited for instead of showing an error to retry by hand. The panel holds several pages at once, shows each page's own icon, suggests addresses already visited in this project, and adds a hard reload, page zoom, device sizes, a light/dark switch for the page, and clearing cookies or cached data for the panel alone.
- Browser: when TaskHunter runs on another machine, the desktop app opens its dev servers through a local port, so pages load with working hot reload and developer tools; links and redirects to another local port stay on that machine. In a web browser tab, only dev servers on your own machine can be opened.
- Remote access: pairing QR codes created while the app is open through a public domain (for example behind a reverse proxy) now include that domain as a connection address, so paired phones can reach the server over it instead of relying only on the local network address or the relay.
- Remote access: messages sent through the private relay no longer fail with a 400 error when request-body frames are lost during a connection drop; incomplete requests are retried instead (thanks to @claymor333).
- Mobile: a brief network hiccup when opening or returning to the app no longer bounces a working connection to the connect screen — the app retries in the background and reconnects on its own, while an unreachable server shows the connect screen within a few seconds.
- Mobile: long-pressing the logo on the connect screen (or the instances list) opens a connection log with a copy button, for reporting connection problems.
- Usage: quota limits enabled for display now refresh every three minutes on desktop, mobile, and VS Code, with a manual refresh action available at any time.
- Usage: OpenCode Go quota tracking now uses the existing OpenCode API key instead of requiring separate browser cookies and a workspace ID.
- Scheduled Tasks: when two TaskHunter servers use the same project configuration, a scheduled occurrence now runs only once instead of both servers starting duplicate sessions (thanks to @makeittech).
- Desktop/Windows/Linux: minimizing the window now always keeps it in the taskbar; the tray background setting, renamed "Close to the system tray", applies when you close the window.
- Performance: closed context panels no longer keep embedded chats running, and an open panel mounts only its active chat instead of every saved chat tab (thanks to @karimodm).
- Chat: opening subagent and code-review sessions in the context panel no longer steals focus from the main composer; subagent prompting is available immediately when enabled, and code-review sessions are no longer mistaken for read-only subagent sessions.
- Chat: typing `!` to enter shell mode no longer inserts the trigger into the command or moves the caret to the wrong side of it (thanks to @RyderAsKing).
- Chat: line numbers with three or more digits no longer wrap in code blocks (thanks to @ChangeHow).
- Work status: a new-session draft shows project, MCP and usage details before the session exists, a long subagent list stays inside the panel, and hiding every section still leaves the controls to bring them back (thanks to @alohaninja).

## [1.18.2] - 2026-08-10

- **Observability panel:** a new panel near to the chat brings the active goal, tasks, subagents, pinned context, MCP servers, and context usage into one live view. The session list also shows how long an agent has been working.
- **Scheduled Tasks:** projects can now define recurring tasks as Markdown files in `.agents/loops`; opening the task list discovers file changes without a restart, and loop tasks can be edited, enabled, disabled, deleted, or run from the app (thanks to @makeittech).
- **Settings:** OpenCode configuration changes now accumulate behind a single Apply & Restart action instead of restarting OpenCode after every edit; the confirmation warns when active chats will be stopped (thanks to @makeittech).
- Remote access: paired devices that use the private relay no longer lose relay access when no browser client is currently connected or device-state loading temporarily fails.
- Performance: the initial web download is about 58% smaller and startup memory use is about 22% lower; heavy Settings and syntax-highlighting code now loads only when opened (thanks to @makeittech).
- Git/Worktrees: prompts now wait for a new worktree to finish checkout before sending, and sessions resolve to the worktree that owns them instead of occasionally opening or sending against the parent repository (thanks to @ftzi).
- Git/Worktrees: setup now runs the repository's `post-checkout` hook after creating a worktree, and deeply nested worktrees no longer fail with “Filename too long” on Windows (thanks to @ftzi, @makeittech).
- Projects: new project directories can now be created outside the current workspace, and adding, creating, or cloning a project opens a new-session draft targeted at that project instead of leaving the previous session context active.
- Chat: messages submitted before switching sessions stay with the session and workspace they were sent from, and are cancelled rather than crossing into a different instance (thanks to @Wsyjq).
- Chat: queued messages no longer send into a response that is still streaming, and tool cards left running by an interrupted response settle instead of remaining stuck (thanks to @makeittech).
- Chat: shell command output is expanded by default, and adding a message to context returns focus to the composer (thanks to @pascalandr, @makeittech).
- Chat: fresh messages no longer replay their entry animation after they have already been shown, and iOS users can insert a newline with Shift+Enter again (thanks to @makeittech).
- Chat: the composer caret is now easier to see.
- MCP: authorization now handles browser callbacks more reliably, settings distinguish available and unavailable servers more clearly, and failed connections expose a retry action.
- Usage: added xAI quota reporting (thanks to @iamhenry).
- Terminal: default tab names remain unique after tabs are closed, Escape reaches terminal applications instead of closing the context panel, and background connections send fewer keepalives (thanks to @makeittech).
- Desktop/macOS: choosing a folder after denying filesystem access now recovers correctly instead of leaving the app unable to open the directory (thanks to @deatheros).
- Desktop/Windows: minimizing from the taskbar now remains a native minimize while the app's own minimize action can still hide to the tray (thanks to @pascalandr).
- Desktop: overlay scrollbars auto-hide again after scrolling instead of remaining permanently visible.
- Mobile/Android: pairing QR codes now work in older WebViews that misread `taskhunter://` links (thanks to @CMBill).
- Mobile: pending agent questions now reappear after a cold start instead of leaving the session waiting without an answer prompt.
- Files: removing an attached Office or OpenDocument file also removes the images extracted from that document, and Linux reveal failures now surface as an error instead of escaping in the background (thanks to @chiamsun, @pascalandr).
- VSCode: notebook links now open in the notebook editor when a compatible extension is installed (thanks to @TTTPOB).
- Settings: rapid edits to notification templates no longer overwrite one another, and the collapsed-user-message preference now persists correctly (thanks to @AmanTahiliani, @pascalandr).
- Walkthrough: branch comparisons now use the repository's actual remote default branch instead of assuming its name (thanks to @RyderAsKing).
- Server: foreground installs managed by a user systemd service now update through a separate transient service instead of being interrupted by the server restart (thanks to @SYU8384).
- Security: updated archive extraction to address GHSA-xcpc-8h2w-3j85 (thanks to @mel0nyrame).
- UI: dialogs, dropdowns, popovers, and tooltips now use consistent glass styling; the macOS vibrancy option was removed to reduce rendering overhead.

## [1.18.1] - 2026-08-04

### New

- **Sessions:** an archived session can be restored to the active list, from the sidebar context menu, the archived-sessions page or the bulk-selection bar. Permanent deletion is no longer the only option (thanks to @makeittech).
- Chat: Ctrl/Cmd+L adds the selected text to the chat input, or focuses the input when nothing is selected. The toggle-sidebar shortcut moved to Ctrl/Cmd+Alt+L.

### Improvements

- Providers: an OAuth-only provider shows a Connect flow in place of the API key form, and its models appear once you are signed in.
- Providers: a sign-in that needs extra details, such as GitHub Copilot Enterprise, asks for them before it opens the browser.

### Fixes

- **Providers:** signing in to an OAuth-only provider completes. The browser login is stored and the provider list updates, so you are no longer left signed out.
- Providers: the copy button for device codes works.
- Chat: a model you chose by hand stays selected after a delegated subtask finishes; it no longer reverts to the agent's default model.
- Walkthrough: models without a working provider login are gone from the walkthrough picker, and Generate stays disabled until you pick a usable model, so it no longer fails with a raw provider error.
- Walkthrough: connecting to a server older than the app says the server needs updating instead of showing a raw HTML parsing error. The "Critical" tag is now "Key change" with a tooltip, so it no longer reads as a problem found in your code.
- Agents/CLI: a prompt that never reaches its session is reported as failed, and an unavailable model, agent or variant is rejected with a clear error before anything is created.
- Desktop/Linux: "Open in Terminal" no longer launches a non-terminal app that is set as the terminal launcher (thanks to @kydorn).

## [1.18.0] - 2026-08-04

- **Walkthrough:** a new guided walkthrough reorders a diff into a sequence of stops — the model groups related changes, explains what each one does, and orders them so each builds on the last. Start one from the Changes and pull-request views for uncommitted work, a branch against its base, or a pull request; nothing runs on its own. Walkthroughs are written in your interface language by default, and the panel can generate one in any other supported language.
- **Mobile/Tablet:** reworked the tablet and foldable layout around the phone's navigation — a persistent resizable sessions sidebar on the left, the workspace (Changes, Files, Terminal, Notes, MCP) as a resizable right sidebar, and app pages like settings and instances shown as centered dialogs. An open diff, edited file, or attached terminal now survives rotation.
- **Providers:** custom OpenAI-compatible providers can now be added and edited from Settings, including their endpoint, models, credentials, headers, and configuration scope (thanks to @makeittech).
- Performance: fixed Bun dependency chunking so the web app no longer downloads a single 18.5 MB vendor bundle at startup; heavy syntax highlighting, screenshot, diagram, editor, and image-conversion libraries now load only when needed (thanks to @makeittech).
- Performance: expanding projects with many worktrees no longer repeatedly reloads their session data.
- UI/Localization: added German interface translations and German documentation (thanks to @SGD-DEV).
- Mobile/Android: pairing QR codes can now be scanned on devices without Google Play Services; the camera closes as soon as a code is recognized, followed by a connection-in-progress screen.
- Mobile/Android: left and right drawer swipes can now start farther from the screen edge, outside Android's system Back gesture area.
- Sessions: launching TaskHunter from a directory other than your project (for example your home folder) no longer produces repeated "not a git repository" errors that could stop sessions and projects from loading (thanks to @makeittech).
- Sidebar: a worktree shared by more than one project no longer appears twice (thanks to @makeittech).
- Sidebar: session titles no longer clip at the ends of their rows.
- Git/Diff: opening a changed file now jumps its header directly to the top, and live updates refresh only files that actually changed while preserving the current review position. Saves from the built-in file editor update the diff too.
- Terminal: opening a terminal no longer waits for the terminal view to finish loading, and startup output is retained if it arrives before the view appears (thanks to @makeittech).
- Chat/Tools: Bash output now applies terminal control characters and strips ANSI formatting, preventing progress output and rewritten lines from appearing as raw escape sequences (thanks to @catan271).
- Chat: queued messages now retry after a temporary send failure or an interrupted turn instead of remaining stuck until another session update.
- Chat: prompts sent through the private relay no longer produce duplicate replies when the connection drops after OpenCode accepted the message, and a queued message already being sent is no longer included in another send.
- Settings/Skills: repository-local `.agents/skills` now appear for the active project (thanks to @makeittech).
- Settings/Skills: renaming a skill now preserves its instructions and supporting files; only skills in locations TaskHunter can safely rename show the action (thanks to @makeittech).
- Sessions: sessions in a newly created worktree now appear without restarting or refreshing the app.
- Agents/CLI: creating a session in a new worktree no longer reports a timeout while the worktree continues to be created in the background.
- Sessions: archiving and unarchiving now stays scoped to the current instance and workspace (thanks to @alexandrereyes).
- Usage: added DeepSeek quota tracking (thanks to @airtaxi).
- Usage: Kimi for Coding now calculates usage correctly when the provider reports either used or remaining quota (thanks to @makeittech).
- Desktop/Linux: terminals and OpenCode now start with the correct shell arguments in AppImage installs, fixing broken zsh startup (thanks to @makeittech).
- Files: browser clients now label file exports as downloads and no longer show the desktop-only reveal action (thanks to @makeittech).
- Chat: assistant messages no longer render active HTML.
- VSCode: clicking an apply_patch tool result now opens each changed file at its correct path instead of always opening the first file (thanks to @nabsiddiqui).

## [1.17.2] - 2026-08-01

- **Mobile:** rebuilt the app navigation around two swipe drawers — a sessions drawer (left) with a cross-project tree, swipe actions to rename, archive, or delete sessions, and a workspace drawer (right) with Changes, Files, Terminal, Notes, and MCP tabs. Tapping the session title in the header switches recents from a compact overlay with live status indicators. Cold launches reopen the last active session and land on an explicit connect screen on failure instead of flashing an empty draft.
- **Desktop/Windows:** added Windows ARM64 support (thanks to @airtaxi).
- UI: a new TaskHunter theme (dark and light) is now the default, replacing the previous default theme.
- Desktop: the active session header now has a menu with rename, share, export, archive, delete, and copy-ID actions; share links copy to the clipboard automatically when created.
- Performance: opening the first session after startup is faster — background startup requests no longer queue ahead of the initial message load (thanks to @yulia-ivashko).
- Sessions: a root session can now be moved with all its sub-sessions into a new worktree directly from the header menu.
- Git/Diff: symlinks now appear as link entries in the diff view instead of showing their file content.
- Desktop/Linux: added a Window Controls Style setting to switch between classic rectangular buttons and macOS-style traffic lights (thanks to @kydorn).
- Files: added a global Auto-save setting under Settings → General; binary, PDF, and Office files are excluded from auto-save (thanks to @makeittech).
- Terminal: switching terminal tabs no longer rebuilds the connection from scratch on each open or switch (thanks to @makeittech).
- Sidebar: sessions with active agents now show a live activity indicator even when the sidebar is collapsed (thanks to @pascalandr).
- VSCode: per-session permission auto-accept now replies to live permission requests correctly when auto-accept is turned on.
- Usage: all Z.ai usage windows now appear in the usage view.
- Chat: tool descriptions now show the glob pattern when a tool's input uses one.
- Desktop: sticky session headers in the sidebar no longer blink or shift position during page transitions (thanks to @ChangeHow).
- Chat: clicking in the padding area of the composer now correctly places the cursor (thanks to @IbrahimKhan12).
- Chat: the `/` command menu no longer lists a skill twice when a command shares its name (thanks to @IbrahimKhan12).

## [1.17.1] - 2026-07-29

- **Chat tools:** Bash tool cards now show output before a command finishes, keep it in a fixed-height pane, and follow new lines until you scroll away. Long-running commands no longer remain at a 300-second duration, and their timers continue until they finish.
- System prompt optimization: added an optional Behavior setting that reduces OpenCode's built-in system prompt by about 40% for the build and plan agents; it applies after restarting OpenCode and is unsuitable for custom build or plan definitions.
- OpenCode: chats now recover when OpenCode stops responding during a response, and managed OpenCode no longer restarts repeatedly during a temporary connectivity failure.
- Desktop: bundled OpenCode no longer offers a separate update; it updates with TaskHunter (thanks to @yulia-ivashko).
- Chat: fully loaded histories no longer show "Load older" again after a refresh.
- Chat: messages removed by reverting no longer reappear after you send another message.
- Chat: slash-command starters now include text already entered in the draft as command arguments.
- Session goals: goals started from slash commands, including scheduled tasks, now use the command's expanded instructions.
- Usage: OpenAI business-account Codex usage now shows the configured spend limit (thanks to @jrandiny).
- Desktop/Linux: AppImage tray menus now include Show, Hide, and Close, and "Open in" shows system application icons (thanks to @makeittech).
- Settings: subpanels keep a visible vertical scrollbar and no longer show a horizontal scrollbar (thanks to @sergiofspedro).
- Mobile: image previews load when connected through the private relay.

## [1.17.0] - 2026-07-28

- **Context panel:** a new surface rail brings Changes, pull requests, files, terminal, notes, plans, previews, and side chats into one resizable panel. The pull-request surface now shows live checks and comments, and can attach failed checks or comments to a chat draft.
- **Desktop/Linux:** official AppImage releases for x64 and arm64, with in-app updates, frameless window controls, system tray minimize, launch at login, multi-window support, and “Open in” for discovered installed apps. Missing update manifests are treated as “no update” instead of a hard failure, and updater errors surface in About/sidebar (thanks to @BestSithInEU, @jibanez-staticduo, @makeittech).
- **Sidebar:** sessions are organized into Recent and project zones with worktree-grouped or flat views. Scheduled tasks, archived sessions, multi-run, and worktree management now open as full-page views from the sidebar.
- **Agents/CLI:** agents on managed local instances can now create, send to, fork, inspect, and wait for sessions; create isolated worktrees; and manage scheduled tasks through the TaskHunter tool. The CLI adds matching `session`, `schedule`, `projects`, and `models` commands, and a new Schedule a Task starter guides task setup from chat.
- Chat composer: prompts now render Markdown emphasis, attention lines, file and agent mentions, slash commands, snippets, attachment citations, and `~path` references directly while you type. File mentions can be edited in place, and the mobile composer grows with its content instead of using a separate fullscreen gesture.
- Desktop/Linux: fixed an intermittent freeze or crash while chats were streaming with the system tray enabled (thanks to @kydorn).
- Small Model: GitHub Copilot models now use their supported API, fixing summaries, goal audits, commit messages, and other Small Model actions for models that do not support Chat Completions (thanks to @jakoss).
- Chat: selecting text from Markdown code blocks now preserves the code fences, language, and surrounding block structure when adding it to the composer or starting a new session (thanks to @ChangeHow).
- Chat: code blocks no longer shift line layout or merge adjacent text while rendering, and copied code keeps its original text (thanks to @ChangeHow).
- Chat/Permissions: sending a message while a permission prompt is open now denies pending requests in the session and its subagents, then queues the message for the next turn (thanks to @tomzx).
- Chat/Subagents: subagent chats can be prompted when direct subagent prompting is enabled, even if the parent session has not loaded.
- Chat: jumping to messages in long conversations now lands on the intended message when earlier rows have not been rendered yet.
- Settings: added an option to hide starter suggestions on the new-session screen.
- Mobile/Android: terminal taps now open the keyboard, text and backspace input work with Android keyboards, and closing a focused terminal no longer leaves the app unresponsive.
- Shortcuts: fixed a regression where double-Escape could be primed when the current session was not active.
- Mobile/iOS: push notifications now use Apple’s production service by default (thanks to @natheihei).
- Mobile/iOS: notifications now work for development builds installed from Xcode — the app detects its Apple push environment and the server delivers each device to the matching endpoint, so dev (sandbox) and TestFlight/App Store (production) installs both receive pushes.
- Usage: added Crof and NeuralWatt quota tracking with subscription kWh, independent key-allowance windows, and credits-balance fallback across the web server and VS Code extension (thanks to @kydorn).

## [1.16.3] - 2026-07-22

### New

- **Chat attachments:** attach Office and OpenDocument files (`.docx`, `.pptx`, `.xlsx`, `.odt`, `.odp`, `.ods`). Their text and the embedded images OpenChamber can read are pulled out before the message goes off.
- **Sessions/Worktrees:** move an idle root session, its sub-sessions, and your uncommitted changes into a new worktree.
- Chat attachments: more source-code formats, notebooks, HAR files with credentials and cookies stripped, SVG and Draw.io drawings, and HEIC/HEIF images. The composer warns you when the chosen model may ignore an attachment type.
- Desktop: start straight into a saved remote instance, a URL, or a pairing link, with no local OpenCode and no local server.
- Scheduled Tasks: a task can start with permission auto-accept on. Its permission and Run as goal controls are the same compact toggles as in the chat composer.
- Desktop/macOS: a setting hides the menu bar item.

### Improvements

- **Performance:** opening and switching sessions in a big workspace puts the selected and visible chats first.
- Chat: an assistant turn shows model, agent, thinking level, duration, and time together in its footer, and replies split by a hidden system or subagent prompt read as one turn.
- Sidebar: projects are ordered by hand by default. A sorting choice you made yourself stays as it is.
- Desktop/Windows: SSH remote instances connect through native Windows OpenSSH. Password login and port forwarding run in hidden background processes, and a failed connection shows the SSH error itself.
- Mobile/Terminal: opening the terminal in a mobile browser or PWA focuses the input and raises the keyboard with no second tap (thanks to @bashrusakh).

### Fixes

- Performance: a failed refresh keeps the session list you had, a parent session no longer vanishes when its sub-sessions load first, and session data stays inside its own instance, project, and worktree.
- Chat: the working indicator names the model actually writing the reply, streaming at the bottom no longer jitters, and a new user message finishes its entry animation instead of snapping into place.
- Chat/Tools: attachments returned by plugin and custom tools stay visible after streaming and refreshes, with the same image previews and file chips as your own attachments (thanks to @FrostiDrinks).
- Sessions/Worktrees: creating a worktree recovers when an earlier Git operation left the repository locked.
- VS Code and Cursor: opening a chat no longer crashes when the editor webview lacks its usual messaging APIs, and a closed editor tab stops receiving late streaming messages (thanks to @makeittech).
- VS Code: the active workspace is worked out before saved state is restored, so a project outside the editor workspace cannot replace it.
- Context Panel: a slow file-open request no longer yanks the panel back to that file after you picked another tab.

## [1.16.2] - 2026-07-18

- **Terminal:** rebuilt terminal sessions across the Web, Desktop, and Mobile apps with faster rendering, retained scrollback after reconnecting, shell and login-shell selection, restart and selected-output attachment actions, live theme changes, and more accurate Unicode and full-screen app rendering. Mobile now includes a full-screen terminal workspace with touch scrolling and selection, quick keys, and Ctrl/Alt input.
- **Pinned messages:** pin important user or assistant messages to restore their text to the agent after conversation compaction.
- **Settings:** pages now use a consistent responsive layout, navigation is grouped into TaskHunter, Workspace, OpenCode, and Library sections, and save failures are shown in the page header. Agent tool permissions now distinguish inherited and explicit rules and show session-granted rules separately (thanks to @makeittech).
- Session goals: audits now wait while direct subagents are still active, and goal details show the model used for the latest successful evaluation.
- Chat: if creating a session fails, the new-session draft stays open and restores the submitted prompt instead of discarding it.
- Sessions: new drafts and sessions now stay with the project selected in the sidebar, including workspaces with nested or sibling projects (thanks to @bashrusakh).
- Small Model: provider API keys referenced through environment variables or files now work for summaries, goal audits, and other Small Model features; Gemini 3 Flash models now use their supported thinking setting.
- VSCode: per-session permission auto-accept works again, persists across extension restarts, and applies to subagent sessions while an TaskHunter view is open.
- Mobile/Android: update downloads now select an APK when a release also includes an Android App Bundle.

## [1.16.1] - 2026-07-14

### New

- **Prompt Navigator:** an optional marker rail beside desktop chats. Hover a marker to preview that prompt, click to jump to it, or give it a shortcut in Keyboard Shortcuts settings (thanks to @makeittech).
- Chat/Subagents: "Open subtask" works for nested subagents in the side-panel chat, and a Parent action takes you back to the previous subagent (thanks to @ameshkov).

### Improvements

- Chat: a shell-mode command card updates its status and output while the command runs, and highlights the command and its output.
- Small Model: a custom OpenAI-compatible provider uses the base URL and API key from your OpenCode configuration (thanks to @ameshkov).

### Fixes

- **Performance:** a large session sidebar stays responsive while chats stream, including setups with many projects, worktrees, and sessions.
- Chat: opening a long chat after an empty or aborted agent turn no longer reloads bigger and bigger parts of its history.
- Chat/Subagents: a task card follows its own subagent when several run at once, so its activity and "Open subtask" no longer point at another session.
- Sessions: a temporary project lookup failure no longer drops worktree groups from the sidebar.

## [1.16.0] - 2026-07-13

- **Session goals:** arm the new target button in the composer and your next prompt becomes a [goal](https://docs.openchamber.dev/session-goals/) — the session keeps working toward it on its own, with an independent small-model audit checking each finished turn, until the objective is verifiably complete, blocked, or over its optional token budget. The loop runs on the server, so it continues with the app closed and survives restarts. A goal strip above the composer shows progress with pause/resume; goals can also start from the plan-implement dialog, from scheduled tasks ("Run as goal"), or with the new "Craft a Goal" starter and `/craft-goal` command. While a goal runs, per-turn "ready" notifications are replaced by a single notification when it settles.
- **Usage:** OpenCode Go usage tracking is here, and Codex quota windows now show the correct reset times.
- **Remote access:** connecting over the relay got much faster — the app no longer waits for a stale local address to time out before trying the relay (previously up to ~20 seconds on a phone away from home). When your computer gets a new local IP, paired devices now learn the new address over the relay and quietly move back to the local network on their own — no re-pairing. The phone's launch screen shows which device it is connecting to.
- Remote access: running several TaskHunter instances on the same machine no longer makes paired devices land on a random one of them — only one process per machine serves the relay now. This was behind intermittent "Unable to reach server" errors on paired phones.
- Permissions: per-session auto-accept now lives on the server — sessions keep auto-accepting tool calls while the app is closed and after a server restart, subagent sessions inherit the setting, and it can be enabled on a draft before the first message (thanks to @bashrusakh for the draft fix).
- Chat: subagent sessions can now be prompted directly — open a subagent from the context panel and send it follow-up messages (off by default, available in settings).
- Chat: queued messages now send when the session is already idle instead of waiting forever in some cases, pending agent questions stay answerable after a server restart, and session renames no longer flicker back to the old title (thanks to @bashrusakh).
- Files: the file viewer has a markdown preview toggle (thanks to @greghaynes).
- Sidebar: projects can be sorted several ways, with a direction toggle (thanks to @bashrusakh).

### Improvements

- Permissions: per-session auto-accept lives on the server, so a session keeps auto-accepting tool calls with the app closed and after a server restart, and subagent sessions inherit it.
- Permissions: auto-accept can be turned on for a draft before the first message (thanks to @bashrusakh).
- Settings: chat visual settings are grouped into labeled sections (thanks to @bashrusakh).
- Command palette: fuzzy search covers projects alongside sessions and files (thanks to @bashrusakh).
- Editor: "Open in" recognizes VS Code Insiders.
- Remote access: the phone's launch screen names the device it is connecting to.

### Fixes

- **Remote access:** connecting over the relay is much faster, with no wait on a stale local address that could take around 20 seconds on a phone away from home. When your computer gets a new local IP, paired devices learn it over the relay and return to the local network on their own, with no re-pairing.
- Remote access: running several OpenChamber instances on one machine no longer lands paired devices on a random one, which was behind the intermittent "Unable to reach server" errors on paired phones.
- Chat: a queued message sends when the session is already idle instead of waiting forever (thanks to @bashrusakh).
- Chat: a pending agent question stays answerable after a server restart (thanks to @bashrusakh).
- Chat: a renamed session keeps its new title instead of flickering back to the old one (thanks to @bashrusakh).
- Sidebar: pinned sessions survive a refresh, and the file tree stays expanded while it refreshes (thanks to @bashrusakh).
- Usage: Codex quota windows show the right reset times.
- GitHub: PR and issue context resolves against the source repository when you work in a fork (thanks to @bashrusakh).
- Notifications: session errors and subagent completions arrive on desktop, web, and mobile.
- Agents: saving agent settings from the UI keeps custom YAML frontmatter fields (thanks to @bashrusakh).
- Windows: a difference in drive letter casing no longer splits one project into duplicates (thanks to @bashrusakh).
- Mobile: the sessions sidebar opens right away instead of taking many seconds on some devices (thanks to @tomzx).
- Mobile: renaming a saved instance keeps its connection working. The stored access token was being lost on edit.
- Mobile: on Android 15 the app no longer draws under the status bar.
- Security: a request that fakes local host headers to look like same-machine traffic is rejected.

## [1.15.0] - 2026-07-10

- **Remote access:** a new [private relay](https://docs.openchamber.dev/private-relay/) lets you reach your instance from anywhere — no open ports and no third-party tunnel, over an end-to-end-encrypted tunnel. It turns on by itself when you pair a device over it and turns off once no paired device uses it (thanks to @yulia-ivashko).
- **Mobile:** the native iOS and Android apps open for testing — join the [iOS public beta on TestFlight](https://testflight.apple.com/join/5ek6GU1E) or grab the Android APK from the [latest release](https://github.com/openchamber/openchamber/releases/latest). Connect by scanning a QR code from "Add a device" on your server; the app then moves between your local network and the private relay on its own — leaving home carries the open session onto the relay and coming back returns it to Wi-Fi, no re-pairing. Saved instances show a live Connected status with the active transport, iPad gets a split layout with a persistent sessions sidebar and a resizable Changes/Files sidebar, and the app checks for TaskHunter updates itself (Android shows a download toast).
- **Pairing:** a redesigned ["Add a device"](https://docs.openchamber.dev/connect-devices/) dialog asks where you'll use the device — Anywhere (relay with local network preferred at home), Home network only, or This computer only — then shows a large scannable QR code with a copyable link, and closes itself once the device connects. Links are single-use expiring codes redeemed on connect instead of embedding a long-lived token in the QR (thanks to @yulia-ivashko).
- Devices: the "Connect to this server" list now shows each paired device with a live status — Connected · Local network or Relay — and a platform badge (iOS, Android, macOS, Windows, Linux). Re-pairing or re-entering the password on the same device updates its existing entry instead of adding a duplicate.
- Devices: a paired phone or desktop names the connection after the server's hostname; the name typed when creating the link labels the device in the server's list.
- Desktop: saved servers keep every transport their pairing link carried — the app connects directly on your network and falls back to the relay away from it, including when opening a server in a new window and when restoring the connection after a restart.
- Desktop: the header dropdown (instance / usage / MCP) was restyled with cards — usage grouped per provider, hosts showing a colored status line with ping and the active host highlighted, and MCP servers in one card. Host statuses persist between openings instead of flashing "Unknown", and switching to an already-checked host is immediate.
- Desktop: the servers list in Settings shows live per-server reachability, and importing a pairing link is the primary way to add a server.
- Desktop: Windows builds can launch at login and minimize to the system tray (thanks to @achcyano).
- Chat/Tools: every tool call now expands to show its input, result, and errors, including MCP, plugin, and custom tools; Read and Skill stay compact links to their files. JSON results open in a new navigable summary view with linked URLs and expandable nested data, alongside tree and raw JSON views.
- Chat/Tools: expanded file-edit and patch results now include per-file buttons to open the diff or jump to the first changed line in the file editor.
- Chat/Thinking: reasoning parts stay separate and in chronological order instead of merging into one block, and collapsed previews no longer show empty trailing HTML comments.
- Projects: each project can now set its own default model (thanks to @makeittech).
- Diff/Chat: added a Last turn mode to the Diff view, and latest-turn changed-file chips in chat now open that snapshot while older turn chips stay read-only.
- Chat: Mermaid diagrams now have zoom controls (thanks to @c-w-xiaohei).
- Chat: code blocks can show line numbers that stay aligned while streaming, and a new Wrap Code Block Lines setting (Settings → Chat) controls long-line wrapping.
- Chat: with Sticky User Header enabled, user messages no longer float over earlier messages in long conversations.
- Chat: if sending a message times out or loses the connection after OpenCode accepted it, the app now keeps the sent message instead of rolling it back as failed.
- Mobile: selecting local files from the composer now attaches the picked files even if the composer switches between compact and expanded layouts while the file picker is open.
- Browser: links clicked inside an embedded browser tab now keep the tab on the navigated page instead of remounting the frame.
- Context Panel: raw message rows now keep token and time columns aligned without showing shortened message IDs.
- UI: closing the right sidebar after resizing no longer leaves stale width constraints behind.
- Server: remote clients with non-ASCII project paths connect again (thanks to @FanFan4204).

## [1.14.1] - 2026-07-07

### New

- **Chat:** a finished reply can show a short recap and a suggested next message. Each one has its own setting.
- Settings: a Small Model setting picks the model that writes recaps, suggestions, and other helper text.
- Voice: read-aloud can summarize long text with the Small Model before speaking it.
- Chat: the timeline dialog loads older messages when the session history is not fully fetched yet.

### Improvements

- Notes/Todos: adding selected chat text to a note summarizes it with the Small Model.
- Git/GitHub: commit messages and pull-request text are written by the Small Model from settings.
- Chat: file references with a line range like `src/file.ts:10-20` are clickable (thanks to @Catan).
- Mobile: the dictation transcript grows the composer the same way typed text does.

### Fixes

- Git/Diff: opening a changed file jumps to the first changed line.
- Mobile: the composer keeps focus when the keyboard opens.
- Mobile: iOS PWA safe areas, keyboard overlays, and the connection check on app resume behave correctly.
- Desktop: a password-protected instance opened from the desktop app or a browser gets the right unlock screen.
- VS Code: favorite models stay saved after the extension restarts (thanks to @Catan).
- VS Code: closing Settings returns to the view you came from (thanks to @Catan).

## [1.14.0] - 2026-07-05

### New

- **Voice: dictate straight into the composer.** The mic shows a live transcript with a volume meter and timer while you speak. When you stop, you can cancel it, insert the text, or insert and send.
- **Mobile: a compact composer.** While the keyboard is closed the composer shrinks to a single bar, with a round new-session button beside it. Tap the bar to expand it and open the keyboard, or tap the mic to dictate.
- Voice: speech-to-text runs on your machine. Pick a model in Settings → Voice and it downloads on demand: Parakeet for English and 25 European languages, or Whisper for a lighter multilingual option.
- Voice: dictation can use any OpenAI-compatible Whisper endpoint instead of a local model.
- Voice: a shortcut turns dictation on and off, mod+alt+v by default, and you can change it.
- Voice: read-aloud can speak with a local Kokoro voice, in any of 11 English voices.
- Voice: a new "Enable voice input" toggle in Settings → Voice hides the composer mic.
- Mobile: drag the handle above the composer to write in a fullscreen editor. Swipe down to shrink it back or to dismiss the keyboard.
- Mobile: the attachment menu and the new-session project and branch pickers open as bottom sheets with search.
- Mobile: a button at the top of a long conversation loads older history, and it goes away once everything is loaded.

### Improvements

- Voice: read-aloud starts speaking a long reply after about a sentence.
- Voice: the Voice settings page is simpler. One read-aloud toggle owns all the playback options.
- Mobile: the model and agent selectors sit in a row above the message text.
- Mobile: the slash-command, file, agent, skill and snippet autocompletes are sized for touch. They can grow up to the top of the chat, row icons line up, and picking a command keeps the keyboard open.
- Mobile: loading older messages keeps your scroll position steady, on every platform.
- UI: long lists across the app scroll more consistently.
- Desktop: the app uses your own OpenCode install when you have one. The bundled CLI runs only when no OpenCode is installed anywhere on the machine.

### Fixes

- **Desktop: a local instance with a UI password and LAN access opens again.** It no longer gets stuck on "Auth required" and an unreachable-server screen, including when the server is bound to 0.0.0.0.
- Chat: the stop button aborts a session running in a different project or worktree. Those aborts used to do nothing at all.
- Windows: OpenCode installed via npm launches from paths with spaces such as C:\Program Files\nodejs, a binary path pasted with quotes around it works, and the app also looks in the system-wide npm prefix and Scoop's shims.
- Voice: a failed transcription keeps its audio, so you can retry it or accept the partial text.
- Mobile: a phone browser on a password-protected instance shows the password unlock page again, after 1.13.9 broke it.
- Mobile: the branch and worktree picker on the new-session screen lists every worktree right after a cold start.
- Mobile: the GitHub connection is recognized without re-running the connect flow.
- Mobile: returning to the app no longer flickers the session list.
- Mobile: the chat and composer ride the keyboard in one smooth motion, long conversations included.
- Mobile: bottom sheets slide in cleanly while the keyboard dismisses.
- Mobile: the text cursor stays where you left it when the keyboard opens.
- Mobile: starter suggestions on the new-session screen step aside while the keyboard is up.
- Mobile: switching instances clears the previous instance's sessions from the list.
- Mobile: scrolling an autocomplete list no longer bounces the page behind it.
- Mobile: in a phone browser the composer stays above the keyboard on the new-session screen and in the fullscreen editor.
- Mobile: opening the app shows the logo while it connects, with no flash of an unreachable-server error.

## [1.13.9] - 2026-07-02

- Mobile: added the native iOS and Android app projects ahead of the mobile app release, with continued polish for saved connections, password unlock, QR-code connection scanning, push notifications, iOS widgets, app resume, and native layout details.
- Desktop: the app can now use a bundled OpenCode CLI, or you can choose your own CLI path in settings.
- Desktop: added a Keep awake setting for the upcoming desktop app release to prevent the computer from sleeping while the app is running.
- Desktop: you can now specify optional custom headers when adding a remote TaskHunter instance to the desktop app, including for Cloudflare Access-style setups; settings and environment variables can still override them, and the bundled CLI can be replaced by setting a direct OpenCode CLI path.
- Desktop: SSH remote instances with a saved UI password now open directly after the tunnel connects instead of showing the unlock screen again.
- Chat: fixed edge cases where late-loading tool content, subagent content, or streaming Thinking blocks could pull the conversation away from the latest message or fight manual scrolling.
- Chat: embedded JSON examples in messages no longer render as generated-result cards.
- Sync: chat state now recovers after idle reconnects instead of leaving sessions stuck in a stale busy state.
- VSCode: clearing optional agent fields now removes them from agent config instead of saving `null` values.
- VSCode: the extension no longer picks OpenCode desktop app installs when looking for the standalone OpenCode CLI.

## [1.13.8] - 2026-06-29

- Startup: launching the app no longer hangs for around 20 seconds before you can open a session, load a diff, or send a message — GitHub pull request status checks no longer tie up the connection to the server during startup.
- OpenCode: when a separate OpenCode is already running (the TUI, `opencode serve`, or a daemon on the default port 4096), the app now starts its own server instead of attaching to it. This fixes the "TaskHunter could not finish initialization" error and stops the app from opening or closing your separate OpenCode when it starts and quits. Connecting to an external OpenCode now requires setting `OPENCODE_HOST`, `OPENCODE_PORT`, or `OPENCODE_SKIP_START`.
- Chat: a new Follow-up behavior setting (Settings → Chat) controls what happens when you press Enter on a message while the agent is still responding — Steer inserts it into the agent's current turn, or Queue holds it until the turn finishes. Replaces the previous queue-mode toggle (thanks to @bashrusakh).
- Sessions: deleting a worktree group from the sidebar, or permanently deleting an archived session that has subagent sessions, now removes those subagent sessions too instead of leaving them behind (thanks to @bashrusakh).
- Sessions: clicking a session inside a worktree group no longer briefly jumps the selection to the project's first session while the sidebar data catches up (thanks to @bashrusakh).
- Sync: a connected but quiet session (for example an agent running a long tool call) no longer triggers repeated background refreshes every ~15 seconds (thanks to @tomzx).

## [1.13.7] - 2026-06-28

- Chat: with tool calls (such as Bash and Edit) shown expanded by default, scrolling no longer twitches, and slow scrolling no longer jumps past several messages.
- Mobile: in long conversations, older messages now load before you reach the very top, and fast scrolling no longer leaves blank gaps where messages briefly disappear until you scroll back.
- Mobile: the model and agent buttons in the composer are now borderless and cleaner, show the provider logo next to the model name, and shorten long names with an ellipsis; in the model picker the thinking-variant control is plain text with a chevron and each row's controls line up.
- Mobile: interface labels (the model and agent selectors and other small labels) are back to their previous size after 1.13.6 shrank them too much.
- Providers: the Add provider form stays open while provider data refreshes or a model is picked in the background, instead of snapping back to an existing provider.
- CLI: `taskhunter update` works again after a missing helper broke the command.

## [1.13.6] - 2026-06-28

### New

- **Desktop/macOS: the Dock icon can carry a badge** counting chats with unseen activity. A new Appearance setting turns it off.

### Improvements

- Chat: scrolling stays steady while you send, queue, stream, switch sessions, and load older messages.
- Context Panel: a chat tab is named after the session, and the chat you are looking at is marked as seen.

### Fixes

- Chat: picking a skill you installed from the slash command menu runs the skill and pulls in its content. It used to drop the skill name in as plain text.
- Context Panel: the Browser and Preview tabs stop piling up duplicate auth tokens in their URLs after reloads or navigation.

## [1.13.5] - 2026-06-27

- CLI: global web installs no longer crash on startup when tunnel commands load ngrok capabilities.
- CLI: `taskhunter update` works again, and tunnel start paths no longer fail when using managed-local config prompts, multi-instance port selection, or auto-started servers.
- GitHub/Usage: fork upstream detection and Google quota checks no longer fail because of missing server helpers.

## [1.13.4] - 2026-06-27

- UI/Localization: added Japanese interface translations and Japanese documentation (thanks to @yuchi0531).
- Chat: queued messages can now be reordered by dragging them in the queue (thanks to @makeittech).
- Chat: sending a message now closes an open question prompt instead of leaving stale question UI in the composer (thanks to @tomzx).
- Chat: conversations pinned to the bottom no longer jiggle or double-scroll after sending, and revisiting older sessions snaps to the latest message without a smooth-scroll delay.
- Reviews: the Review changes dialog can now run an automatic review loop, with a chat banner for opening or stopping the linked review sessions.
- Models: the model picker now remembers provider group expansion and custom ordering, and Shift+Delete removes a recent model from recents (thanks to @makeittech).
- Shortcuts: the model-selector shortcut can now be customized (thanks to @makeittech).
- Agents: agent edits against an external OpenCode server no longer show a saved-state update when the save did not succeed (thanks to @makeittech).
- Providers: the add-provider form no longer loses the selected provider during background provider refreshes (thanks to @IbrahimKhan12).
- Worktrees: messages sent to new worktree sessions now wait until the worktree session is ready instead of racing ahead (thanks to @bashrusakh).
- Git: commit and pull-request generation from a draft session now starts from the created chat session instead of a temporary draft (thanks to @bashrusakh).
- CLI: startup and status commands now check the live server port before treating an existing process as the active TaskHunter server.

## [1.13.3] - 2026-06-24

- Chat: selecting a user-installed skill from the slash command menu now invokes the skill instead of inserting the skill name as plain text (thanks to @IbrahimKhan12).
- Chat: pasted text containing `@` no longer opens file mention autocomplete unexpectedly (thanks to @charpeni).
- Chat: code blocks in user messages now preserve characters like `<` and `->` instead of escaping them inside the code block (thanks to @bashrusakh).
- Chat: switching sessions and loading older messages no longer causes the conversation to jump backward or oscillate around the current scroll position (thanks to @herjarsa).
- Chat: Arrow Up opens prompt history again when the cursor is at the start of the composer.
- Sessions: new sessions now stay attached to the selected project or current workspace directory instead of sometimes appearing under a stale project (thanks to @bashrusakh).
- Sessions: pinned sessions and folder rows no longer disappear from the sidebar after an empty session-list refresh (thanks to @bashrusakh).
- Agents: agent settings now include thinking variant, temperature, and top-p controls, and clearing temperature or top-p now removes the override (thanks to @bashrusakh).
- Settings/Models: per-model visibility and sibling model selections now stay saved after changes (thanks to @attilaszasz).
- Settings/Skills: the skills catalog refreshes after catalog settings change (thanks to @gokulkgm).
- Providers: disconnecting a provider from settings now works for the selected provider (thanks to @bashrusakh).
- Git: Git identities can now enable SSH commit signing.
- Git: pushing from the Git view now syncs first, reducing rejected pushes when the branch needs to update.
- Usage: MiniMax M3 and Token Plan usage now handle the provider's latest API response format (thanks to @baruchvitorino).
- VSCode: font size and padding preferences now apply inside the extension webview (thanks to @Sin991114).
- Startup: managed OpenCode server processes left behind by a previous crash are cleaned up on the next start.
- CLI: stale server PID files are checked more carefully so unrelated processes are not mistaken for an TaskHunter server.
- Files: downloads and file names with non-Latin characters now handle those characters correctly in headers (thanks to @FanFan4204).
- Mobile: subagent chevrons no longer overlap long session titles, and session grouping now matches the exact workspace directory (thanks to @weixiang1862, @lilyzhaun).

## [1.13.2] - 2026-06-18

### Improvements

- **Chat:** long conversations and big session lists stay smooth while a reply streams in (thanks to @bashrusakh).
- Startup: the app starts faster, it no longer waits for the default OpenCode config.

### Fixes

- Chat: the last words of a streamed reply are no longer cut off (thanks to @IbrahimKhan12).
- Chat: paragraphs in a reply have space between them again (thanks to @foundryseven).
- Files: HTML, image, and PDF previews stay open instead of asking for authentication every minute or so (thanks to @bashrusakh).
- Startup: your manual and per-folder model choices survive a restart.

## [1.13.1] - 2026-06-17

### New

- **Scheduled Tasks:** the task editor takes Cron expressions. It checks the expression as you type, offers example chips, and shows the next four runs (thanks to @tomzx).
- Chat: click a Mermaid diagram in a message to open it fullscreen and pan or zoom around it.
- Security: a self-hosted instance keeps search engines out with noindex headers and a robots.txt.

### Improvements

- Chat: pinned welcome starters are on screen as soon as a new draft session opens.
- Chat: the context usage indicator is a round progress ring, with the same colors, in every workspace header.
- Chat: embedded chat views and context panel previews follow your theme.
- Files: the file editor, Plan View, and the Skills page highlight more languages.
- Startup: providers and agents load faster.
- Right Sidebar: switching tabs redraws less of the rest of the screen (thanks to @bashrusakh).

### Fixes

- Chat: an amount like `$50` stays an amount. Only `$$...$$` and `\(...\)` are read as math.
- Chat: a reply full of code no longer freezes the page while it highlights.
- Chat: on Android, the session status button responds to taps.
- Sessions: the app no longer crashes at startup when you have many sessions in folders.
- Agents: deleting a built-in agent leaves it in place and explains why, instead of quietly disabling it.
- Agents: deleting an agent whose definition is missing shows an error instead of doing nothing.
- Notifications: desktop notifications no longer arrive twice.
- Notifications: reasoning text is left out of the notification body.
- Sessions: the session list loads steadily with Windows paths and with several requests at once.
- Diagnostics: duplicate health-check URLs are gone.

### Misc

- CLI: the installer needs Node.js 22, and it says what to do when it cannot read your version.

## [1.13.0] - 2026-06-15

### New

- Files: added dedicated PDF files previews mode.
- Files: added an optional docked files editor toolbar (thanks to @robertoberto).
- Git/Diff: individual diff hunks can now be staged, unstaged, or discarded directly from the Changes view via `git apply`.
- Git/Diff: added a review flow for starting a review from current changes.
- GitHub: GitHub settings can now use credentials from the `gh` CLI when available (thanks to @tomzx).
- Desktop: you can now open developer tools from the Help menu.
- Sessions: new draft sessions now start from the default model and agent instead of inheriting the previous session's selection, and fall back to OpenCode's own `default_agent` (and its model) when no OpenChamber default is set.
- Startup: the model and agent now appear faster on the initial draft — config loads under the project key up front (no reload when the draft opens) and the agent list is fetched once instead of per consumer.

### Improvements

- Security: LAN and remote browser access now require a UI password before the server will start.
- Desktop: if LAN access was enabled without a password, the app now starts locally and asks for a password before turning LAN access back on.
- Chat: file paths inside fenced code blocks are now clickable, including line and column targets (thanks to @robertoberto).
- Chat: context breakdowns now show message previews and cache hit rates (thanks to @robertoberto, @raz123).
- Chat/Performance: long conversations now use virtualized rendering to keep large histories responsive.
- Chat: custom-answer question textareas resize more steadily while typing (thanks to @bigcoder84).
- Chat/Input: Arrow Up moves the cursor inside multi-line drafts again instead of always opening prompt history.
- Files: file operations now use the active workspace directory more consistently (thanks to @tomzx).
- Sessions: session menus now include a delete action (thanks to @ShogunPanda).
- Sessions: selected rows now highlight across the full sidebar gutter.
- Comments: inline file/diff comment drafts now stay in place when focus changes.
- Git/Diff: redesigned the Changes diff view with faster multi-file rendering, expandable hunk separators, a full-file loading toggle, compact responsive controls, and a unified changed/staged context panel workflow.
- Settings/MCP: importing MCP snippets from OpenCode config works again (thanks to @youzini).
- Notifications: notification streams now stay connected more reliably behind proxies (thanks to @kostazol).
- Mobile: the empty Changes view keeps a close control visible (thanks to @lilyzhaun).
- Security: file previews and downloads now reject paths outside the allowed workspace unless access has been granted.
- Sessions: fixed a bug where a running session would briefly flicker as idle (in the sidebar, the send/stop button, and the status row) when the app is protected by a password.
- Desktop: you can now open developer tools from the Help menu.
- Sessions: new draft sessions now start from the default model and agent instead of inheriting the previous session's selection, and fall back to OpenCode's own `default_agent` (and its model) when no TaskHunter default is set.
- Startup: cached settings and session state now appear earlier while the live API finishes connecting.
- VSCode: the extension opens faster with cached sessions, models, providers, and projects, then refreshes in the background.
- VSCode: sessions are now grouped under their workspace, with cleaner session rows and an archived-sessions toggle.

### Fixes

- Chat/Input: tab-completing a mention no longer changes the selected agent (thanks to @Quat3rnion).
- Chat/Mobile: collapsed tool cards now keep their tool icon visible, and reasoning/tool text no longer clips descenders.
- Sessions: deleting a parent session no longer brings deleted child sessions back into the sidebar (thanks to @panzeyu2013).
- Sessions: switching sessions no longer leaves the chat area blank in some cases (thanks to @panzeyu2013).
- Sessions: fixed a bug where a running session would briefly flicker as idle (in the sidebar, the send/stop button, and the status row) when the app is protected by a password.

## [1.12.4] - 2026-06-11

### New

- Chat: added `/handoff-review` to open a linked review session for the current workspace changes, with actions to send review feedback and implementation replies between the sessions.
- Chat/UI: added a setting to collapse long user messages.
- Chat: Mermaid diagrams can now be opened in a dedicated diagram editor (thanks to @nerdosaurus).
- Worktrees: creating a single new worktree session now opens the session immediately while worktree setup continues in the background.
- Settings: added search across settings pages.
- Files: added an editor Vim mode setting (thanks to @Champii).
- Desktop/macOS: added a menu bar tray with live session status, Mini Chat access, and a provider usage submenu.
- Desktop/macOS: added an optional vibrancy effect for the left sidebar.
- Mobile: refreshed session controls, worktree deletion flow, MCP controls, update flow, and usage tracking for new layout.
- Usage: added Cursor quota tracking.
- UI/Localization: added French interface translations and French documentation (thanks to @pascalandr).
- VSCode: added an action to archive all sessions from the extension (thanks to @jjdubski).
- VSCode: added multi-root workspace support, including workspace folder switching in the extension (thanks to @mmospanenko).

### Improvements

- Chat: `@agent` mentions in rendered messages now use the primary accent color.
- Chat: table copy actions now include a Markdown format option (thanks to @kjhq).
- Models: hidden models now stay hidden in multi-model selection controls (thanks to @kjhq).
- Multi-Run: creating isolated runs now opens sessions immediately while worktree setup continues in the background.
- Sessions: chat folder assignments now stay in place after reloads.
- Sessions: session, folder, project, and worktree rows now have right-click menus for their available actions.
- Settings/Agents: agent prompt and permission edits now stay saved after changes.
- Files: writes are now safer when saving through temporary files (thanks to @nerdosaurus).
- Git: changed-file folders now have a revert action (thanks to @kostazol).
- GitHub: issue and pull-request pickers now use server-side search for larger repositories (thanks to @tomzx).
- Voice: Plan and file preview markdown now include text-to-speech buttons, with a setting for reading selected text or the full document (thanks to @yangyaofei).

### Fixes

- Preview: inline module scripts are now rewritten in proxied HTML responses, fixing more Vite preview pages (thanks to @mdbetancourt).
- Desktop/macOS: startup no longer opens unnecessary folder prompts.
- Terminal/Mobile: touch scrolling in the terminal no longer conflicts with terminal input as often (thanks to @kostazol).

## [1.12.3] - 2026-06-05

### Improvements

- Startup: OpenCode health checks now work with OpenCode 1.15.x.

### Fixes

- Windows/Startup: WSL OpenCode installs are no longer detected or launched; install OpenCode natively on Windows and configure `opencode.cmd` or `opencode.exe` instead.
- Files: file trees now show directory loading errors with a retry action instead of leaving the folder empty, and slow Git ignore checks no longer block directory listings indefinitely.

## [1.12.2] - 2026-06-05

### New

- **Desktop/Windows: the Windows app is now available publicly, with full functionality parity across the app.**
- Projects: the Add Project directory picker now starts with hidden files off each time it opens.

### Improvements

- Tunnels: switching between Cloudflare and ngrok quick tunnels now replaces the active quick tunnel instead of reusing the previous provider.
- Tunnels: ngrok startup failures now show the ngrok or authtoken error returned during startup.
- Chat: prompts sent while creating or switching target sessions now stay attached to the intended project directory.
- VSCode: the extension now detects more Windows OpenCode installs from PATH, npm, Scoop, and Chocolatey.

## [1.12.1] - 2026-06-03

### New

- Chat: completed turns can now show changed-file chips with per-file additions and deletions, controlled by a new Chat setting.
- Sessions: recent sessions now stay visible inside project groups, and new or worktree sessions stay in the correct project/worktree group on desktop, mobile, and VS Code.

### Improvements

- Chat: LSP tool calls now show the operation, file, and cursor position more clearly, and JSON tool output can be toggled between formatted and raw views or copied.
- Chat: streaming messages now appear correctly after startup, and activity/status rows show for the active session.
- Chat/UI: sticky user-message headers are now off by default.
- Sessions: session titles update from live session events, and the app now consistently loads all existing OpenCode sessions.
- Settings/OpenCode: OpenCode CLI path, update-notification preference, keyboard shortcuts, and protected-session settings now stay saved after changes.
- UI/Time: the 12-hour/24-hour time preference now applies to chat timestamps, usage reset times, scheduled tasks, tunnels, passkeys, Git history, and pull-request dates.
- Settings/Files: the default file preview setting now lives with the Chat appearance settings and applies immediately to open file tabs.
- Desktop: Desktop tunnels now serve the full app UI instead of the headless page.
- Desktop: removed the legacy Tauri desktop path; Electron is now the only desktop runtime.

### Fixes

- Chat: completed responses no longer lose late-arriving summaries, token counts, errors, structured output, or changed-file details.
- Chat: question cards now show an error or no-longer-pending message when submit or dismiss fails instead of silently doing nothing.
- Chat: the first prompt in a new session no longer gets stuck before sending.
- Preview: embedded previews now rewrite inline module imports, fixing Vite React preview pages that load root-relative modules.
- Desktop: quitting the Desktop app now stops managed OpenCode processes more reliably, reducing leftover OpenCode processes after exit.

## [1.12.0] - 2026-06-03

### New

- Mobile: added a new mobile UI as the default, with an option in Settings to switch back to the previous layout; this is the foundation for the upcoming mobile app and is available to try now.
- Chat: added customizable draft welcome starters from commands and skills, including guided commands for planning, catch-up, debugging, and exploration.
- Chat: assistant answers now have a dialog for starting a new session from that answer.
- Web/Browser: added a Browser feature for opening websites in the web app and sharing annotations with screenshots to agents.
- Web/Remote Instances: added a headless web app mode, and remote instance switching now changes the TaskHunter API endpoint without loading the full remote UI.
- UI/Themes: added JetBrains Light and JetBrains Dark themes, and VS Code chat colors now map more closely to the active editor theme.

### Improvements

- Chat/UI: markdown-rendered user messages now preserve line breaks.

### Fixes

- Chat/Input: queued messages no longer auto-send before the active session is ready, and thinking-variant choices are preserved for generated messages.

## [1.11.7] - 2026-05-27

### New

- Git: commit history now includes a branch graph and commit-row actions in the history modal (thanks to @ermanhavuc).
- Desktop: added a launch-at-startup setting, and collapsed browser windows now keep their webview state.
- UI/Localization: added Traditional Chinese interface translations (thanks to @Jia35).
- Usage: added a setting to hide prediction rows on usage cards (thanks to @ermanhavuc).

### Improvements

- Notes/Todos: completed todos stay at the end of the list, and the send-to-session dialog has a cleaner model picker (thanks to @kostazol, @rghamilton3).

### Fixes

- Chat/Input: selecting an agent now switches to that agent's configured model, and malformed tool diffs no longer break chat rendering (thanks to @Adrian-Eckardt).
- Sessions: inline session renaming no longer exits immediately after focus changes (thanks to @youfch).
- VSCode: restored live streaming in the extension.

## [1.11.6] - 2026-05-25

### New

- Settings/Plugins: added a Plugins page for managing opencode plugins, with npm update checks and user/project scopes (thanks to @Quat3rnion).
- Tunnels: added Ngrok as a quick tunnel provider in the CLI and Desktop tunnel settings, with readiness checks (requires Ngrok cli and auth).
- Desktop: added optional password setting in TaskHunter sessions settings for the local Desktop server.
- Multi-Run: new multi-run sessions now appear in the session list immediately, and slash-command prompts are sent to the created run sessions correctly.

### Fixes

- Mobile: restored the new-session action in the session sidebar header.

## [1.11.5] - 2026-05-25

### New

- Sessions: session titles can now be renamed inline with a double-click (thanks to @robertoberto).
- Files: file search now shows the number of matches in the editor panel, and directory rows include a quick-add button (thanks to @attackonryan, @tomzx).
- Voice: OpenAI-compatible custom speech providers can now use API keys (thanks to @yangyaofei).

### Improvements

- Chat/Input: pending image attachments now show previews, sent image attachments can be cited from assistant messages, and markdown source mode highlights formatting while you type.
- Chat: queued messages now send to the session they were queued from, even if you switch sessions before they are sent.
- Git: changed files are split into staged and unstaged sections, and Git operations work correctly from repository subdirectories (thanks to @ShogunPanda, @kostazol).
- Settings/Skills: installed skills are discovered more accurately, skill files opened from tool messages now load correctly, and snippet names keep their canonical casing (thanks to @jkker, @isanchez404).
- Mobile/PWA: long-press tooltips work on touch screens, fullscreen panels keep the right header state, deleted or long-named files behave better in file lists, and Android PWA dialogs stay visible (thanks to @kostazol, @lilyzhaun).

### Fixes

- Chat/UI: chats keep following the latest response after final task summaries, activity reasoning no longer flashes before settling, and assistant timestamps stay visible on narrow layouts.

## [1.11.4] - 2026-05-22

### New

- Chat: added reusable snippets with `#` autocomplete in the composer and a Snippets settings page for global and project snippets with [opencode-snippets](https://github.com/JosXa/opencode-snippets) plugin compatibility.
- Multi-Run: runs can now be split into separate prompt/model groups, and Multi-Run prompts support command, file, agent, and snippet autocomplete (thanks to @tomzx).

### Improvements

- Desktop: Electron is now the desktop release target, with updated macOS menu actions for the right sidebar and terminal dock.
- UI: refreshed the desktop workspace shell with a full-width header, framed chat area, and smooth left/right sidebar open and close states.
- Chat: completed reasoning blocks stay collapsed without replaying the collapse animation when you reopen a session.
- Files: file search and mention results avoid mixing entries from similar query/cache keys (thanks to @isanchez404).
- VSCode: switching between chat sessions is less likely to stall on very large conversations.
- UI/Localization: refreshed Simplified Chinese terminology across the interface (thanks to @luojiyin).

### Fixes

- Voice: preview audio now stops and cleans up correctly when you stop playback or leave Voice settings (thanks to @isanchez404).

## [1.11.3] - 2026-05-19

### New

- Chat: slash command autocomplete now includes skills and clearer command/type badges.
- Updates/PWA: OpenCode update and PWA install prompts can now be dismissed without reappearing repeatedly (thanks to @robertoberto).

### Improvements

- Chat: question cards now include copy buttons for Markdown and JSON (thanks to @robertoberto).
- Chat: slash, file, skill, and agent autocomplete selection now stays steadier when using the keyboard or mouse.
- Chat: external links in messages now show favicons with better contrast, and skill links render correctly in user message rendered as markdown.
- Chat: multi-file tool diffs now render safely, including files with mixed line endings.
- Sessions: archived session lists handle large archives better, and sub-session expansion is kept separate between Recent and project sections (thanks to @vhqtvn).
- Sessions: deleting or archiving a parent session now shows a descendant count that matches what will actually be removed (thanks to @vhqtvn).
- Git: reverting a chat message now refreshes the Git changes view afterward.
- Terminal/Mobile: the terminal viewport now stays above the mobile keyboard more consistently (thanks to @Dav1dch).

### Fixes

- Notifications: browser and VS Code notifications work without duplicate alerts.
- Usage: added Wafer.ai quota tracking and removed the duplicate Zhipu usage provider entry (thanks to @bowber).

## [1.11.2] - 2026-05-18

### New

- Chat: thinking blocks can now be collapsed, and expanding tool details feels smooth (thanks to @ermanhavuc).
- Git: commit history can now show file diffs inline (thanks to @ermanhavuc).

### Improvements

- Chat: reverting or forking messages now keeps file attachments in place, with clearer undo/redo controls (thanks to @youfch, @ermanhavuc).
- Notes/Todos: context panel sizes are remembered, and todos can be reordered with drag and drop (thanks to @ermanhavuc).
- Git: branch history works better for local-only branches, and branch search fields accept typing again (thanks to @ermanhavuc).
- Sessions: root project sessions now show up correctly in the session switcher (thanks to @isanchez404).
- Skills: installed skills now match OpenCode's own skill list more closely.

## [1.11.1] - 2026-05-15

### New

- Multi-Run: added fusion for multi-run sessions.
- Multi-Run: added optional isolation and support for non-Git projects.
- Chat/Sessions: added a header session switcher with project, branch, diff, active, unread, and sub-session context.
- Desktop/Mini Chat: added session switching and the new-session shortcut to Mini Chat, while preserving user-selected sessions during startup.
- Updates/Usage: added a setting to disable OpenCode update notifications, and quota reset times now display in your local timezone.

### Improvements

- Chat/Subagents: opened subagent sessions read-only in the context panel and made subagent chats read-only.
- Chat/Shortcuts: made the agent-switching shortcut configurable and usable from the chat input/model picker.
- Preview: improved embedded preview proxying for absolute same-origin requests and WebSocket URLs, and avoided launching unrelated project actions when no dev-server action is detected.
- Chat/UI: sorted-mode tool paths animate consistently, and tooltip rendering is guarded defensively.
- Git: large change lists now display reliably, and branch selection stays hidden for non-Git draft sessions.
- Settings/Skills: the skills catalog now keeps the selected source label visible when switching sources (thanks to @kjhq).

## [1.11.0] - 2026-05-14

### New

- Updates/OpenCode: added in-app OpenCode update checks and upgrade actions.
- Voice: added local Whisper speech-to-text.

### Improvements

- Chat/Input: queued messages now auto-send one at a time in FIFO order, and model/agent selections persist across reloads (thanks to @lyxxx708, @chutastic).
- Chat/Performance: virtualized more timeline content, deferred heavy tool output, and improved scroll-to-bottom behavior.
- VSCode: improved chat sidebar command handoff, active-editor context updates, SSE cleanup, Agent Manager settings sync, and archived-session bulk delete reliability in the extension (thanks to @isanchez404, @jjdubski).
- Git: generalized repository provider handling beyond GitHub and made commit/PR generation more tolerant of JSON wrapped in assistant text.
- Terminal: rejected file paths as terminal working directories, preserved UTF-8 replay chunks, and cleaned up WebSocket/SSE listeners reliably during shutdown and reconnects (thanks to @isanchez404).
- Usage/Reliability: guarded quota percentages and reset timestamps defensively.

### Fixes

- Voice: synced speech recognition settings across devices and let server transcription finish processing audio when voice input stops (thanks to @kostazol).
- Chat/Permissions: restored `@agent` mentions in sent messages and parent-session auto-accept for child-session permissions.
- UI/Reliability: added smaller fixes for chunk-load recovery, locale retry behavior, stale attachment reads, scheduled tasks, session folders, and accessible Git/session controls (thanks to @isanchez404).

## [1.10.4] - 2026-05-09

### New

- Git/Worktrees: pull-request worktrees can now reuse an existing local branch when it matches the PR head.
- Settings/UI: improved keyboard and screen-reader support for resizable Settings navigation and collapsible sidebar groups (thanks to @isanchez404).

### Improvements

- Desktop/Mini Chat: improved Mini Chat session controls with current context usage in the compact header and a single header action that opens either the active session or current draft in Mini Chat.
- Chat/Input: model, variant, and agent labels collapse better on narrow widths.
- Terminal: cleaned up idle WebSocket connections and scoped SSE connection-open handling per retry attempt.
- Reliability/Sync: preserved message part update ordering (thanks to @isanchez404).

### Fixes

- Git: deduplicated lightweight and full status refreshes separately, preventing stale or mismatched Git updates during background polling (thanks to @isanchez404).
- Files: ignored stale file loads, guarded pending navigation, and stopped switching files when save fails.

## [1.10.3] - 2026-05-08

### New

- Desktop/Electron: added Mini Chat windows for focused conversations without the full workspace shell, including session/draft handoff back to the main window, always-on-top pinning, and quick access from the header, session list, command palette, and keyboard shortcuts.

### Improvements

- Desktop/Startup: show the splash window earlier while the local runtime starts.
- Chat/Scrolling: rebuilt auto-follow behavior for active responses.
- Chat/UI: tightened scroll-to-bottom behavior and code-block scrolling handoff.

### Fixes

- Chat/Scrolling: saved scroll positions restore consistently after session switches, hydration, and draft-to-session transitions.
- Chat/Input: fixed attachment-only queued sends, stale attachment restores, stale file-search results, autocomplete tab handling, and focusable removal controls (thanks to @isanchez404).
- Reliability/Sync: reduced stale and duplicate live-state updates across request arrays, retry metadata, streaming indicators, and session status events, cutting unnecessary rerenders and stuck activity states during long-running chats (thanks to @isanchez404).
- Files/Skills: ignored stale directory refreshes and outdated skills catalog/repo scans.
- Git/Terminal/Desktop: fixed sandbox database loading in ESM, forwarded lightweight Git status mode across runtimes, preserved Electron SSH desktop hosts when saving instances, and made terminal UTF-8 locale fallbacks platform-aware (thanks to @isanchez404, @liyiopener).
- UI/Reliability: added smaller polish fixes for mobile Settings Escape handling, Multirun model limits, text-selection cleanup, and upstream event-stream cancellation (thanks to @isanchez404).

## [1.10.2] - 2026-05-07

### New

- Projects: added repository cloning to the Add Project flow.

### Improvements

- Chat/Reliability: stabilized live turn rendering and session sync caches.
- Terminal: improved Android tablet keyboard handling, including control-key shortcuts, and kept app shortcuts from stealing focus while typing in the terminal (thanks to @Dav1dch).
- Terminal: set a UTF-8 locale for terminal sessions (thanks to @liyiopener).
- Usage: OpenRouter credit balances now avoid misleading percentage displays and use clearer labels across usage views (thanks to @zerone0x).
- Preview: improved embedded preview proxying with cleaner URL rewriting, fewer false-positive dev-server errors, steady navigation, and theme-aware preview frames.
- Notifications: suppressed inherited subagent completion notifications.
- VSCode: split the extension into a dedicated app root.

## [1.10.1] - 2026-05-06

### New

- Git: added one-click Sync and stash management, including stash access from a clean worktree.
- UI/Localization: added Polish interface translations, expanding language support for Polish-speaking users (thanks to @levy52).
- Sessions: added a quick archive action directly on session rows (thanks to @zoubenr).
- Files: added a manual save mode to the file editor.
- Chat/Timeline: added full-text timeline search across user, assistant, and tool messages in a session.
- Mobile/Terminal: added an opt-in keyboard resize mode and steady touch terminal input.

### Improvements

- Chat/Reliability: pending questions now survive session switches and directory eviction.
- VSCode/Reliability: aligned session status parsing and reconnect reconciliation (thanks to @vhqtvn).

### Fixes

- Git: improved sync safety and feedback with latest remote refs, clearer progress banners, less flicker during refresh, cleaner header controls, and better unavailable pull-request states.
- Terminal: restored focus back to terminal input after Ghostty element blur events.
- Startup/Reliability: configured OpenCode CLI paths are now validated before managed startup, with clearer errors for missing, non-executable, or app-bundle paths.
- Performance/Reliability: reduced duplicate app initialization, deferred heavier views, lowered local server status overhead, optimized markdown file-link detection, reduced sync recovery payloads, and suppressed expected missing-directory noise.

## [1.10.0] - 2026-05-05

### New

- Preview: added an embedded dev-server Preview pane for loopback apps, with authenticated proxying, Vite/HMR support, same-origin API request handling, and safer local dev-server shutdown (thanks to @wpbiggs).
- Preview: added preview console capture, DOM element inspection, annotation context, and Electron screenshot attachments.
- Projects/Terminal: added Auto-discover for local dev servers, background terminal startup, action-linked Preview reopen controls, and cleaner terminal tab styling (thanks to @wpbiggs).
- Settings/Behavior: added a dedicated Behavior page with global `AGENTS.md` configuration and response style presets.
- VSCode/Chat: added the currently open editor file to chat context (thanks to @daveotero).
- Onboarding/Updates/Mobile: added OpenCode CLI auto-detection during onboarding, cross-checks update prompts against npm, and improved iPad/tablet controls for fewer false update notices and smooth touch use (thanks to @IslamNofl).

### Improvements

- UI/Settings: improved settings scrolling, empty states, and button/overlay polish (thanks to @Yabuku-xD).
- GitHub/Git: improved fork-aware issue and pull-request listing, PR status handling, startup loading feedback, remote MCP headers, and long model ID handling (thanks to @corrm, @ricautomation, @yart).

### Fixes

- Chat/UI: added a wide layout option, steady scroll position across sessions and generated prompts, less flicker during streaming, and safer rendering for malformed message parts (thanks to @jwcrystal, @pasta-paul).
- Reliability/Streaming: reconnects now recover immediately after OS wake-from-sleep, long agent sessions avoid streaming hangs, concurrent sessions sharing the same provider are throttled more safely, and model metadata refreshes after OpenCode restarts (thanks to @jwcrystal, @pasta-paul, @Yabuku-xD).

## [1.9.10] - 2026-04-28

### New

- UI/Localization: added Korean interface translations and default new installs back to English when no language has been chosen (thanks to @An-jinu).
- VSCode/Windows: normalized Windows drive-letter paths in extension webviews and added MiniMax/Ollama quota support.

### Improvements

- Chat/Models: unified the model picker across desktop and mobile with a cleaner selection flow (thanks to @daveotero).
- Projects: improved the project directory picker with expandable pinned folders and better file/path handling.
- Chat/UI: improved split-response action placement, error-message alignment, tab close affordances, and overscroll behavior.

### Fixes

- Sessions/Sidebar: fixed stale session, folder, project, and worktree state after mutations, and polished pinned-session indicators (thanks to @corrm, @Yabuku-xD).
- Reliability/Startup: hardened managed OpenCode startup, preserved shell PATH reliably, ignored stale downgrade update prompts, and improved stream/proxy recovery with heartbeat support.

## [1.9.9] - 2026-04-26

### New

- UI/Localization: added a localization foundation with translated interface strings for Spanish, Brazilian Portuguese, Ukrainian, and Simplified Chinese.
- Settings/Appearance: added selectable interface and code fonts with 10 choices each.
- Chat/Workflow: added keyboard turn navigation, widened chat content, and introduced local workspace review and summarize slash commands.
- Files/Editor: added an "Open files in preview mode" setting and improved multi-file edit/diff safety (thanks to @daveotero).
- Desktop/Web/Mobile: improved Electron update restart behavior, PWA service-worker notifications, mobile keyboard handling, and the Add Project panel flow (thanks to @Jovines, @vhqtvn).

### Improvements

- Chat/Mobile: improved mention and autocomplete behavior with complete results, clearer active-tab scoping, and less context-switching while drafting prompts.
- Chat/Tasks: todo list progress now updates live as task status changes, and task/model status hints are steady during active runs (thanks to @Yabuku-xD).
- Reliability/Performance: improved cold start and streaming responsiveness with lazy-loaded heavy components, chunk-load recovery, lower re-render churn, and safer reconnect/local-stream recovery (thanks to @Yabuku-xD, @jwcrystal, @vhqtvn).

## [1.9.8] - 2026-04-22

### New

- Chat/Commands: added `/summary` slash command for a non-destructive session summary - optional topic hint after the command focuses the output, and the prompt is customizable under Settings: Magic Prompts.

### Improvements

- Settings/Sync: settings updates now sync reliably across clients, and sidebar session pagination is steady in larger workspaces.
- Sessions/Folders: folder changes now persist through server-backed endpoints.
- Notifications: permission notifications are now suppressed when auto-accept is enabled.
- UI: improved the bottom scroll shadow and hid the tasks row when there is no active work.
- Reliability/Desktop: improved live event-stream recovery after transient stalls, wait briefly before failing chat actions during reconnects, and persist Electron server logs for easier disconnect debugging.

### Fixes

- Sessions/Reliability: fixed parent-child session sync during reconnects and navigation (thanks to @jwcrystal).
- Chat/Files: improved changed-files handling in chat and restored quick file-open flows from pending changes (thanks to @jwcrystal).
- Desktop/macOS: System color mode now tracks OS theme changes, traffic-light controls stay visible after dock restore, and update restart/changelog handling is more reliable.

## [1.9.7] - 2026-04-22

### New

- Desktop: added an Electron desktop runtime in parallel with the current Tauri app, with Electron planned to become the default path in an upcoming release.
- Plans/Notes/Todos: added editable project plans from assistant messages, external plan upload, configurable planning magic prompts, and quicker note/todo handoff into new sessions or worktrees.
- Chat/Files: you can now drag files and folders from the file tree into chat, with improved `@folder` autocomplete (thanks to @youfch).
- Files/Git: added a file-change summary bar and auto-refresh for open files changed outside the app.

### Improvements

- Settings/MCP: improved MCP auth flow with better remote-config support and clearer diagnostics, and aligned config resolution with OpenCode behavior (thanks to @daveotero, @cyan).
- Reliability/Chat: hardened bootstrap and stream-connection recovery, preserved session/connect state, and reduced streaming UI churn.

### Fixes

- Sessions/UI: added bulk session selection in the sidebar and fixed pinned sessions (thanks to @yart).
- Git/Worktrees: improved branch/worktree reliability by allowing checkout with uncommitted changes, tightening worktree cache invalidation, and reducing incorrect remote prefetches (thanks to @jwcrystal, @jasonalsing).
- Web/PWA: added install orientation controls and fixed loopback-origin handling for web push notifications in local setups (thanks to @vhqtvn, @yart).

## [1.9.6] - 2026-04-17

### New

- Reliability/Streaming: switched live message events to a WebSocket-first transport with SSE fallback, added response compression, and hardened proxy/compression handling (thanks to @geekifan, @jwcrystal).
- Sessions/Scheduled Tasks: added scheduled task creation and management with locale-aware scheduling.
- Files: added a full Go to Line workflow (toolbar + shortcut + dialog) and a new Copy Relative Path action (thanks to @coldbrow).
- Chat/Export: added export session as Markdown and improved empty-state/export behavior (thanks to @coldbrow).
- Desktop: added quick open and a LAN access toggle, plus safer quit behavior around scheduled tasks (thanks to @An-jinu).
- Chat/Markdown: added LaTeX rendering support for clearer math and technical notation in messages (thanks to @ricautomation).

### Improvements

- Sessions/Worktrees: enforced session worktree isolation and tightened session-switch safety.
- Files: file trees now auto-refresh when files change outside the app (thanks to @jwcrystal).
- Settings/Skills: skills are now sorted within groups (thanks to @tomzx).

### Fixes

- Chat/Requests: restored blocking request visibility in sub-sessions, scoped auto-approve to the active session tree, and reduced noisy auto-approved notifications during multi-session work.

## [1.9.5] - 2026-04-14

### New

- Security/Auth: added passkey sign-in for protected instances and new 1-week/30-day session expiration options (thanks to @daveotero, @pm0u).
- Voice: added OpenAI-compatible custom server support for both text-to-speech and speech-to-text, including configurable TTS model/pitch/volume and stricter custom URL validation for safer setup (thanks to @ablepharus).

### Improvements

- Sync/Performance: optimized multi-session streaming with per-directory queues, event coalescing, and parts-gap recovery to keep live updates smooth under heavy activity (thanks to @jwcrystal).
- Sessions/UI: kept active sessions visible in Recent, auto-expanded parent groups when opening subagent sessions, and hid empty archived/folder sections (thanks to @jwcrystal).

### Fixes

- Chat/Tool Output: added an interactive tree viewer for structured outputs and fixed JSON quote rendering (thanks to @yaozhenghangma).
- Chat/Reliability: fixed question-tool content disappearing after refresh and hardened subagent/session recovery paths.
- Git/UI: restored Git changes panel visibility and sidebar sync (thanks to @jwcrystal).
- Desktop/Startup: delivered a more guided first-launch and smart recovery flow, plus startup and remote-window interaction fixes to reduce early-session friction (thanks to @jwcrystal).
- Usage: added Zhipu AI Coding Plan tracking and restored model-variant compatibility with older OpenCode runtimes (thanks to @cainiao1992, @Chi-square-test).

## [1.9.4] - 2026-04-07

### Improvements

- Chat/Performance: reduced streaming render churn across the app.
- Chat/Tool Output: LSP diagnostics now render directly in tool output (thanks to @yulia-ivashko).
- Usage: refreshed MiniMax CN coding-plan quota data (thanks to @nzlov).

### Fixes

- Settings/Magic Prompts: added a dedicated Magic Prompts page with editable templates for commit/PR generation, PR and issue reviews, failed-check/comment analysis, and merge/cherry-pick conflict resolution.
- Chat/Scrolling: fixed jumpy follow behavior and restored stable bottom-resume/live-compaction updates.
- Reliability/Streaming: improved reconnect, retry, and directory-aware event routing to reduce stuck session/subagent states after transient disconnects (thanks to @jwcrystal, @daveotero).
- Models: added defensive handling for missing model pricing/capability metadata (thanks to @Chi-square-test).
- Desktop/Performance: removed costly window translucency and reduced duplicate notification triggers for a cooler, less noisy desktop experience.
- Startup/Remote: restored remote provider startup behavior and tightened host/port detection to reduce false startup failures.

## [1.9.3] - 2026-03-01

### New

- VSCode/Files: added file stat support in the extension bridge (thanks to @geekifan).
- Chat/Models: added arrow-key navigation for thinking-mode selection in model controls (thanks to @daveotero).
- Files: added HTML preview support in the file viewer (thanks to @nguyenngothuong).
- Chat/JSON: added an interactive JSON tree viewer with collapse/expand controls and richer color cues for easier inspection of large structured outputs (thanks to @nguyenngothuong).

### Improvements

- Security/Chat: user messages now escape raw HTML by default (thanks to @kalac2232).
- Desktop/Performance: reduced Tauri shell CPU/GPU overhead during longer sessions.
- Sessions/Drafts: draft chat config now stays synced with the selected draft target directory.
- Chat: improved error message readability with clearer styling and safer word-wrapping (thanks to @nguyenngothuong).
- Desktop/Settings: window vibrancy now correctly controls macOS window transparency, and settings copy now clarifies when full transparency changes take effect.
- Reliability/Proxy: hardened OpenCode proxy header handling (including identity-encoding normalization, compression-header cleanup, hop-by-hop response-header stripping) and suppressed expected SSE close noise.
- Terminal/Reliability: switched terminal transport to a pure WebSocket path with fallback handling.

### Fixes

- Mobile/Settings: fixed lingering settings drawers and removed extra top spacing for a cleaner, less obstructed mobile layout (thanks to @Jovines).
- Git/Worktrees: fixed worktree detection and reset stale integration state when switching contexts.
- Reliability/Proxy: restored proxied chat event streaming.
- Usage/Providers: added ZhipuAI quota tracking and fixed MiniMax coding-plan and GitHub Copilot overusage calculations (thanks to @kalac2232, @baruchvitorino, @ebrainte).

## [1.9.2] - 2026-03-31

### New

- Worktrees/Multi-Run: added instant draft-first worktree creation and redesigned the multi-run launcher with a cleaner, faster flow for parallel runs.
- CLI/Server: added `--foreground` for process-manager deployments, made managed server hostname configurable, and added an explicit `--host` option with safer localhost defaults (thanks to @colinmollenhour, @rapidrabbit76, @yulia-ivashko).

### Improvements

- Chat/Performance: rebuilt live session sync and streaming updates to cut render churn, reduce CPU spikes, and keep long-running chats smooth and more stable across runtimes.
- VSCode/UI: polished the extension chat and sidebar with improved spacing, tooltips, a resizable sessions pane, and file-to-chat mention flows from Explorer.
- Models/Providers: improved custom provider model metadata loading and caching (thanks to @ZeppLu).
- Docker/Deployments: improved container defaults, including UID 1000 user behavior, non-fatal SSH key generation, and better localhost detection in container networking (thanks to @yulia-ivashko).

### Fixes

- Web/PWA: fixed manifest behavior behind Cloudflare Access (thanks to @arthurfiorette).

## [1.9.1] - 2026-03-20

### New

- Usage: added MiniMax Weekly quota provider support (thanks to @nzlov).

### Improvements

- Chat/GitHub: linked issues and pull requests now appear as user-message attachments and open reliably across runtimes.
- Settings/MCP: adding MCP servers now consistently respects user vs project scope, preventing user-scope entries from being written into project config files.
- VSCode/Reliability: managed server startup now imports login-shell environment values and normalizes Windows workspace paths.
- Sessions: sidebar lists now keep sessions visible in both Recent and Project sections for easier discovery (thanks to @nguyenngothuong).
- Files: file trees now refresh incrementally after create/rename/delete actions (thanks to @nguyenngothuong).
- Sessions/Worktrees: draft sessions now resolve the correct project when opened from worktree paths (thanks to @yulia-ivashko).

### Fixes

- Sessions/UI: restored Project Notes access in the sidebar, polished notes/todo editing, and fixed project action overlap.
- Desktop: improved stale server-process cleanup on startup and fixed external link opening behavior (thanks to @jwcrystal).

## [1.9.0] - 2026-03-20

### New

- Chat/Permissions: added a session-based permission auto-accept toggle and polished permission-shield visuals for quicker, clearer approval workflows.
- Git: refreshed history visuals and added clearer branch-boundary markers.
- Git: added remote removal from sync workflows and stabilized polling to reduce noisy background refreshes (thanks to @yulia-ivashko).
- Files: added debounced editor auto-save (thanks to @nguyenngothuong).

### Improvements

- UI/Navigation: delivered a major sidebar redesign with clearer hierarchy, unified action patterns, and improved session organization (thanks to @yulia-ivashko).
- Chat: reduced streaming CPU usage and background churn with steady turn rendering, debounced updates, and less storage thrash during long runs.
- Panels/UI: softened panel resize affordances and tightened service dropdown/layout spacing for a cleaner, less distracting workspace.
- Files: reworked search UI for searching in files.
- Desktop/macOS: lowered the minimum supported macOS version to Ventura (13.0), expanding compatibility on older systems (thanks to @craigharman).
- Updates/Reliability: unified update-check behavior across runtimes.

### Fixes

- Chat: fixed scroll-to-latest and timeline tracking behavior.
- Settings/UI: fixed settings scrolling on mobile, made outside-click closing immediate, and reduced settings load churn/CPU spikes.
- Reliability/Platform: improved Windows path/process behavior and restored macOS PTY/microphone compatibility.

## [1.8.7] - 2026-03-13

- CLI: fixed a startup regression in global npm/bun installs where wrapper or symlinked `taskhunter` entrypoints could exit without output on commands like `--version` or `status`.
- CLI: hardened entrypoint detection across direct, symlinked, and shim-based launches to keep startup behavior consistent across package managers (thanks to @shekohex).
- Deployment/Docker: improved `docker run` startup behavior and entrypoint handling (thanks to @nzlov).

### Fixes

- CLI: fixed a startup regression in global npm/bun installs where wrapper or symlinked `openchamber` entrypoints could exit without output on commands like `--version` or `status`.
- Windows/Web: daemon startup and Git operations no longer flash extra console windows (thanks to @SergioChan).

## [1.8.6] - 2026-03-13

### New

- Chat/Settings: added richer chat render controls, including sorted/live behavior, compact live Activity previews, and options to keep Bash/Edit outputs open by default.
- Sessions/GitHub: overhauled sidebar session loading and GitHub PR tracking, and added a new minimal sidebar sessions mode on Desktop/Web.

### Improvements

- Tunnel/CLI: rebuilt tunnel workflows around clearer managed modes and provider-aware lifecycle commands, with safer startup checks, improved diagnostics, and cleaner CLI output for everyday remote access (thanks to @yulia-ivashko).
- Chat: completed a turn-based rendering pipeline that keeps streaming, activity rows, and tool progress more stable in long runs, with smooth auto-follow and fewer jumpy updates.
- Sessions: worktrees with active sessions now surface earlier in the sidebar (thanks to @GhostFlying).
- Projects/Desktop: project action inputs now submit with Enter, and Desktop settings now include a spell-check toggle for writing comfort (thanks to @DocterZed).
- Mobile/PWA: install metadata now honors orientation lock consistently.

### Fixes

- Chat: fixed narrow-layout send behavior for modified Enter shortcuts (thanks to @eengad).
- Chat: fixed queue-button behavior and focus-mode composer sizing.

## [1.8.5] - 2026-03-04

### Improvements

- Desktop: startup now opens the app shell much earlier while background services continue loading.
- VSCode: edit-style tool results now open directly in a focused diff view.
- UI/Theming: unified loading logos and startup screens across runtimes, with visuals that better match your active theme.
- Projects/UI: project icons now follow active theme foreground colors consistently.
- Reliability: improved early startup recovery.
- Mobile/PWA: respected OS rotation lock by removing forced orientation behavior in the web app shell (thanks to @theluckystrike).

### Fixes

- Desktop/macOS: fixed early title updates that could shift traffic-light window controls on startup.
- VSCode: cleaned up extension settings by removing duplicate display controls and hiding sections that do not apply in the editor environment.
- Chat: fixed focus-mode composer layout.
- Tunnel/CLI: fixed one-time Cloudflare tunnel connect links in CLI output for `--try-cf-tunnel` (thanks to @plfavreau).

## [1.8.4] - 2026-03-04

### New

- Chat: added clickable file-path links in assistant messages (including line targeting) (thanks to @yulia-ivashko).
- Chat: added a new `Changes` tool-output mode that expands edits/patches by default while keeping activity readable (thanks to @iamhenry).
- Chat/GitHub: added Attach menu actions to link GitHub issues and PRs directly in any session.
- Shortcuts/Models: added favorite-model cycling shortcuts (thanks to @iamhenry).
- Sessions: added active-project session search in the sidebar, with clearer match behavior and easier clearing during filtering (thanks to @KJdotIO).
- Mobile/Projects: added long-press project editing with a bottom-sheet panel and drag-to-reorder support (thanks to @Jovines).
- Web/PWA/Android: added improved install UX with pre-install naming and manifest shortcut updates (thanks to @shekohex).

### Improvements

- Chat: in-progress tools now appear immediately and stay live in collapsed activity view (thanks to @nelsonPires5).
- Chat: improved long user-message behavior in sticky mode with bounded height, internal scrolling, and cleaner action hit targets.
- Chat/Files: improved `@` file discovery and mention behavior with project-scoped search and more consistent matching.
- Worktrees/GitHub: streamlined worktree creation with a unified flow for branches, issues, and PR-linked sessions, including cleaner validation and faster branch loading.
- Files/Desktop: improved `Open In` actions from file views/editors, including app selection behavior and tighter integration for opening focused files (thanks to @yulia-ivashko).
- UI: interactive controls now consistently show pointer cursors.
- Security/Reliability: hardened terminal auth, tightened skill-file path protections, and reduced sensitive request logging exposure for safer day-to-day usage (thanks to @yulia-ivashko).

### Fixes

- Chat/Files: restored user image previews/fullscreen navigation and improved text-selection action placement on narrow layouts.
- Worktrees/Git: fixed branch/PR source resolution (including slash-named branches and fork PR heads).
- Git: fixed a PR panel refresh loop that could trigger repeated updates and unstable behavior in the PR section (thanks to @yulia-ivashko).

## [1.8.3] - 2026-03-02

### New

- Chat: added user-message display controls for plain-text rendering and sticky headers.
- Chat: model picker now supports collapsible provider groups and remembers expanded state between sessions.

### Improvements

- Chat/UI: overhauled the context panel with reusable tabs and embedded session chat (_beta_).
- Git: refined Git sidebar tab behavior and spacing, plus bulk-revert with confirmations for easier cleanup.
- Settings: reorganized chat display settings into a more compact two-column layout.

### Fixes

- Chat: improved code block presentation with cleaner action alignment, restored horizontal scrolling, and polished themed highlighting across chat messages and tool output (thanks to @nelsonPires5).
- Diff: added quick open-in-editor actions from diff views that jump to the first changed line.
- Git: fixed commit staging edge cases by filtering stale deleted paths before staging.
- Git/Worktrees: restored branch rename/edit controls in draft sessions when working in a worktree directory.
- Mobile/UI: fixed session-title overflow in compact headers (thanks to @iamhenry).

## [1.8.2] - 2026-03-01

### New

- Chat: added a new "Share as image" action (thanks to @Jovines).

### Improvements

- Updates: hardened the self-update flow with safer release handling and fallback behavior.
- Chat: improved message readability with cleaner tool/reasoning rendering and less noisy activity timing in busy conversations (thanks to @nelsonPires5).
- Desktop/Chat: permission toasts now include session context and a clearer permission preview (thanks to @nelsonPires5).
- Notifications/Voice: consolidated TTS and summarization service wiring for steady text-to-speech and summary flows (thanks to @nelsonPires5).

### Fixes

- VSCode: fixed live streaming edge cases for event endpoints with query/trailing-slash variants.
- Reliability: improved event-stream/session visibility handling when the app is hidden or restored.
- Windows: fixed CLI/runtime path and spawn edge cases to reduce startup and command failures on Windows (thanks to @plfavreau).
- Deployment: fixed Docker build/runtime issues (thanks to @nzlov).

## [1.8.1] - 2026-02-28

### Fixes

- Web/Auth: fixed an issue where non-tunnel browser sessions could incorrectly show a tunnel-only lock screen; normal auth flow now appears unless a tunnel is actually active.

## [1.8.0] - 2026-02-28

### New

- Desktop: added SSH remote instance support with dedicated lifecycle and UX flows (thanks to @shekohex).
- Projects: added project icon customization with upload/remove and automatic favicon discovery from your repository (thanks to @shekohex).
- Projects: added header project actions on Web and Mobile.
- Desktop: added dynamic window titles that reflect active project and remote context (thanks to @shekohex).
- Remote Tunnel: added tunnel settings with quick/named modes, secure one-time connect links (with QR), and saved named-tunnel presets/tokens (thanks to @yulia-ivashko).
- UI: added an expandable project rail with project names, a settings toggle, and saved expansion state for easier navigation in multi-project setups (thanks to @nguyenngothuong).
- UI/Files: added file-type icons across file lists, tabs, and diffs (thanks to @shekohex).
- Files: added a read-only highlighted view with a quick toggle back to edit mode (thanks to @shekohex).
- Deployment: added Docker deployment support with safer container defaults and terminal shell fallback (thanks to @nzlov).
- Usage: added MiniMax coding-plan quota provider support (thanks to @nzlov).
- Usage: added Ollama Cloud quota provider support (thanks to @iamhenry).

### Improvements

- Projects/Desktop: project actions can also open SSH-forwarded URLs.
- UI: expanded sprite-based file and folder icons across Files, Diff, and Git views (thanks to @shekohex).
- Files: markdown preview now handles frontmatter more cleanly.
- Chat: improved long-session performance with virtualized message rendering, smooth scrolling, and more stable behavior in large histories (thanks to @shekohex).
- Chat: enabled markdown rendering in user messages for clearer formatted prompts and notes (thanks to @haofeng0705).
- Chat: edit tools now use the same diff style as the dedicated Diff view (thanks to @shekohex).
- Chat: pasted absolute paths are now treated as normal messages.
- Chat: upgraded Mermaid rendering with a cleaner diagram view plus quick copy/download actions (thanks to @shekohex).
- Notifications: improved child-session notification detection to reduce missed or misclassified subtask updates (thanks to @Jovines).
- Reliability: improved Windows compatibility across git status checks, OpenCode startup, path normalization, and session merge behavior (thanks to @mmereu).

### Fixes

- Chat: fixed queued sends for inactive sessions.

## [1.7.5] - 2026-02-25

### New

- Web: added `OPENCODE_HOST` support (thanks to @colinmollenhour).

### Improvements

- UI: moved projects into a dedicated sidebar rail and tightened the layout.
- Sessions: reduced session-switching overhead to make chat context changes feel more immediate.
- Reliability/Auth: migrated session auth storage to signed JWTs with a persistent secret.
- Mobile/Chat: refined message spacing and removed the top scroll shadow for a cleaner small-screen reading experience (thanks to @Jovines).

### Fixes

- Chat: fixed an issue where messages could occasionally duplicate or disappear during active conversations.
- Mobile: pending permission prompts now recover after reconnect/resume instead of getting lost mid-run (thanks to @nelsonPires5).
- Web/Mobile: fixed in-app update flow in containerized setups.

## [1.7.4] - 2026-02-24

### New

- Chat: added fullscreen Mermaid preview, persisted default thinking variant selection, and hardened file-preview safety checks for a safer, more predictable message experience (thanks to @yulia-ivashko).
- Settings: added an MCP config manager UI to simplify editing and validating MCP server configuration (thanks to @nguyenngothuong).
- Files: added C, C++, and Go language support for syntax-aware rendering in code-heavy workflows (thanks to @fomenks).

### Improvements

- Settings: redesigned the settings workspace with flatter, more consistent page layouts.
- Settings: improved agents and skills navigation by grouping entries by subfolder for easier management at scale (thanks to @nguyenngothuong).
- Chat: draft text now persists per session, and the input supports an expanded focus mode for longer prompts (thanks to @nguyenngothuong).
- Sessions: expanded folder management with subfolders, cleaner organization actions, and clearer delete confirmations (thanks to @nguyenngothuong).
- Git/PR: moved commit-message and PR-description generation to active-session structured output.
- Chat Activity: improved Structured Output tool rendering with dedicated title/icon, clearer result descriptions, and more reliable detailed expansion defaults.
- Notifications/Voice: moved utility model controls into AI Summarization as a Zen-only Summarization Model setting.
- Mobile: refreshed drawer and session-status layouts (thanks to @Jovines).
- Desktop: improved remote instance URL handling (thanks to @shekohex).

### Fixes

- Chat: improved streaming smoothness and stability with buffered updates and runtime fixes.

## [1.7.3] - 2026-02-21

### New

- Settings: added customizable keyboard shortcuts for chat actions, panel toggles, and services (thanks to @nelsonPires5).
- Sessions: added custom folders to group chat sessions, with move/rename/delete flows and persisted collapse state per project (thanks to @nguyenngothuong).

### Improvements

- Notifications: improved agent progress notifications and permission handling to reduce noisy prompts during active runs (thanks to @nguyenngothuong).
- UI: unified clipboard copy behavior across Desktop app, Web app, and VS Code extension.
- Reliability: improved startup environment detection by capturing login-shell environment snapshots.
- Reliability: refactored OpenCode config/auth integration into domain modules for steady provider auth and command loading flows (thanks to @nelsonPires5).

### Fixes

- Diff/Plans/Files: restored GitHub-style inline comments (thanks to @nelsonPires5).
- Terminal: restored terminal text copy behavior (thanks to @shekohex).

## [1.7.2] - 2026-02-20

### New

- UI: added Plan view in the context sidebar panel for quicker access to plan content while you work (thanks to @nelsonPires5).

### Improvements

- Chat: question prompts now guide you to unanswered items before submit.
- Chat: improved streaming activity rendering and session attention indicators.
- Reliability: provider auth failures now show clearer re-auth guidance when tokens expire (thanks to @yulia-ivashko).

### Fixes

- Chat: fixed auto-send queue to wait for the active session to be idle before sending.
- Settings: model variant options now refresh correctly in draft/new-session flows, avoiding stale selections.

## [1.7.1] - 2026-02-18

### New

- Chat: added a shell mode triggered by leading `!`, with inline output visibility/copy.

### Improvements

- Chat: slash commands now follow server command semantics (including multiline arguments).
- Chat: improved delegated-task clarity with richer subtask bubbles, better task-detail rendering, and parent-chat surfacing for child permission/question requests.
- Chat: improved `@` mention autocomplete by prioritizing agents and cleaning up ordering.
- Skills: discovery now uses OpenCode API as the source of truth with safer fallback scanning.
- Skills: upgraded editing/install UX with better code editing, syntax-aware related files, and clearer location targeting across user/project .opencode and .agents scopes.
- Maintenance: removed deprecated GitHub Actions cloud runtime assets and docs to reduce setup confusion (thanks to @yulia-ivashko).

### Fixes

- Mobile: fixed accidental abort right after tapping Send on touch devices.

## [1.7.0] - 2026-02-17

### New

- UI: added a context overview panel with token usage, cost breakdown, and raw message inspection to make session debugging easier.

### Improvements

- Chat: improved live streaming with part-delta updates and smarter auto-follow scrolling.
- Chat: Mermaid diagrams now render inline in assistant messages, with quick copy/download actions for easier sharing.
- Sessions: project icon and color customizations now persist reliably across restarts.
- Reliability: managed local OpenCode runtimes now use rotated secure auth and tighter lifecycle control across runtimes.
- Git/GitHub: improved backend reliability for repository and auth operations (thanks to @nelsonPires5).

## [1.6.9] - 2026-02-16

### New

- Sessions: added a persistent project notes and todos panel (thanks to @gsxdsm).
- Sessions: introduced the ability to pin sessions within your groups for easy access.
- Settings: added a configurable Zen model for commit messages generation and summarization of notifications (thanks to @gsxdsm).
- Usage: added NanoGPT quota support and hardened provider handling (thanks to @nelsonPires5).

### Improvements

- **UI: redesigned the workspace shell with a context panel, tabbed sidebars, and quicker navigation across chat, files, and reviews.**
- UI: compact model info in selection (price + capabilities) (thanks to @nelsonPires5).
- Diff: improved large diff rendering and interaction performance for smooth reviews on heavy changesets.
- Worktrees: shipped an upstream-first flow across supported runtimes (thanks to @yulia-ivashko).
- Git: improved pull request branch normalization and base/remote resolution to reduce PR setup mismatches (thanks to @gsxdsm).
- Reliability: startup now auto-detects and safely connects to an existing OpenCode server.

### Fixes

- Chat: fixed file attachment issues and added exceeded-quota information.
- Desktop: restored desktop window geometry and position (thanks to @yulia-ivashko).
- Mobile: fixes for small-screen editor, terminal, and layout overlap issues (thanks to @gsxdsm, @nelsonPires5).

## [1.6.8] - 2026-02-12

### New

- Chat: added drag-and-drop attachments with inline image previews.

### Improvements

- Chat: improved agent/model picking with fuzzy search across names and descriptions.
- Usage: corrected Gemini and Antigravity quota source mapping and labels (thanks to @gsxdsm).
- Usage: when using remaining-quota mode, usage markers now invert direction to better match how remaining capacity is interpreted (thanks to @gsxdsm).

### Fixes

- Sessions: fixed a sidebar issue where draft input could carry over when switching projects.
- Chat: improved quick navigation from the sessions list by adding double-click to jump into chat and auto-focus the draft input; also fixed mobile session return behavior (thanks to @gsxdsm).
- Desktop: fixed project selection in opened remote instances.
- Desktop: fixed opened remote instances that use HTTP (helpful for instances under tunneling).

## [1.6.7] - 2026-02-10

### New

- Voice: added built-in voice input and read-aloud responses with multiple providers (thanks to @gsxdsm).
- Git: added multi-remote push selection and smarter fork-aware pull request creation to reduce manual branch/remote setup (thanks to @gsxdsm).
- Usage: added usage pace and prediction indicators in the header and settings (thanks to @gsxdsm).
- Desktop: added multi-window support with a dedicated "New Window" action for parallel work across projects (thanks to @yulia-ivashko).

### Improvements

- UI: refreshed header and settings layout, improved host switching, and upgraded the editor for smooth day-to-day navigation and editing.

### Fixes

- Diff/Plans: fixed comment draft collisions and improved multi-line comment editing in plan and file workflows (thanks to @nelsonPires5).
- Notifications: stopped firing completion notifications for comment draft edits to reduce noisy alerts during review-heavy sessions (thanks to @nelsonPires5).
- Settings: added confirmation dialogs for destructive delete/reset actions to prevent accidental data loss.
- Reliability: fixed message loading edge cases, stabilized voice-mode persistence across restarts, and improved update flow behavior across platforms.

## [1.6.6] - 2026-02-09

### New

- Desktop: added an `Open In` button to open the current workspace in Finder, Terminal, and supported editors with remembered app preference (thanks to @yulia-ivashko).
- Git: added push/pull with remote selection, plus in-app rebase/merge flows with improved remote inference and clearer conflict handling (thanks to @gsxdsm).
- Notifications: added smarter templates with concise summaries (thanks to @gsxdsm).

### Improvements

- Desktop: redesigned the main workspace with a dedicated Git sidebar and bottom terminal dock.
- Header: combined Instance, Usage, and MCP into one services menu.
- Git: reorganized the Git workspace with improved in-app PR workflows.
- Files: improved editing with breadcrumbs, better draft handling, smooth editor interactions, and more reliable directory navigation from file context (thanks to @nelsonPires5).
- Sessions: improved status behavior, faster mobile session switching with running/unread indicators, and clearer worktree labels when branch name differs (thanks to @Jovines, @gsxdsm).
- Terminal: improved input responsiveness with a persistent low-latency transport for steady typing (thanks to @shekohex).

### Fixes

- Usage: added per-model quota breakdowns with collapsible groups, and fixed provider dropdown scrolling (thanks to @nelsonPires5, @gsxdsm).
- Mobile: fixed chat input layout issues on small screens (thanks to @nelsonPires5).
- Reliability: fixed OpenCode auth pass-through and proxy env handling to reduce intermittent connection/auth issues (thanks to @gsxdsm).

## [1.6.5] - 2026-02-06

### New

- Settings: added an OpenCode CLI path override.
- Chat: added arrow-key prompt history and an optional setting to persist input drafts between restarts (thanks to @gsxdsm).
- Diff/Plans: added inline comment drafts (thanks to @nelsonPires5).
- Sessions: you can now rename projects directly from the sidebar, and issue/PR pickers are easier to scan when starting from GitHub context (thanks to @shekohex, @gsxdsm).
- UI: added Vitesse Dark and Vitesse Light theme presets.

### Improvements

- Chat: thinking/reasoning blocks now render consistently, and justification visibility settings now apply reliably (thanks to @gsxdsm).
- Worktrees: improved worktree flow reliability, including cleaner handling when a worktree was already removed outside the app (thanks to @gsxdsm).
- Terminal: improved Android keyboard behavior and removed distracting native caret blink in terminal inputs (thanks to @shekohex).
- Reliability: improved OpenCode binary resolution and HOME-path handling across runtimes for steady local startup.

## [1.6.4] - 2026-02-05

### New

- Desktop: switch between local and remote TaskHunter instances, plus a thinner runtime.
- VSCode: improved Windows PATH resolution and cold-start readiness checks to reduce "stuck loading" for sessions/models/agents.
- Mobile: split Agent/Model controls and a quick commands button with autocomplete (Commands/Agents/Files) for easier input (thanks to @Jovines, @gsxdsm).
- Chat: select text in messages to quickly add it to your prompt or start a new session (thanks to @gsxdsm).
- Diff/Plans: add inline comment drafts (thanks to @nelsonPires5).
- Git: improved macOS SSH agent support for smooth private-repo auth (thanks to @shekohex).

### Improvements

- Desktop: switch between local and remote OpenChamber instances, plus a thinner runtime.
- Mobile: split Agent/Model controls and a quick commands button with autocomplete (Commands/Agents/Files) for easier input (thanks to @Jovines, @gsxdsm).
- Terminal/Syntax: font size controls and Phoenix file extension support (thanks to @shekohex).
- Usage: expanded quota tracking with more providers (including GitHub Copilot) and a provider selector dropdown (thanks to @gsxdsm, @nelsonPires5).
- GitHub: PR description generation supports optional extra context (thanks to @nelsonPires5).

### Fixes

- VSCode: improved Windows PATH resolution and cold-start readiness checks to reduce "stuck loading" for sessions/models/agents.
- Web: fixed missing icon when installing the Android PWA (thanks to @nelsonPires5).

## [1.6.3] - 2026-02-02

### Improvements

- Web: improved server readiness check to use the `/global/health` endpoint.
- VSCode: improved server health check with the proper health API endpoint and increased timeout for steady startup (thanks to @wienans).

### Fixes

- Web: added login rate limit protection to prevent brute-force attempts on the authentication endpoint (thanks to @Jovines).
- Settings: dialog no longer persists open/closed state across app restarts.

## [1.6.2] - 2026-02-01

### New

- Usage: new multi-provider quota dashboard to monitor API usage across OpenAI, Google, and z.ai (thanks to @nelsonPires5).
- Terminal: added tabbed interface to manage multiple terminal sessions per directory.
- Files: added multi-file tabs on desktop and dropdown selector on mobile (thanks to @nelsonPires5).
- UI: introduced a token-based theming system, 18 themes with light/dark variants, and custom user themes from `~/.config/taskhunter/themes`.
- Diff: optimized stacked view with worker-pool processing and lazy DOM rendering for smooth scrolling.
- Worktrees: workspace path now resolves correctly when using git worktrees (thanks to @nelsonPires5).

### Fixes

- Projects: fixed directory creation outside workspace in the Add Project modal (thanks to @nelsonPires5).

## [1.6.1] - 2026-01-30

### New

- UI: update dialog now includes the changelog.
- Terminal: added optional on-screen key bar (Esc/Ctrl/arrows/Enter) for easier terminal navigation.
- Notifications: added "Notify for subtasks" toggle to silence child-session notifications during multi-run (thanks to @Jovines).
- Worktrees: starting new worktree sessions now defaults to HEAD when no start point is provided.
- Git: commit message generation now includes untracked files and handles `git diff --no-index` comparisons reliably (thanks to @MrLYC).

### Improvements

- Mobile: revamped chat controls on small screens with a unified controls drawer (thanks to @nelsonPires5).
- Reliability: improved event-stream reconnection when the app becomes visible again.
- Desktop: improved macOS window chrome and header spacing, including steady traffic lights on older macOS versions (thanks to @yulia-ivashko).

### Fixes

- Chat: added Stop button to cancel generation mid-response.

## [1.6.0] - 2026-01-29

### New

- Chat: added message stall detection with automatic soft resync.

### Improvements

- Git: PR picker now validates local branch existence and includes a refresh action.
- Git: worktree integration now syncs clean target directories before merging.
- VSCode: session activity status now updates reliably even when the webview is hidden.
- Web: session activity tracking now works consistently across browser tabs.

### Fixes

- Chat: fixed "Load older" button behavior in chat with proper pagination implementation.
- Diff: fixed memory leak when viewing many modified files; large changesets now lazy-load for smooth performance.
- Reliability: plans directory no longer errors when missing.

## [1.5.9] - 2026-01-28

### New

- UI: Files, Diff, Git, and Terminal now follow the active session/worktree directory, including new-session drafts.

### Improvements

- Worktrees: migrated to the OpenCode SDK worktree implementation; sessions in worktrees are now completely isolated.
- Git: integrate worktree commits back to a target branch with commit previews and guided conflict handling.
- Files: toggle markdown preview when viewing files (thanks to @Jovines).
- Files: open the file viewer in fullscreen for focused review and editing (thanks to @TaylorBeeston).
- Plans: switch between markdown preview and edit mode in the Plan view.

### Fixes

- Web: plan lists no longer error when the plans directory is missing.

## [1.5.8] - 2026-01-26

### New

- Plans: new Plan/Build mode switching support with dedicated Plan content view with per-session context.
- Web: iOS safe-area support for the PWA header.
- Activity: added a text-justification setting for activity summaries (thanks to @iyangdianfeng).

### Improvements

- GitHub: sign in with multiple accounts and smooth auth flow.
- Chat/UI: linkable mentions, better wrapping, and markdown/scroll polish in messages.
- Skills: ClawdHub catalog now pages results and retries transient failures.
- Mobile: improved layout for attachments, git, and permissions on small screens (thanks to @nelsonPires5).

### Fixes

- Diff: fixed Chrome scrolling in All Files layout.
- Reliability: file lists and message sends handle missing directories and transient errors better.

## [1.5.7] - 2026-01-24

### Improvements

- GitHub: PR panel supports fork PR detection by branch name.

### Fixes

- GitHub: Git tab PR panel can send failed checks/comments to chat with hidden context; added check details dialog with Actions step breakdown.
- Web: GitHub auth flow fixes.

## [1.5.6] - 2026-01-24

### New

- Sessions: start new sessions from GitHub issues with seeded context (title, body, labels, comments).
- Sessions: start new sessions from GitHub pull requests with PR context baked in (including diffs).

### Improvements

- GitHub: connect your account in Settings with device-flow auth to enable GitHub tools.
- Git: manage pull requests in the Git view with AI-generated descriptions, status checks, ready-for-review, and merge actions.

### Fixes

- Mobile: fixed CommandAutocomplete dropdown scrolling (thanks to @nelsonPires5).

## [1.5.5] - 2026-01-23

### Improvements

- Navigation: URLs now sync the active session, tab, settings, and diff state for shareable links and reliable back/forward (thanks to @TaylorBeeston).
- Settings: agent and command overrides now prefer plural directories while still honoring legacy singular folders.
- Skills: installs now target plural directories while still recognizing legacy singular folders.
- Web: improved push subscription handling across multiple windows.

### Fixes

- Web: push notifications no longer fire when a window is visible, avoiding duplicate alerts.

## [1.5.4] - 2026-01-22

### New

- Chat: new Apply Patch tool UI with diff preview for patch-based edits.
- Web: added Background notifications for PWA.

### Improvements

- Files: refreshed attachment cards and related file views for clearer context.
- Settings: manage provider configuration files directly from the UI.
- UI: updated header and sidebar layout for a cleaner, tighter workspace fit (thanks to @TheRealAshik).

### Fixes

- Diff: large diffs now lazy-load to avoid freezes (thanks to @Jovines).
- Reliability: connect to external OpenCode servers without auto-start and fixed subagent crashes (thanks to @TaylorBeeston).

## [1.5.3] - 2026-01-20

### New

- Settings: new memory limits controls for session message history.
- Chat: new Activity view in collapsed state, now shows latest 6 tools by default.

### Improvements

- Files: edit files inline with syntax highlighting, draft protection, and save/discard flow.
- Files: toggles to show hidden/dotfiles and gitignored entries in file browsers and pickers (thanks to @syntext).
- Chat: smooth session switching with more stable scroll anchoring.
- Git: generated commit messages now auto-pick a gitmoji when enabled (thanks to @TheRealAshik).
- Performance: faster filesystem/search operations and general stability improvements (thanks to @TheRealAshik).

### Fixes

- Chat: fixed message copy on Firefox for macOS (thanks to @syntext).
- Appearance: new corner radius control and restored input bar offset setting (thanks to @TheRealAshik).

## [1.5.2] - 2026-01-17

### New

- Sessions: added branch picker dialog to start new worktree sessions from local branches (thanks to @nilskroe).
- Sessions: added project header worktree button, active-session loader, and right-click context menu in the sessions sidebar (thanks to @nilskroe).
- Git: added gitmoji picker in commit message composer with cached emoji list (thanks to @TaylorBeeston).
- UI: added one-click diagnostics copy in the About dialog.

### Improvements

- Sessions: improved worktree delete dialog with linked session details, dirty-change warnings, and optional remote branch removal.
- Chat: optimized message loading for opening sessions.
- VSCode: tuned layout breakpoint and server readiness timeout for steady startup.
- Reliability: improved OpenCode process cleanup to reduce orphaned servers.

## [1.5.1] - 2026-01-16

### Fixes

- Desktop: fixed orphaned OpenCode processes not being cleaned up on restart or exit.
- OpenCode: fixed a crash when reloading configuration.

## [1.5.0] - 2026-01-16

### New

- UI: added a new Files tab to browse workspace files directly from the interface.
- Git Identities: added "default identity" setting with one-click set/unset and automatic local identity detection.
- VSCode: added responsive layout with sessions sidebar + chat side-by-side when wide, compact header, and streamlined settings.

### Improvements

- Diff: enhanced the diff viewer with mobile support and the ability to ask the agent for comments on changes.
- VSCode: improved server management to ensure it initializes within the workspace directory with context-aware readiness checks.
- Web: the server now automatically resolves and uses an available port if the default is occupied.

### Fixes

- Web/VSCode: fixed orphaned OpenCode processes not being cleaned up on restart or exit.
- Stability: fixed heartbeat race condition causing session stalls during long tasks (thanks to @tybradle).
- Desktop: fixed commands for worktree setup access to PATH.

## [1.4.9] - 2026-01-14

### New

- VSCode: added session editor panel to view sessions alongside files.
- Diff: added stacked/inline diff mode toggle in settings with sidebar file navigation (thanks to @nelsonPires5).

### Improvements

- VSCode: improved server connection reliability with multiple URL candidate support.
- Upload: increased attachment size limit to 50MB with automatic image compression to 2048px for large files.

### Fixes

- Mobile: fixed iOS keyboard safe area padding for home indicator bar (thanks to @Jovines).

## [1.4.8] - 2026-01-14

### New

- Git Identities: added token-based authentication support with ~/.git-credentials discovery and import.
- Settings: consolidated Git settings and added opencode zen model selection for commit generation (thanks to @nelsonPires5).
- Web Notifications: added configurable native web notifications for assistant completion (thanks to @vio1ator).
- Stability: added graceful shutdown handling for the server process (thanks to @vio1ator).

### Improvements

- Chat: sidebar sessions are now automatically sorted by last updated date (thanks to @vio1ator).
- UI: todo lists and status indicators now hide automatically when all tasks are completed (thanks to @vio1ator).
- Reliability: improved project state preservation on validation failures (thanks to @vio1ator) and refined server health monitoring.

### Fixes

- Chat: fixed edit tool output and added turn duration.

## [1.4.7] - 2026-01-10

### New

- Skills: added ClawdHub integration as built-in market for skills.

### Fixes

- Web: fixed issues in terminal.

## [1.4.6] - 2026-01-09

### New

- Chat: added question tool support with a rich UI for interaction.

### Improvements

- VSCode/Web: switched OpenCode CLI management to the SDK.
- Input: removed auto-complete and auto-correction.
- Shortcuts: switched the agent cycling shortcut from Shift+Tab back to Tab.

## [1.4.5] - 2026-01-08

### New

- Chat: added support for model variants (thinking effort).
- Skills: added autocomplete for skills on "/" when it is not the first character in input.
- Autocomplete: added scope badges for commands/agents/skills.
- MCP: added the ability to dynamically enable or disable configured MCP servers.
- Web: refactored the Add Project UI with autocomplete.

### Improvements

- Shortcuts: switched the agent cycling shortcut from Tab to Shift+Tab.
- Compact: changed `/summarize` to `/compact` and moved compaction to the SDK.

## [1.4.4] - 2026-01-08

### New

- Agent Manager: added "Copy Worktree Path" action in the more menu (thanks to @wienans).
- Worktrees: added session creation flow with loading screen, auto-create worktree setting, and setup commands management.
- Settings: added the ability to create new sessions in worktrees by default.
- Git view: added branch rename for worktree.
- Projects: added multi-project support with per-project settings for agents/commands/skills.
- Tunnel: added QR code and password URL for Cloudflare tunnel (thanks to @martindonadieu).

### Improvements

- Agent Manager / Multi Run: select agent per worktree session (thanks to @wienans).
- Agent Manager / Multi Run: worktree actions to delete group or individual worktrees, or keep only selected one (thanks to @wienans).
- Session sidebar: refactored the unified view for sessions in worktrees.
- Event stream: improved SSE with heartbeat management, permission bootstrap on connect, and reconnection logic.

### Fixes

- Chat: fixed IME composition for CJK input to prevent accidental send (thanks to @madebyjun).
- Model selector: fixed dropdowns not responding to viewport size.

## [1.4.3] - 2026-01-04

### New

- VS Code extension: added Agent Manager panel to run the same prompt across up to 5 models in parallel (thanks to @wienans).
- Added permission prompt UI for tools configured with "ask" in opencode.json, showing requested patterns and "Always Allow" options (thanks to @aptdnfapt).
- Added "Open subAgent session" button on task tool outputs to quickly navigate to child sessions (thanks to @aptdnfapt).

### Improvements

- VS Code extension: improved activation reliability and error handling.

## [1.4.2] - 2026-01-02

### New

- Added timeline dialog (`/timeline` command or Cmd/Ctrl+T) for navigating, reverting, and forking from any point in the conversation (thanks to @aptdnfapt).
- Added `/undo` and `/redo` commands for reverting and restoring messages in a session (thanks to @aptdnfapt).
- Added fork button on user messages to create a new session from any point (thanks to @aptdnfapt).

### Improvements

- Desktop app: keyboard shortcuts now use Cmd on macOS and Ctrl on web/other platforms (thanks to @sakhnyuk).
- Migrated to OpenCode SDK v2 with improved API types and streaming.

## [1.4.1] - 2026-01-02

### New

- Added the ability to select the same model multiple times in multi-agent runs for response comparison.
- Model selector now includes search and keyboard navigation.
- Added revert button to all user messages (including first one).
- Added HEIC image support for file attachments with automatic MIME type normalization for text format files.
- VS Code extension: added Git backend integration for UI access (thanks to @wienans).
- Web app: terminal backend now supports a faster Bun-based PTY when Bun is available, with automatic fallback for existing Node-only setups.

### Improvements

- VS Code extension: only shows the main Worktree in the Chat Sidebar (thanks to @wienans).
- Terminal: improved terminal performance and stability by switching to the Ghostty-based terminal renderer, while keeping the existing terminal UX and per-directory sessions.

### Fixes

- Terminal: fixed several issues with terminal session restore and rendering under heavy output, including switching directories and long-running TUI apps.

## [1.4.0] - 2026-01-01

### New

- Added the ability to run multiple agents from a single prompt, with each agent working in an isolated worktree.
- Worktrees: new branch creation can start from a chosen base; remote branches are only created when you push.
- Web app: added Cloudflare Quick Tunnel support for simpler remote access (thanks to @wojons and @aptdnfapt).

### Improvements

- Git view: improved branch publishing by detecting unpublished commits and automatically setting the upstream on first push.
- VS Code extension: default location is now the right secondary sidebar in VS Code, and the left activity bar in Cursor/Windsurf; navigation moved into the title bar (thanks to @wienans).
- Sidebar: improved readability for sticky headers with a dynamic background.

### Fixes

- Mobile: improved keyboard/input bar behavior (including Android fixes and better keyboard avoidance) and added an offset setting for curved-screen devices (thanks to @auroraflux).
- Chat: now shows clearer error messages when agent messages fail.

## [1.3.9] - 2025-12-30

### New

- Added skills management to settings with the ability to create, edit, and delete skills (make sure you have the latest OpenCode version for skills support).
- Added Skills catalog functionality for discovering and installing skills from external sources.
- VS Code extension: added right-click context menu with "Add to Context," "Explain," and "Improve Code" actions (thanks to @wienans).

## [1.3.8] - 2025-12-29

### New

- Added Intel Mac (x86_64) support for the desktop application (thanks to @rothnic).
- Added queued message mode with chips, batching, and idle auto‑send (including attachments).
- Added queue mode toggle to TaskHunter settings (chat section) with persistence across runtimes.
- Fixed scroll position persistence for active conversation turns across session switches.
- Refactored Agents/Commands management with ability to configure project/user scopes.

### Fixes

- Fixed scroll position persistence for active conversation turns across session switches.

## [1.3.7] - 2025-12-28

### New

- Added mobile-friendly drill-down navigation for settings.
- Added responsive tab labels in settings header (icons only at narrow widths).
- Introduced enhanced VSCode extension settings with dynamic layout based on width.

### Improvements

- Redesigned Settings as a full-screen view with tabbed navigation.
- ESC key now closes settings; double-ESC abort only works on chat tab without overlays.
- Improved session activity status handling and message step completion logic.

## [1.3.6] - 2025-12-27

### New

- Added the ability to manage (connect/disconnect) providers in settings.

### Improvements

- Adjusted auto-summarization visuals in chat.

## [1.3.5] - 2025-12-26

### New

- Added Nushell support for OpenCode CLI operations.
- Added Discord links in the about section.
- Added settings for choosing the default model/agent to start with in a new session.

### Improvements

- Improved file search with fuzzy matching capabilities.
- Enhanced mobile responsiveness in chat controls.
- Improved provider loading reliability during workspace switching.

### Fixes

- Fixed workspace switching performance and API health checks.
- Fixed session handling for non-existent worktree directories.

## [1.3.4] - 2025-12-25

### Improvements

- Diff view now loads reliably even with large files and slow networks.
- VS Code extension: improved type checking and editor integration.

### Fixes

- Fixed getting diffs for worktree files.

## [1.3.3] - 2025-12-25

### New

- VS Code extension: added an animated loading screen and introduced command for status/debug output.

### Improvements

- Updated OpenCode SDK to 1.0.185 across all app versions.
- Chat UI: improved agent activity status behavior and reduced image thumbnail sizes.

### Fixes

- VS Code extension: fixed startup, more reliable OpenCode CLI/API management, and stabilized API proxying/streaming.
- Fixed session activity tracking.
- Fixed directory path handling (including `~` expansion) to prevent invalid paths and related Git/worktree errors.
- Chat UI: improved turn grouping/activity rendering and fixed message metadata/agent selection propagation.

## [1.3.2] - 2025-12-22

### Improvements

- Updated OpenCode SDK to the latest version.

### Fixes

- Fixed new bug session when switching directories.

## [1.3.1] - 2025-12-22

### New

- The app opens to a new chat by default.
- Updated app identity with new logo and icons across all platforms.

### Fixes

- New chats no longer create a session until you send your first message.
- Fixed mobile and VSCode sessions handling.

## [1.3.0] - 2025-12-21

### New

- Added revert functionality in chat for user messages.

### Improvements

- Polished mobile controls in chat view.
- Updated user message layout/styling.
- Improved header tab responsiveness.
- Adjusted VSCode extension theme mapping and model selection view.
- Polished file autocomplete experience.

### Fixes

- Fixed bugs with new session creation when the VSCode extension initialized for the first time.

## [1.2.9] - 2025-12-20

### New

- Added session auto-cleanup with configurable retention across app versions, including the VSCode extension.
- Added web package updates from the mobile/PWA settings view.
- Added several optimizations for long sessions.

## [1.2.8] - 2025-12-19

### New

- Added a web update flow that does not require CLI interaction.
- Added a web install script with package manager detection.

### Improvements

- Web server update/restart now reuses previously set parameters like port or password.

## [1.2.7] - 2025-12-19

### New

- Introduced keyboard shortcuts help menu and quick actions menu.

### Improvements

- Comprehensive macOS native menu bar entries.
- Redesigned directory selection view for web/mobile with improved layout.
- Improved theme consistency across dropdown menus, selects, and command palette.

## [1.2.6] - 2025-12-19

### New

- Added write/create tool preview in permission cards with syntax highlighting.

### Improvements

- More descriptive assistant status messages with tool-specific and varied idle phrases.
- Polished Git view layout.

## [1.2.5] - 2025-12-19

### Improvements

- Polished the chat experience for longer sessions.
- Improved inactive-state handling in the Desktop app.
- Redesigned Git tab layout with improved organization.
- Smoother session rename experience.

### Fixes

- Fixed file links from Git view to Diff.
- Fixed untracked files in new directories not showing individually.

## [1.2.4] - 2025-12-18

### New

- Added macOS app menu entries for Check for Update and bug/request reports in Help.

### Fixes

- Mobile: added settings, improved terminal scrolling, and fixed app layout positioning.

## [1.2.3] - 2025-12-17

### New

- Added image preview support in Diff tab (shows original/modified images instead of base64 code).

### Improvements

- Improved diff view visuals and aligned styling across widgets.
- Optimized Git polling and background diff/syntax pre-warming for faster Diff tab opening.
- Optimized reloading unaffected diffs.

## [1.2.2] - 2025-12-17

### Improvements

- Agent Task tool now renders progressively with live duration and completed sub-tools summary.
- Unified markdown rendering between assistant messages and tool outputs.
- Reduced markdown header sizes.

## [1.2.1] - 2025-12-16

### Improvements

- Todo task tracking: collapsible status row showing AI's current task and progress.
- Switched "Detailed" tool output mode to only open the 'task', 'edit', 'multiedit', 'write', 'bash' tools.

## [1.2.0] - 2025-12-15

### Improvements

- Favorite & recent models for quick access in model selection.
- Tool call expansion settings: collapsed, activity, or detailed modes (thanks to @theblazehen).
- Font size & spacing controls (50-200% scaling) in Appearance Settings (thanks to @theblazehen).
- Settings page access within VSCode extension (thanks to @theblazehen).

## [1.1.6] - 2025-12-15

### Improvements

- Optimized diff view layout with smaller fonts and compact hunk separators.
- Improved mobile experience: simplified header, better diff file selector.
- Redesigned password-protected session unlock screen.

## [1.1.5] - 2025-12-15

### New

- Added fuzzy search for file mentions with `@` in chat.

### Improvements

- Improved file attachment performance.
- Optimized input area layout.

## [1.1.4] - 2025-12-15

### Improvements

- Flexoki themes for Shiki syntax highlighting for consistency with the app color schema.
- Enhanced VSCode extension theming with editor themes.

### Fixes

- Fixed mobile view model/agent selection.

## [1.1.3] - 2025-12-14

### New

- Added line wrap toggle in diff view with dynamic layout switching (auto-inline when narrow).

### Improvements

- Replaced Monaco diff editor with Pierre/diffs.

## [1.1.2] - 2025-12-13

### New

- Added feedback messages for "Restart API Connection" command.

### Improvements

- Moved VS Code extension to activity bar (left sidebar).
- Removed redundant VS Code commands.
- Enhanced UserTextPart styling.

## [1.1.1] - 2025-12-13

### Improvements

- Adjusted model/agent selection alignment.

### Fixes

- Fixed user message rendering issues.

## [1.1.0] - 2025-12-13

### New

- Added assistant answer fork flow.
- Added TaskHunter VS Code extension with editor integration: file picker, click-to-open in tool parts.
- Improved scroll performance with force flag and RAF placeholder.
- Added git polling backoff optimization.

### Improvements

- Improved scroll performance with force flag and RAF placeholder.

## [1.0.9] - 2025-12-08

### New

- Added directory picker on first launch to reduce macOS permission prompts.
- Show changelog in update dialog from current to new version.
- Added macOS folder access usage descriptions.

### Improvements

- Improved update dialog UI with inline version display.

## [1.0.8] - 2025-12-08

### New

- Added fallback detection for OpenCode CLI in `~/.opencode/bin`.
- Added window focus after app restart/update.

### Improvements

- Adapted traffic lights position and corner radius for older macOS versions.

## [1.0.7] - 2025-12-08

### Improvements

- Optimized OpenCode binary detection.
- Adjusted app update experience.

## [1.0.6] - 2025-12-08

### Improvements

- Enhanced shell environment detection.

## [1.0.5] - 2025-12-07

### Improvements

- Disabled devtools and page refresh in production builds.

### Fixes

- Fixed "Load older messages" incorrectly scrolling to bottom.
- Fixed page refresh getting stuck on splash screen.

## [1.0.4] - 2025-12-07

### Improvements

- Optimized desktop app start time.

## [1.0.3] - 2025-12-07

### Improvements

- Updated onboarding UI.
- Updated sidebar styles.

## [1.0.2] - 2025-12-07

### Improvements

- Updated macOS window design.

## [1.0.1] - 2025-12-07

- Initial public release of TaskHunter web and desktop packages in a unified monorepo.
- Added GitHub Actions release pipeline with macOS signing/notarization, npm publish, and release asset uploads.
- Introduced OpenCode agent chat experience with section-based navigation, theming, and session persistence.
