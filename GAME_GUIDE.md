# TiltMaze balance challenge

Run `node serve-game.cjs` from this folder and open http://localhost:8080 in desktop Chrome or Edge. Reload an already-open game tab to load the update. The HTML remains standalone. The ESP32 remote now uses a wired USB data cable; upload the new USB firmware and follow REMOTE_SETUP.md. Sensor wiring is unchanged.

## What is included

- Three repeatable courses. Each course always generates the same maze so retries and personal-best comparisons use the same layout. Course numbers identify layouts, not a prescribed clinical difficulty progression.
- Gentle (5 minutes), Classic (3 minutes), Quick (2 minutes), and Free practice (untimed).
- A 3–2–1 preparation countdown, then the round timer starts even if the ball is stationary.
- Three golden checkpoint rings worth 100 points each. Revisiting them cannot earn extra points. Route progress records the furthest point reached on the solution route and does not fall when the player backtracks. It does not represent a clinical outcome.
- Completion earns 1,000 points. Timed completion adds `floor(500 × remaining time / time limit)` points. The maximum possible score is 1,800. The completion reward is larger than the speed bonus.
- Every finish earns one star. Timed finishes with at least 25% of time left earn two stars; at least 50% earns three. Practice finishes earn one star. Stars currently are feedback for the completed round, not a persistent badge collection.
- A completion screen with score breakdown, personal-best feedback, and brief confetti (disabled when the device requests reduced motion).
- A local top-five scoreboard, separated by course, pace and control type (USB remote / phone gyro / mouse-touch). It keeps the best result per nickname within each group, with elapsed time breaking equal-score ties. Nicknames are case-insensitive when comparing results. Previous Bluetooth results remain stored separately and do not appear in the USB category.
- The newest 200 personal-best records are retained in browser local storage. No account, server scoreboard, or online multiplayer is added. Different browsers, ports and hostnames have separate storage; clearing browser data removes scores. If storage is blocked, the current page still works and shows a session-only storage message.
- Pause/resume, with a fresh preparation countdown. Time does not run while paused. Switching away from the tab, opening remote settings, or losing the remote signal pauses a running game. Resume is explicit; check remote data or disconnect to use the cursor.
- Timeout celebrates the progress reached and offers retry, menu, or an untimed continuation from the same position. Timeout attempts and continued runs are not ranked. A fresh Free practice run can earn a place on its own practice scoreboard.
- Changing control type during a run makes that finish unranked. This is a casual local scoreboard: pause is allowed, settings are adjustable, and it is not intended to enforce tournament rules or prevent local score editing.

Use the same nickname when comparing your own progress. The timer settings are game presets, not exercise prescriptions; choose a comfortable pace and use Free practice when time pressure is unwelcome.

## Ideas for the next iteration (not implemented)

| Idea | Player experience | Design choice |
| --- | --- | --- |
| Personal-best ghost | Replay a faint version of the player's previous successful run | Make it optional; let players compete with their own earlier performance |
| Achievement collection | Earn “First finish”, “All checkpoints”, or “Three courses explored” | Reward varied accomplishments, including completion without speed |
| Cosmetic unlocks | Choose a new ball colour or board theme after milestones | Predictable earned rewards, without random rewards or purchases |
| Personal goal cards | Choose “reach the second checkpoint” or “finish one comfortable round” | Make goals adjustable with the patient and treating professional |
| Progress history | Show recent completion times and furthest progress on the same course | Describe gameplay progress; do not label scores as recovery measurements |
| Friendly shared challenge | Players contribute completed courses to a shared target | Opt-in nicknames and cooperative goals; avoid compulsory public rankings |

For patient use, prioritize goals chosen with the person, achievable challenges, and room to rest. NICE's rehabilitation guidance supports meaningful, person-centred goal setting and tailoring sessions to the person's needs. These are design considerations, not evidence that this game produces a particular dopamine response or improves recovery.

References:
- https://www.nice.org.uk/guidance/ng252/chapter/Assessing-rehabilitation-needs-and-goal-setting
- https://www.nice.org.uk/guidance/ng236/chapter/Recommendations

## Checks

Run `node tests/challenge.test.cjs` for countdown, expiry, scoring, repeatable courses, checkpoint rewards, persistence, practice continuation, and pause logic. Run `node tests/remote.test.cjs` for USB serial framing, validation, lifecycle, unplug and reconnect checks. Tests simulate rendering and serial hardware; they do not replace testing with the physical ESP32 remote.
