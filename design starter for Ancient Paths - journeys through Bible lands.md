# The Way: A Journey Through Bible Lands

## Game Design and Technical Requirements

**Working title:** The Way: A Journey Through Bible Lands  
**Document status:** Initial authoritative design specification  
**Primary platform:** Desktop web application  
**Primary operator:** A single game host using a keyboard  
**Audience:** Church groups of approximately 20–40 people divided into teams  
**Accessibility priority:** Fully usable by blind players and a blind or sighted host  
**Version-one journey:** Jerusalem to Rome  
**Version-one content collection:** General Bible

---

# 1. Instructions for AI Development Agents

This document is the authoritative source for the game’s design.

When implementing the project:

1. Preserve the mechanics and accessibility requirements described here.
2. Do not silently replace established mechanics with simpler alternatives.
3. Do not hard-code questions, journeys, or audio content into the game engine.
4. Keep game logic separate from presentation, narration, and content data.
5. Treat spoken accessibility as a primary interface, not a fallback.
6. Ensure every action can be completed using the keyboard.
7. Never require the host to use a separate answer sheet.
8. Prefer deterministic, testable game logic.
9. Add automated tests for game-state transitions and content selection.
10. Record unresolved decisions in `OPEN_QUESTIONS.md` instead of inventing major new mechanics.
11. Maintain `IMPLEMENTATION_STATUS.md` with completed, active, and remaining work.
12. After each implementation phase, run all available tests and correct failures before proceeding.
13. Avoid destructive rewrites of working systems unless the existing implementation directly conflicts with this document.
14. Do not require an internet connection for normal gameplay.
15. Use placeholders when final artwork, narration, music, or sound effects have not yet been provided.

The first implementation should favor a reliable playable prototype over elaborate graphics.

---

# 2. Product Vision

The Way is a cooperative-competitive, team-based journey through actual Biblical geography and history.

Teams symbolically travel through Biblical lands, make strategic route and resource decisions, complete varied challenges, and participate in room-wide community events.

Players do not portray Biblical characters or change the outcome of Scripture. Biblical places, events, people, customs, geography, and history provide the setting and educational material.

The game should feel like an interactive audio adventure or game show rather than a basic trivia website.

Produced audio, music, sound effects, and visual presentation create atmosphere. Screen-reader speech and dependable keyboard controls provide the operational interface.

The game has two independent forms of recognition:

1. A team can win the journey by reaching the destination first.
2. A different team can receive recognition for service, generosity, encouragement, and cooperation.

The game should reward Bible knowledge without allowing Bible trivia alone to dominate the experience.

---

# 3. Core Design Principles

## 3.1 Permanent Progress

Teams generally do not move backward.

A failed task may cost a team time, resources, or an opportunity, but completed stage progress remains intact.

The game must not:

- erase earned successes;
- send teams backward arbitrarily;
- steal progress through random events;
- allow another team to sabotage a team’s position.

## 3.2 Failure Affects Opportunity

Failure should usually mean:

- no success earned for the task;
- fewer resources gained;
- another turn is required to finish the stage;
- a temporary opportunity is missed.

Failure should not remove a team from the game.

## 3.3 Meaningful Resources

The game uses three resources with distinct functions:

- Insight
- Provision
- Courage

Resources are not interchangeable currencies with different names. Each provides different strategic options.

## 3.4 Cooperation Without Sabotage

Teams may:

- help another team;
- donate a surplus success;
- contribute resources to a community event;
- choose a room-wide benefit;
- share certain rewards;
- participate in cooperative challenges.

Teams may not:

- steal another team’s resources;
- cancel another team’s earned progress;
- force another team backward;
- deliberately impose severe penalties;
- remove another team’s turn.

## 3.5 Controlled Randomness

Randomness should create stories, variety, humor, and uncertainty without deciding the entire game.

Random outcomes may be:

- helpful;
- cooperative;
- unusual;
- humorous;
- mildly inconvenient;
- neutral.

Random outcomes must not arbitrarily destroy major progress or make a team unable to compete.

## 3.6 Transparent Decisions

Before selecting a route, teams receive useful information about each available route:

- number of successes required;
- general difficulty;
- likely task categories;
- notable costs;
- special reward potential, when appropriate.

The precise tasks remain hidden until encountered.

## 3.7 Audio-First Accessibility

Anything necessary to play must be communicated through speech or sound.

The television display may reinforce information visually, but it must never be the only source of:

- route choices;
- task instructions;
- resource totals;
- stage progress;
- answer choices;
- community-event results;
- game status;
- warnings;
- confirmation messages.

## 3.8 Reasonable Waiting Time

One team’s turn must not continue so long that the other teams become disengaged.

A turn normally presents no more than:

- four tasks in a two-team game;
- three tasks in a three-to-five-team game;
- two or three tasks in a six-to-eight-team game.

Game setup may adjust these defaults according to team count, pace, and intended duration.

## 3.9 Learning Through Play

Bible and historical teaching should be brief, interesting, and connected to the current experience.

Most teaching reveals should last approximately 10–20 seconds. Location introductions may last approximately 15–30 seconds.

The game must not become a lecture between turns.

---

# 4. Target Play Environment

The expected environment includes:

- approximately 20–40 players;
- two to eight teams;
- one host operating the computer;
- a television, projector, or large monitor;
- room speakers;
- optional screen reader;
- players with a wide range of Bible knowledge;
- blind and sighted participants playing together.

The host may be blind. All host functions must therefore be keyboard accessible and understandable through screen-reader speech.

The host should not have to:

- read information from the television;
- remember hidden game rules;
- keep scores manually;
- maintain a separate answer sheet;
- calculate stage or resource rewards;
- determine which task should appear next;
- remember whether a question was previously used.

---

# 5. Game Structure

## 5.1 Journey

Every team travels through the same overall journey.

The version-one journey is:

**Jerusalem to Rome**

A possible milestone sequence is:

1. Jerusalem
2. Caesarea
3. Antioch
4. Asia Minor
5. Greece
6. Rome

The exact route may be refined when the journey data is authored.

Between major milestones are ordinary stages and temporary route forks.

## 5.2 Landmarks

Landmarks are named major locations that help players understand the journey conceptually.

Status should use language such as:

> Team Matthew has reached Antioch. Team Mark is on the final stage before Antioch. Team Luke remains on the coastal route from Caesarea.

Avoid relying on abstract descriptions such as:

> Team Matthew is on space 17.

Stage numbers may exist internally, but spoken status should emphasize:

- named landmarks;
- the route currently being traveled;
- distance to the next landmark;
- relative team positions.

## 5.3 Forks

At designated stages, a team chooses between two or three temporary routes.

All routes eventually rejoin the main journey.

Example:

> The road divides.
>
> Coastal Route: Four successes required. Easier challenges, primarily listening and general Bible knowledge.
>
> Inland Route: Three successes required. Moderate Scripture and reasoning challenges.
>
> Mountain Route: Two successes required. Difficult challenges with greater reward potential.
>
> All routes meet again at Antioch.

A route choice is locked until that team completes the stage.

A team may not change routes after discovering that its chosen route is difficult.

Different teams may select different routes through the same fork.

---

# 6. Progress Model

The game maintains three independent measurements for every team.

## 6.1 Journey Progress

Journey progress records:

- current landmark;
- current stage;
- selected fork route, if any;
- successes earned in the current stage;
- successes required to finish the stage.

Journey progress is generally permanent.

## 6.2 Resources

Resources determine what strategic actions a team can take.

The three resources are:

- Insight
- Provision
- Courage

Each resource has a maximum capacity of five.

## 6.3 Service Score

Service measures cooperative and generous actions.

Service:

- is not spendable;
- does not affect journey position;
- does not determine the main winner;
- is tracked separately from resources;
- is used for end-of-game recognition.

The internal term is `serviceScore`.

The default public recognition is the **Barnabas Award**. The public name should be configurable in journey or game settings.

---

# 7. Stages, Tasks, and Turns

## 7.1 Stage Completion

A stage has a required number of successful tasks.

Successes accumulate across turns.

Example:

> Easy route requirement: four successes.
>
> First turn: the team succeeds on two tasks. Stage progress becomes two of four.
>
> Second turn: the team succeeds on three tasks. Two successes finish the stage. The remaining success becomes surplus.

A failed turn does not erase prior stage successes.

## 7.2 Task Order

Tasks within a turn are linear.

Teams do not select which tasks to attempt.

Tasks must be handled in the order presented.

A team may decline to attempt a task, but the task is then recorded as failed.

Skipping a task does not allow the team to select a preferred replacement unless a valid Provision effect explicitly permits replacement.

## 7.3 Binary Task Outcomes

Ordinary tasks have two outcomes:

- success;
- failure.

A normal success is worth one stage success.

A task may have an authored amplified form worth two stage successes. The game must announce this possibility before the team commits to the amplified form.

Avoid vague partial-credit judgments in the version-one rules.

## 7.4 Tasks Per Turn

Recommended defaults:

| Team count | Recommended maximum tasks per turn |
|---|---:|
| 2 | 4 |
| 3–5 | 3 |
| 6–8 | 2 or 3 |

The final value is determined during setup using:

- team count;
- selected game duration;
- selected game pace.

The host may override the recommendation.

## 7.5 Ending a Stage Mid-Turn

When a team reaches the required number of stage successes:

1. The stage is completed immediately.
2. Remaining successful task results from that turn become surplus.
3. The team does not begin the next stage during the same turn.
4. Surplus decisions are resolved.
5. Stage rewards are awarded.
6. The turn ends.

This prevents one team from chaining several stages during a single turn.

## 7.6 Surplus Successes

A success earned beyond the number required to finish the current stage becomes a surplus success.

For each surplus success, the team chooses:

- **Keep:** convert it into a normal resource using the configured reward rules.
- **Offer:** donate it to the offering system and trigger a curated semi-random result.

When keeping a surplus, the game may:

- let the team choose Insight, Provision, or Courage;
- select a resource based on the task category;
- use an authored stage reward rule.

The initial implementation should default to allowing the team to choose a resource.

---

# 8. Resource System

All normal resources have a capacity of five.

If a reward would exceed the cap, the game must:

1. announce that the resource is already full;
2. offer another eligible resource when allowed;
3. otherwise discard only the excess amount.

## 8.1 Insight

Insight is the information resource.

Possible uses include:

- receive an additional clue;
- eliminate an incorrect multiple-choice option;
- replay an audio clue;
- hear an extended audio clue;
- reveal part of a sequence;
- obtain limited information about an upcoming challenge;
- clarify a prompt without revealing its answer.

Insight is normally spent after the task is revealed but before the final answer is accepted.

## 8.2 Provision

Provision is the flexibility and protection resource.

Possible uses include:

- retry a failed task;
- reduce an authored challenge to its assisted form;
- replace an eligible challenge;
- protect against a mild negative random effect;
- receive a more accessible version of a supported task.

Some Provision effects occur before an answer. A retry occurs after a failed answer.

A retry must use the task’s authored retry rules. The application must not invent an untested variation automatically.

## 8.3 Courage

Courage is the opportunity and calculated-risk resource.

Possible uses include:

- raise a task to its authored amplified form;
- turn a one-success task into a two-success opportunity;
- enter an eligible special route;
- activate an opportunity event;
- enhance certain community contributions.

Raising a task’s difficulty costs Courage.

If the amplified task succeeds, it awards two stage successes.

If it fails, it awards zero successes.

The task’s amplified form must be authored in the content data. The engine must not attempt to generate a harder question automatically.

## 8.4 Resource Timing

Each resource interaction must declare when it is available:

- before task reveal;
- after task reveal;
- before final answer;
- after failure;
- during stage resolution;
- during a Community Event.

The normal task sequence is:

1. Announce task category and base difficulty.
2. Reveal the task.
3. Open the resource and strategy window.
4. Apply selected assistance or amplification.
5. Accept the team’s final answer.
6. Close resource spending for that attempt.
7. Record the host’s ruling.
8. Reveal the official answer and teaching content.
9. Update progress and rewards.

Once the host accepts a final answer, the team cannot spend a resource retroactively unless the selected effect explicitly operates after failure.

---

# 9. Perfect Stage Completion

A perfect stage completion occurs when:

- a team begins a turn with an unfinished stage;
- every attempted task required to finish that stage during the turn succeeds;
- no task is failed or skipped during that turn before completion;
- the team completes the stage during that turn.

A perfect stage grants:

- the normal stage reward;
- applicable surplus rewards;
- a special Journey Token if the team does not already hold one.

## 9.1 Journey Token

The Journey Token is separate from Insight, Provision, and Courage.

A team may hold no more than one Journey Token.

For version one, a Journey Token may be spent after a task is revealed to use one eligible normal resource effect without paying its resource cost.

It may not:

- activate a task variation that the task does not support;
- provide an automatic correct answer;
- generate more than the task’s declared maximum success value;
- be converted directly into Service.

The engine should define Journey Token effects in configuration so they can be changed later.

---

# 10. Offering and Semi-Random Effects

A team may offer:

- a surplus success;
- an Opportunity resource when an event explicitly permits it;
- another eligible reward identified by the content data.

Offering always earns Service, even if the material result is neutral or silly.

The random result comes from a curated effect pool.

Possible results include:

- another team receives a selected resource;
- every team receives one resource;
- the offering team receives information about its next stage;
- another team receives a clue on its next task;
- a special detour becomes available;
- the next Community Event receives a bonus;
- a humorous event occurs with no mechanical reward;
- nothing happens, but the act of service still counts.

The result pool must be weighted.

Recommended initial balance:

- 60% beneficial;
- 20% cooperative room-wide benefit;
- 15% humorous or strange but harmless;
- 5% neutral.

Do not include severe negative results.

The game should not reveal exact probabilities during ordinary play.

---

# 11. Service and the Barnabas Award

Service should recognize observable actions within the game without claiming to measure anyone’s spirituality.

Teams may earn Service for:

- offering a surplus success;
- donating a resource;
- helping another team receive a clue;
- choosing a community benefit over a personal reward;
- contributing resources to a Community Event;
- completing an authored cooperative action;
- accepting a result that benefits another team;
- voluntarily sharing an eligible reward.

Service awards must be defined in data or configuration rather than scattered through interface code.

Example values:

| Action | Suggested Service |
|---|---:|
| Offer one surplus success | 1 |
| Donate one normal resource | 1 |
| Choose a room-wide benefit | 1 |
| Make an exceptional Community Event contribution | 2 |
| Complete a special cooperative objective | 1–2 |

These values are starting defaults and should be balance-tested.

The final game summary announces at least:

- Journey Winner;
- Barnabas Award recipient;
- final team positions;
- notable community accomplishments.

Ties for the Barnabas Award should be permitted. Do not use journey position as the automatic tiebreaker.

---

# 12. Community Events

Community Events temporarily pause ordinary turn order and involve every team.

## 12.1 Triggering Events

The first team to reach a designated landmark triggers its Community Event for the entire room.

Each landmark event occurs only once per game unless explicitly marked repeatable.

Example:

> Team Luke has reached Antioch. All teams pause for the Antioch Community Event.

After the event, teams resume from their previous individual positions.

## 12.2 Event Structures

Community Events may ask teams to:

- answer different parts of a shared question;
- identify a sequence of Biblical events;
- recognize hymns or audio clues;
- solve portions of a larger puzzle;
- contribute resources toward a shared threshold;
- choose whether to help the room or preserve resources;
- remember details from a narrated scene;
- make connected strategic decisions.

## 12.3 Rewards

The primary result should benefit the room.

Possible rewards include:

- every team receives one resource;
- every team receives a choice of resource;
- the next stage requires one fewer success;
- the group unlocks a produced story or historical feature;
- an upcoming offering pool becomes more favorable.

Individual teams may also receive bonuses for exceptional contributions.

Community Events may include transparent catch-up assistance, but must not punish the leading team.

Example:

> The room completed five of six objectives. Every team receives one Provision. Teams more than two stages behind may also choose one Insight or Courage.

Catch-up rules should be configurable and announced clearly.

---

# 13. Task Categories

Version one should contain a deliberate mix of task families.

## 13.1 Scripture Knowledge

Examples include:

- people;
- places;
- events;
- quotations;
- sequence;
- books of the Bible;
- identification;
- general Bible knowledge.

## 13.2 Bible Reasoning

These tasks provide enough information for teams to reason toward an answer.

They should not require extensive prior Bible knowledge.

## 13.3 Historical Context

Possible subjects include:

- Biblical geography;
- ancient travel;
- occupations;
- food;
- money and measurement;
- Roman government;
- Jewish customs;
- ancient cities;
- archaeology;
- trade;
- houses and daily life.

Historical questions should have concise teaching reveals.

Historical claims must be sourced during content creation and should distinguish:

- information directly stated in Scripture;
- widely accepted historical background;
- uncertain or disputed interpretations.

## 13.4 Audio and Listening

Examples include:

- remembering a spoken sequence;
- recognizing environmental sounds;
- identifying details in a narrated scene;
- distinguishing speakers;
- detecting a changed detail;
- following audio directions.

Every audio task needs:

- text instructions;
- replay behavior;
- an accessible fallback;
- a defined Insight interaction.

## 13.5 Hymn Challenges

Examples include:

- identify a hymn from a melody fragment;
- finish a lyric;
- recognize an altered-tempo melody;
- identify a hymn from progressively longer introductions;
- identify a missing or changed musical detail.

Use only audio and lyrics for which the project has appropriate permission.

Every hymn task must provide a nonvisual playing experience.

## 13.6 Decision and Strategy

Teams receive a situation and make a reasoned choice.

These tasks should not pretend that one strategic preference is Biblical truth unless Scripture clearly establishes the answer.

## 13.7 Community Tasks

These tasks are designed for all teams and are normally used within Community Events.

---

# 14. Task Variants

A task may provide up to three authored forms:

1. Assisted
2. Normal
3. Amplified

Not every task must support every form.

Examples:

- Normal: multiple choice; amplified: open-ended.
- Normal: eight-note hymn excerpt; amplified: four-note excerpt.
- Normal: identify one person; amplified: identify the person and related location.
- Normal: hear an audio clue twice; amplified: hear it once.
- Normal: arrange three events; assisted: eliminate one incorrect position.

Each task declares:

- whether assistance is available;
- whether amplification is available;
- the cost of each interaction;
- the success value;
- how retries work;
- which assets are required.

---

# 15. Answer Handling

The host rules on spoken answers.

The game does not need speech recognition for version one.

The host can mark an answer:

- correct;
- incorrect;
- skipped.

The interface must display and speak:

- official answer;
- accepted alternatives;
- pronunciation guidance when necessary;
- a short explanation;
- optional historical note;
- host guidance for ambiguous responses.

The host should have one command to reveal the official answer and explanation.

The answer must remain hidden from the audience display until the host reveals it.

The host interface may privately expose the answer through screen-reader speech only if a secure host mode is implemented. For version one, prefer keeping the answer hidden until the ruling and then revealing it through one command.

A host correction or undo function must be available in case the wrong ruling key is pressed.

---

# 16. Teaching Reveals

After resolution, the game may provide a short teaching reveal.

A reveal can include:

- the correct answer;
- a relevant Scripture reference;
- a concise explanation;
- historical or geographic background;
- a connection to the current location;
- clarification of a common misconception.

Normal target length:

- approximately 10–20 seconds of narration;
- one short paragraph of displayed text.

The host must be able to:

- play the reveal;
- repeat it;
- skip it;
- read it through interface speech if recorded narration is unavailable.

The factual text is the source of truth. Produced narration is a presentation asset.

---

# 17. Content Architecture

Content must be stored separately from engine code.

The engine should support installable content packs.

Potential future packs include:

- General Bible
- Life of Christ
- Acts and the Early Church
- Old Testament
- Classic Hymns
- Christmas
- Easter
- Church-specific content

Version one requires one substantial mixed pack:

**General Bible**

## 17.1 Task Record

A task should support data equivalent to:

```json
{
  "id": "general-bible-acts-001",
  "schemaVersion": 1,
  "packId": "general-bible",
  "category": "scripture-knowledge",
  "title": "Choosing Matthias",
  "biblePeriods": ["early-church"],
  "locations": ["jerusalem"],
  "difficulty": "moderate",
  "prompt": "Who was chosen to replace Judas among the twelve apostles?",
  "answer": "Matthias",
  "acceptedAnswers": ["Matthias"],
  "hostGuidance": "Accept common pronunciation variations.",
  "scriptureReferences": ["Acts 1:26"],
  "normalVariant": {
    "prompt": "Who was chosen to replace Judas among the twelve apostles?",
    "successValue": 1
  },
  "assistedVariant": {
    "available": true,
    "cost": {
      "resource": "insight",
      "amount": 1
    },
    "prompt": "Was the replacement Matthias, Silas, or Barnabas?",
    "successValue": 1
  },
  "amplifiedVariant": {
    "available": true,
    "cost": {
      "resource": "courage",
      "amount": 1
    },
    "prompt": "Name the person chosen to replace Judas and the other finalist who was considered.",
    "answer": "Matthias and Joseph called Barsabbas, also known as Justus",
    "acceptedAnswers": [
      "Matthias and Joseph Barsabbas",
      "Matthias and Justus"
    ],
    "successValue": 2
  },
  "clues": [
    "The answer appears in the first chapter of Acts."
  ],
  "teachingReveal": "Matthias was selected after the believers prayed and cast lots. Joseph called Barsabbas, also known as Justus, was the other candidate.",
  "historicalNote": null,
  "audioAsset": null,
  "tags": ["apostles", "acts", "people"],
  "resourceInteractions": {
    "insight": true,
    "provision": true,
    "courage": true
  },
  "estimatedSeconds": 45
}
```

The exact implementation language may use typed models rather than raw JSON, but exported content should remain human-editable and validate against a schema.

## 17.2 Journey Record

A journey should define:

- journey ID;
- public title;
- starting location;
- destination;
- milestones;
- stages;
- forks;
- route descriptions;
- stage completion requirements;
- Community Events;
- task weighting;
- location introductions;
- ambient audio;
- map display data;
- ending presentation.

## 17.3 Audio Asset Record

Audio metadata should define:

- stable asset ID;
- file path;
- asset type;
- transcript;
- duration;
- volume recommendation;
- replay permission;
- fallback text;
- attribution or rights information where needed.

Missing nonessential audio must not prevent the game from loading.

---

# 18. Balanced Session Generation

Do not select every task using unrestricted randomness at the moment it is needed.

During setup, generate a hidden balanced session deck.

The generator should consider:

- enabled content packs;
- journey locations;
- game duration;
- team count;
- selected difficulty;
- enabled task categories;
- audio availability;
- recently used tasks;
- category distribution;
- Bible-period distribution;
- estimated task duration;
- fairness among teams.

The deck should:

- avoid duplicates within a session;
- avoid long streaks from one category;
- distribute difficulty reasonably;
- give teams broadly comparable task mixes;
- include scheduled audio and hymn challenges;
- reserve appropriate tasks for Community Events;
- contain extra tasks for replacements and retries.

Randomization should be seedable.

The game should store the seed in the save file so a session can be reproduced for testing.

Purely identical team decks are not required, but no team should receive a consistently easier or harder collection because of uncontrolled randomness.

---

# 19. Game Setup

The setup wizard should gather only information needed to configure the session.

Required setup fields:

1. Journey
2. Number of teams
3. Team names
4. Intended game duration
5. Game pace
6. Overall difficulty
7. Enabled content packs
8. Enabled task categories
9. Audio settings
10. Community catch-up setting
11. Random seed, normally generated automatically

Recommended duration options:

- Short
- Standard
- Long
- Custom minutes

Recommended pace options:

- Relaxed
- Standard
- Quick

The application should calculate and announce:

- recommended tasks per turn;
- estimated stage count;
- estimated Community Event count;
- expected total duration.

The host may override recommended tasks per turn.

The setup wizard should warn when the chosen settings are unlikely to fit the requested duration.

The host must be able to review the full configuration before starting.

---

# 20. Turn Lifecycle

Every normal turn follows a predictable state machine.

## 20.1 Begin Turn

Announce:

- current team;
- current location or route;
- stage progress;
- resource totals;
- Journey Token status;
- number of tasks available this turn.

## 20.2 Resolve Fork if Needed

If the team is entering a fork for the first time:

1. Announce every route.
2. State successes required, difficulty, likely task types, costs, and rewards.
3. Allow routes to be repeated individually or as a complete list.
4. Let the team choose.
5. Confirm the selected route.
6. Lock the route for that team.

## 20.3 Prepare Task

Announce:

- task number within the turn;
- category;
- base difficulty;
- whether assistance is available;
- whether amplification is available.

## 20.4 Reveal Task

Play produced audio when available.

Also make the complete prompt available through interface speech and visible text.

## 20.5 Resource Window

The team may:

- answer normally;
- spend Insight for an eligible information effect;
- spend Provision for an eligible assisted form;
- spend Courage for the amplified form;
- use its Journey Token for an eligible effect;
- repeat the prompt.

Confirm resource spending before applying it.

## 20.6 Accept Answer

The host indicates that the team has provided its final answer.

Resource changes that are not valid after the answer are now locked.

## 20.7 Host Ruling

The host marks:

- correct;
- incorrect;
- skipped.

If incorrect and an eligible retry is available, offer the retry before final resolution.

## 20.8 Reveal and Teaching

The host activates the reveal.

The system presents:

- correct or incorrect audio cue;
- official answer;
- short teaching reveal;
- historical note when appropriate.

The host may repeat or skip the teaching content.

## 20.9 Update Progress

The engine:

- awards zero, one, or two stage successes according to the selected task variant;
- updates current stage progress;
- checks for stage completion;
- checks for surplus;
- checks for perfect completion;
- applies task rewards.

## 20.10 Continue or End Turn

If tasks remain and the stage is unfinished, proceed to the next task.

If the stage is completed:

1. resolve surplus;
2. award stage rewards;
3. award a Journey Token when applicable;
4. move the team to the next stage;
5. check for landmark arrival;
6. end the team’s turn.

If the task limit is reached before stage completion:

1. preserve accumulated progress;
2. announce remaining successes required;
3. end the turn.

## 20.11 Trigger Community Event

If the completed stage reaches an untriggered landmark:

1. finish all current stage rewards;
2. announce the landmark;
3. play its introduction;
4. save the ordinary turn position;
5. begin the Community Event;
6. resolve the event;
7. resume normal turn order.

---

# 21. Game Length and Ending

The standard game should target approximately 50–60 minutes unless setup specifies otherwise.

The engine should estimate length using:

- number of teams;
- tasks per turn;
- estimated seconds per task;
- stage requirements;
- number of Community Events;
- selected pace;
- quantity of produced narration.

The preferred ending is reaching the destination.

If the configured time limit is reached first, the host may:

- continue until a team reaches the destination;
- finish the current round and use current progress;
- activate a configured final challenge.

For a shortened ending, determine journey position using:

1. furthest landmark reached;
2. stages completed beyond that landmark;
3. successes in the current stage;
4. remaining normal resources, only if still tied.

Service Score must never break a journey-position tie.

A shared journey victory is acceptable.

---

# 22. Audio Architecture

The game has two conceptual audio systems.

## 22.1 Produced Game Audio

Produced audio includes:

- narrator or host voice;
- journey introductions;
- location descriptions;
- atmospheric sound;
- music;
- task audio;
- hymn excerpts;
- character dialogue;
- Community Event presentation;
- celebrations;
- correct and incorrect cues.

## 22.2 Interface Speech

Interface speech communicates:

- focus;
- menu options;
- current team;
- resource counts;
- progress;
- available actions;
- setup values;
- confirmations;
- errors;
- status;
- diagnostics;
- fallback narration.

The application must not depend on produced audio for basic usability.

Produced audio and interface speech must not talk over one another. Use a managed announcement and playback queue.

Important interface messages should wait until produced audio finishes or intentionally stop it when the user requests an interrupt.

## 22.3 Audio Controls

The host needs separate controls for:

- master volume;
- music volume;
- effects volume;
- narration volume;
- interface speech behavior;
- pause;
- replay;
- stop current clip;
- skip optional narration.

All prerecorded speech requires a text transcript.

---

# 23. Accessibility Requirements

Accessibility is a release requirement.

## 23.1 Keyboard Operation

Every operation must be available by keyboard.

No feature may require:

- mouse movement;
- drag and drop;
- visual targeting;
- hovering;
- color recognition;
- reading a visual map.

## 23.2 Repeat and Status Commands

Repeat and status commands must be available in nearly every non-editing state.

Initial keyboard proposal:

| Key | Function |
|---|---|
| R | Repeat current game prompt |
| S | Speak current game and team status |
| A | Speak available actions and usable resources |
| T | Speak all team positions |
| H or F1 | Context-sensitive help |
| Enter | Confirm or advance |
| Escape | Back or cancel when safe |
| Space | Pause or resume produced audio |
| Ctrl+Z | Undo the most recent reversible host action |

Do not assign a global shortcut that interferes with text entry during setup. Use an input firewall or mode-aware keyboard handler.

The final shortcut map should be documented in `KEYBOARD_COMMANDS.md`.

## 23.3 Spoken Status

The status command should report, in a consistent order:

1. current team;
2. current location or route;
3. successes earned and required;
4. tasks remaining this turn;
5. Insight;
6. Provision;
7. Courage;
8. Journey Token;
9. immediately available actions.

All-team status should summarize positions concisely rather than reading every internal statistic.

## 23.4 Focus Management

After dialogs, reveals, undo operations, and Community Events, focus must return to a predictable location.

Opening a modal must:

- move focus into the modal;
- trap focus while open;
- announce its title and purpose;
- return focus to the invoking control when closed.

## 23.5 Screen-Reader Announcements

Use appropriate semantic HTML and live regions.

Do not flood the screen reader with every visual animation.

Announcements should prioritize:

- state changes;
- active team;
- task result;
- progress;
- resource changes;
- errors requiring action.

## 23.6 Visual Independence

Graphics may include:

- routes;
- landmarks;
- team markers;
- progress animations;
- resource icons;
- atmospheric backgrounds.

Every meaningful visual state must have an equivalent spoken or textual description.

## 23.7 Error Recovery

A blind host must be able to recover from:

- choosing the wrong route;
- marking the wrong answer result;
- spending the wrong resource;
- advancing too early;
- accidentally skipping narration.

Provide:

- confirmation for consequential choices;
- undo for recent reversible actions;
- an action log;
- save checkpoints;
- clear descriptions of what undo will change.

---

# 24. Visual Presentation

The audience display should be clear at television distance.

It should normally show:

- current team;
- current location;
- task prompt;
- answer choices when applicable;
- current stage progress;
- resource totals;
- the journey map or landmark context;
- Community Event progress.

Do not display the official answer until the host reveals it.

Do not rely on color alone to identify teams or resources.

Every team should have:

- a name;
- a color;
- a distinct symbol or pattern.

Animations should be brief and should not delay keyboard operation.

Provide a reduced-motion option.

---

# 25. Application Modes

The application should use explicit modes or states.

Suggested high-level states:

- startup;
- setup;
- setup review;
- session generation;
- ready;
- begin turn;
- fork choice;
- task preview;
- task presentation;
- resource window;
- awaiting answer;
- host ruling;
- retry decision;
- answer reveal;
- teaching reveal;
- progress resolution;
- surplus decision;
- stage completion;
- landmark introduction;
- Community Event;
- paused;
- game summary;
- recovery;
- error.

Only commands valid for the current state should execute.

Invalid keys should be ignored or produce a concise explanation. They must not leak into another mode.

---

# 26. Saving, Recovery, and Logging

The game must automatically save after consequential actions, including:

- completing setup;
- choosing a route;
- spending a resource;
- recording a ruling;
- completing a task;
- completing a stage;
- resolving an offering;
- completing a Community Event.

The host must be able to resume an interrupted game.

A saved game should include:

- schema version;
- journey ID and version;
- content pack versions;
- random seed;
- generated session deck;
- team states;
- task history;
- resource transactions;
- Service transactions;
- triggered milestones;
- current state;
- audio playback state where practical;
- undo history sufficient for safe recovery.

Maintain a human-readable event log.

Example events:

```text
Team Mark spent 1 Courage.
Task general-bible-acts-014 changed to amplified form.
Host marked the answer correct.
Team Mark earned 2 stage successes.
Team Mark completed the Coastal Route.
Team Mark offered 1 surplus success.
Team Luke received 1 Insight.
Team Mark earned 1 Service.
```

The log is for recovery, auditing, balance testing, and troubleshooting.

---

# 27. Recommended Technical Architecture

The initial application should be a local-first desktop web application.

A reasonable implementation may use:

- TypeScript;
- a modern component-based web framework;
- semantic HTML;
- CSS;
- local JSON content packs;
- browser-based audio playback;
- IndexedDB or equivalent local persistence;
- a validation library for external data;
- a unit-test framework;
- an end-to-end browser testing framework.

The exact framework is not locked. The development agent may select a stable, well-supported stack.

The architecture must maintain these boundaries:

## 27.1 Game Engine

Owns:

- legal state transitions;
- turn order;
- stage progress;
- resource transactions;
- Journey Tokens;
- Service;
- fork locking;
- milestones;
- offering effects;
- Community Events;
- victory conditions.

The engine does not directly play audio or manipulate interface elements.

## 27.2 Content System

Owns:

- content-pack loading;
- schema validation;
- task retrieval;
- variant data;
- answer data;
- teaching content;
- asset references;
- journey definitions.

## 27.3 Session Builder

Owns:

- seeded randomness;
- balanced deck generation;
- category distribution;
- difficulty distribution;
- repeat avoidance;
- estimated session duration;
- replacement-task reserves.

## 27.4 Presentation Layer

Owns:

- audience display;
- host controls;
- focus;
- keyboard commands;
- dialogs;
- visual animations;
- screen-reader announcements.

## 27.5 Audio Manager

Owns:

- produced audio queue;
- narration;
- music;
- effects;
- transcripts;
- fallback speech;
- pause and replay;
- ducking and interruption rules.

## 27.6 Persistence Layer

Owns:

- automatic saves;
- manual save/export;
- recovery;
- migration between schema versions;
- action history;
- logs.

---

# 28. Suggested Core Types

```typescript
type ResourceType = "insight" | "provision" | "courage";

type TaskResult = "correct" | "incorrect" | "skipped";

interface TeamState {
  id: string;
  name: string;
  color: string;
  symbol: string;

  currentMilestoneId: string;
  currentStageId: string;
  selectedRouteId?: string;

  stageSuccesses: number;
  resources: Record<ResourceType, number>;
  hasJourneyToken: boolean;
  serviceScore: number;
}

interface TaskAttempt {
  taskId: string;
  teamId: string;
  variant: "assisted" | "normal" | "amplified";
  result: TaskResult;
  successesAwarded: number;
  resourcesSpent: Partial<Record<ResourceType, number>>;
  usedJourneyToken: boolean;
}

interface PlaySession {
  id: string;
  schemaVersion: number;
  journeyId: string;
  journeyVersion: string;
  contentPackVersions: Record<string, string>;
  seed: string;

  teams: TeamState[];
  activeTeamIndex: number;
  state: GameState;
  turnTaskLimit: number;

  triggeredMilestones: string[];
  taskHistory: TaskAttempt[];
  eventLog: GameEvent[];
}
```

The exact types may evolve, but the separation between progress, spendable resources, and Service must remain.

---

# 29. Fairness and Content Reuse

The game must remember tasks used during the current session.

Future versions should optionally maintain local recent-use history across sessions.

Task selection should reduce the probability of recently heard content without permanently excluding it.

Possible reuse controls:

- no repeat within the same game;
- avoid tasks used in the last specified number of games;
- reset recent-use history;
- manually select or exclude content packs;
- diagnostic preview of the generated deck.

A content pack should include enough tasks that an ordinary session uses only a portion of the available collection.

---

# 30. Version-One Scope

Version one should include:

- one journey from Jerusalem to Rome;
- two-to-eight-team support;
- Short, Standard, and Long games;
- setup recommendations based on team count;
- forks that rejoin the main path;
- permanent stage progress;
- Insight, Provision, and Courage;
- resource caps of five;
- Journey Tokens;
- surplus success decisions;
- offering effects;
- Service tracking;
- Barnabas Award;
- at least two Community Events;
- several task categories;
- assisted and amplified variants where authored;
- host-controlled answer rulings;
- official answers and short teaching reveals;
- produced-audio support with text fallback;
- full keyboard operation;
- repeat and status commands;
- automatic saving;
- undo for recent host mistakes;
- balanced seeded session generation;
- a large-screen audience view;
- an accessible host view;
- development content sufficient to play a complete test game.

## 30.1 Minimum Prototype Content

Before calling version one playable, include enough original content for at least two sessions with minimal repetition.

Recommended initial minimum:

- 30 Scripture Knowledge tasks;
- 15 Bible Reasoning tasks;
- 15 Historical Context tasks;
- 10 Audio or Listening tasks;
- 10 Hymn tasks using authorized material;
- 10 Decision or Strategy tasks;
- 4 Community Events;
- 20 Offering outcomes;
- location introductions for all major landmarks.

If final audio is unavailable, use transcripts and placeholder tones while preserving the correct asset interfaces.

---

# 31. Features Deferred Beyond Version One

Do not block version one on:

- online multiplayer;
- phones used as team controllers;
- automatic speech recognition;
- cloud accounts;
- remote content marketplace;
- AI-generated questions during live play;
- user-created map editor;
- advanced cinematic animation;
- synchronized lighting;
- mobile application packaging;
- competitive attacks;
- team elimination;
- live internet research;
- public leaderboards.

The architecture should not deliberately prevent future content packs or journeys, but it does not need to implement every future feature now.

---

# 32. Explicit Non-Goals

The game is not:

- a simple Bible-trivia scoreboard;
- a reenactment that changes Biblical events;
- a tool for judging anyone’s faith;
- a game where teams attack one another;
- a visually operated board game with accessibility added later;
- a random event generator that can erase an hour of play;
- dependent on a human answer sheet;
- dependent on an internet connection;
- dependent on prerecorded audio for basic operation.

---

# 33. Testing Requirements

## 33.1 Game-Engine Tests

Test at minimum:

- stage successes persist across turns;
- failed tasks do not erase successes;
- routes remain locked until stage completion;
- normal tasks award one success;
- amplified successes award two;
- amplified failures award zero;
- resources never exceed five;
- Journey Tokens never exceed one;
- surplus is calculated correctly;
- offered surplus earns Service;
- offering effects cannot remove permanent progress;
- milestones trigger only once;
- Community Events preserve ordinary turn order;
- Service does not affect journey winner calculation;
- seeded generation is reproducible;
- undo restores the complete prior state.

## 33.2 Content Validation

Reject or clearly report:

- duplicate task IDs;
- missing official answers;
- amplified variants without success values;
- missing audio transcripts;
- missing referenced assets;
- invalid resource costs;
- invalid category names;
- stages with no eligible tasks;
- routes that do not reconnect;
- Community Events with no completion rule.

A bad optional audio asset should degrade gracefully. Invalid required journey or task data should stop session creation with a useful error report.

## 33.3 Accessibility Tests

Verify:

- all setup and gameplay functions work without a mouse;
- focus is never lost;
- modal focus returns correctly;
- status can be heard in every gameplay state;
- repeat does not change state;
- answer text remains hidden until reveal;
- speech announcements do not overlap uncontrollably;
- controls have meaningful accessible names;
- visual information has textual equivalents;
- keyboard commands are mode-aware;
- game recovery is possible without seeing the screen.

## 33.4 Playtesting

Conduct playtests with:

- two teams;
- four teams;
- six-to-eight teams;
- blind host;
- blind participants;
- mixed Bible-knowledge levels;
- produced audio disabled;
- missing optional audio;
- interrupted and resumed sessions.

Measure:

- average turn duration;
- wait time between team turns;
- game duration;
- resource accumulation;
- resource spending;
- route choices;
- percentage of amplified attempts;
- Community Event engagement;
- repeated content;
- Service-score distribution.

---

# 34. Implementation Plan

## Phase 1: Project Foundation

Create:

- project structure;
- selected framework;
- formatting and linting;
- unit-test configuration;
- core schemas;
- content validation;
- basic documentation.

Deliverable: validated sample journey and sample tasks load successfully.

## Phase 2: Headless Game Engine

Implement:

- teams;
- turn order;
- stages;
- accumulated successes;
- fork selection and locking;
- resources;
- amplified outcomes;
- Journey Tokens;
- surplus;
- Service;
- milestone triggers;
- victory calculation.

Deliverable: a complete game can run through automated tests without a graphical interface.

## Phase 3: Session Builder

Implement:

- content-pack loading;
- seeded randomization;
- balanced deck generation;
- category limits;
- difficulty distribution;
- repeat prevention;
- duration estimation.

Deliverable: identical seeds reproduce identical sessions, and different teams receive reasonably balanced task mixes.

## Phase 4: Accessible Host Interface

Implement:

- setup wizard;
- keyboard navigation;
- state-specific controls;
- host rulings;
- answer reveal;
- repeat;
- status;
- help;
- undo;
- focus management.

Deliverable: a complete placeholder-content game can be operated with a keyboard and screen reader.

## Phase 5: Audience Presentation

Implement:

- large-screen current-team display;
- stage progress;
- resources;
- journey landmarks;
- task prompts;
- answer reveals;
- Community Event progress;
- accessible non-color team distinctions.

Deliverable: host and audience views remain synchronized.

## Phase 6: Audio System

Implement:

- narration queue;
- effects;
- music;
- pause;
- replay;
- skip;
- transcripts;
- fallback speech;
- volume categories;
- prevention of overlapping announcements.

Deliverable: missing optional audio never makes the game inaccessible.

## Phase 7: Community and Offering Systems

Implement:

- landmark-triggered events;
- team contributions;
- room-wide rewards;
- catch-up configuration;
- surplus offerings;
- weighted outcome pools;
- Service awards.

Deliverable: community mechanics function without changing permanent progress unfairly.

## Phase 8: Persistence and Recovery

Implement:

- automatic saves;
- resuming;
- action log;
- undo;
- versioned save data;
- safe migration behavior.

Deliverable: closing the application during a game does not lose the last completed action.

## Phase 9: Version-One Content

Author and validate:

- Jerusalem-to-Rome journey;
- landmark introductions;
- General Bible task pack;
- Community Events;
- offering outcomes;
- placeholder or final audio references.

Deliverable: at least two full test sessions can be played with minimal content repetition.

## Phase 10: Accessibility and Balance Audit

Perform:

- keyboard-only audit;
- screen-reader audit;
- focus audit;
- game-length simulation;
- resource-economy analysis;
- fairness review;
- content-repeat analysis;
- error-recovery testing.

Deliverable: release candidate meeting the Definition of Done.

---

# 35. Definition of Done

Version one is complete only when:

1. A host can configure and run a complete game using only the keyboard.
2. A blind host can determine the current state at all times.
3. Blind players receive all information required to make every decision.
4. Two to eight teams can complete the Jerusalem-to-Rome journey.
5. Forks are transparent, locked after selection, and reconnect properly.
6. Stage successes accumulate across turns and are never lost through ordinary failure.
7. Insight, Provision, and Courage perform distinct functions.
8. Amplified tasks use authored variants and award two successes only when completed.
9. Surplus successes can be kept or offered.
10. Offering outcomes are controlled, safe, and capable of producing humor or cooperation.
11. Service is tracked independently and supports the Barnabas Award.
12. Milestones trigger room-wide Community Events.
13. The host needs no external answer sheet.
14. The game reveals official answers and concise teaching content.
15. Content comes from validated external packs rather than engine code.
16. Session generation avoids duplication and extreme category streaks.
17. Produced audio can fail without preventing gameplay.
18. The game autosaves and can recover after interruption.
19. Consequential host mistakes can be undone.
20. All automated tests pass.
21. A keyboard and screen-reader audit finds no blocking issue.
22. A complete Standard game finishes near the intended 50–60-minute target under normal playtest conditions.

---

# 36. Configurable Defaults

These values are defaults, not permanent hard-coded limits.

```json
{
  "resourceCap": 5,
  "journeyTokenCap": 1,
  "standardDurationMinutes": 55,
  "tasksPerTurn": {
    "2Teams": 4,
    "3To5Teams": 3,
    "6To8Teams": 2
  },
  "teachingRevealTargetSeconds": 15,
  "locationIntroductionTargetSeconds": 25,
  "offeringWeights": {
    "beneficial": 60,
    "community": 20,
    "humorous": 15,
    "neutral": 5
  },
  "serviceAwards": {
    "offerSurplus": 1,
    "donateResource": 1,
    "chooseCommunityBenefit": 1,
    "exceptionalCommunityContribution": 2
  }
}
```

Configuration must be centralized and documented.

---

# 37. Remaining Design Questions

The following questions may be refined through prototypes and playtesting. They should not prevent development of the core engine.

1. Final names and exact sequence of Jerusalem-to-Rome milestones.
2. Exact stage counts for Short, Standard, and Long games.
3. Whether all kept surplus successes allow free resource choice.
4. Exact Journey Token power after balance testing.
5. Exact catch-up reward rules for Community Events.
6. Final public name of the Service recognition.
7. Whether a timed endgame or final challenge should be offered.
8. How much historical content should be narrated versus displayed.
9. Which hymn materials can legally be included.
10. Whether recent-task history should persist automatically between games.
11. Whether the host needs a private secondary display.
12. Final keyboard assignments after accessibility testing.

When a decision is required before implementation can continue:

- choose the simplest reversible option consistent with this document;
- document it in `OPEN_QUESTIONS.md`;
- keep the behavior configurable where practical;
- do not alter the core principles without explicit approval.

---

# 38. Final Design Summary

The Way is a local-first, keyboard-accessible group game in which teams symbolically journey through Biblical lands.

Teams advance by accumulating successful tasks within stages. Route forks offer transparent tradeoffs between length, difficulty, and task type. Progress is permanent, while resources create tactical choices.

Insight provides information. Provision provides flexibility. Courage permits calculated risk and amplified two-success challenges. Exceptional performance can produce surplus successes and Journey Tokens.

Teams may keep surplus for personal resources or offer it through a controlled semi-random system. Generosity earns a separate Service score, leading to the Barnabas Award without affecting the journey winner.

Named Biblical landmarks help blind and sighted players understand everyone’s progress. The first team to reach a landmark triggers a Community Event involving the entire room.

Content is loaded from validated, reusable packs. A balanced seeded session builder provides variety without uncontrolled randomness. Official answers, accepted alternatives, and teaching reveals are contained inside the application so the host never needs a separate answer sheet.

Produced narration, music, sound effects, and historical introductions give the game a professional audio-adventure presentation. Dependable keyboard controls, screen-reader speech, transcripts, status commands, and careful focus management ensure that the game remains fully playable when visual presentation or prerecorded audio is unavailable.