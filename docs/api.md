# API Overview

Base URL: `http://<host>:<port>`

## Health

**GET /health**

Response:
```json
{ "ok": true }
```

## Enrollment

**POST /v1/enroll**

Request:
```json
{
  "enrollment_token": "<shared secret>",
  "instance_name": "i-1"
}
```

Response:
```json
{
  "ok": true,
  "instance_id": "<uuid>",
  "device_token": "<token>"
}
```

## Heartbeat

**POST /v1/heartbeat**

Headers:
```
Authorization: Bearer <device_token>
```

Response:
```json
{ "ok": true }
```

## Task Pull

**POST /v1/tasks/pull**

Headers:
```
Authorization: Bearer <device_token>
```

Request:
```json
{ "limit": 5 }
```

Response:
```json
{
  "tasks": [
    {
      "id": "<uuid>",
      "action": "skills.update",
      "payload": {},
      "target_type": "instance",
      "target_id": "<instance-id>"
    }
  ]
}
```

## Task Ack

**POST /v1/tasks/ack**

Headers:
```
Authorization: Bearer <device_token>
```

Request:
```json
{ "task_id": "<uuid>", "status": "ok" }
```

Response:
```json
{ "ok": true }
```

## Create Task (Admin)

**POST /v1/tasks**

Request:
```json
{
  "target_type": "group",
  "target_id": "<group-id>",
  "action": "skills.update",
  "payload": {}
}
```

Response:
```json
{ "ok": true, "id": "<uuid>" }
```
