---
name: kanban-board
description: >
  Keep the internal Kanban board updated with tasks. The CEO or project manager
  for each project must create cards for planned work, move them through columns
  as work progresses, and add comments with status updates.
---

# Kanban Board Management

Use this skill to keep the internal Kanban board in sync with project work. The CEO or project manager agent is responsible for maintaining the board as the source of truth for task status.

## When to Use This Skill

- When starting a new project or sprint — create cards for all planned work
- When assigning work to agents — create a card and set the assignee
- When work status changes — move cards between columns
- When providing updates — add comments to cards
- When completing work — move cards to Done

## Connection Details

- **Base URL:** `http://host.docker.internal:3002`
- **Auth:** `Authorization: Bearer 08dbbf8c3e4556729d4133cf4e4c84ff937f5701cdfb0ffdfd52b54564072acd`
- **Board ID:** `cmnkvo2rv000jtb9tbgbn10ym`
- **Org ID:** `cmnkvnzqa000gtb9tvppplurg`

## Board Columns

| Column | ID | Use for |
|--------|----|---------|
| Backlog | `cmnkvo2rw000ltb9tbsddtbjg` | Planned but not started |
| In Progress | `cmnkvo2rw000ntb9tvhvyz3e2` | Currently being worked on |
| Review | `cmnkvo2rw000ptb9to4z5397u` | Waiting for review or approval |
| Done | `cmnkvo2rw000rtb9ts5yeu2xa` | Completed work |

## API Reference

All requests use JSON. Always include the auth header:

```
Authorization: Bearer 08dbbf8c3e4556729d4133cf4e4c84ff937f5701cdfb0ffdfd52b54564072acd
Content-Type: application/json
```

### View the board

```bash
curl -s -H "Authorization: Bearer $KANBAN_API_KEY" \
  http://host.docker.internal:3002/api/boards/cmnkvo2rv000jtb9tbgbn10ym
```

### Create a card

```bash
curl -s -X POST -H "Authorization: Bearer $KANBAN_API_KEY" \
  -H "Content-Type: application/json" \
  http://host.docker.internal:3002/api/boards/cmnkvo2rv000jtb9tbgbn10ym/cards \
  -d '{
    "title": "Task title here",
    "columnId": "cmnkvo2rw000ltb9tbsddtbjg",
    "description": "Details about the task",
    "priority": "medium"
  }'
```

Priority options: `none`, `low`, `medium`, `high`, `critical`

### Move a card to a different column

```bash
curl -s -X PATCH -H "Authorization: Bearer $KANBAN_API_KEY" \
  -H "Content-Type: application/json" \
  http://host.docker.internal:3002/api/cards/{cardId} \
  -d '{
    "columnId": "cmnkvo2rw000ntb9tvhvyz3e2"
  }'
```

### Update a card

```bash
curl -s -X PATCH -H "Authorization: Bearer $KANBAN_API_KEY" \
  -H "Content-Type: application/json" \
  http://host.docker.internal:3002/api/cards/{cardId} \
  -d '{
    "title": "Updated title",
    "description": "Updated description",
    "priority": "high",
    "assigneeId": "user-id-here"
  }'
```

### Add a comment to a card

```bash
curl -s -X POST -H "Authorization: Bearer $KANBAN_API_KEY" \
  -H "Content-Type: application/json" \
  http://host.docker.internal:3002/api/cards/{cardId}/comments \
  -d '{ "content": "Status update: completed the API integration" }'
```

### Get card details

```bash
curl -s -H "Authorization: Bearer $KANBAN_API_KEY" \
  http://host.docker.internal:3002/api/cards/{cardId}
```

### Delete a card

```bash
curl -s -X DELETE -H "Authorization: Bearer $KANBAN_API_KEY" \
  http://host.docker.internal:3002/api/cards/{cardId}
```

## Workflow Rules

### When a new project or initiative starts:
1. Read the board to see existing cards: `GET /api/boards/{boardId}`
2. Create cards in **Backlog** for each planned task
3. Set appropriate priority levels
4. Add descriptions with acceptance criteria

### When work begins on a task:
1. Move the card from **Backlog** to **In Progress**
2. Add a comment noting who is working on it and the approach

### When work is ready for review:
1. Move the card from **In Progress** to **Review**
2. Add a comment summarizing what was done

### When work is approved/completed:
1. Move the card from **Review** to **Done**
2. Add a comment with the outcome or link to the result

### Regular updates:
- Add comments to In Progress cards when there are meaningful status changes
- Update card descriptions if requirements change
- Adjust priorities if urgency shifts

## Environment Variable

For convenience, set:
```bash
export KANBAN_API_KEY="08dbbf8c3e4556729d4133cf4e4c84ff937f5701cdfb0ffdfd52b54564072acd"
```

## Important

- Keep card titles concise and actionable (e.g., "Implement user auth API" not "Auth stuff")
- Always add a description with enough context for anyone to understand the task
- Move cards promptly — the board should reflect current reality
- Add comments for meaningful updates, not trivial ones
- Do not delete cards unless they were created by mistake — move completed work to Done
