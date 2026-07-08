# 08 - Notifications FCM

## Notification Events
Send notifications when:
- new announcement
- results published
- course quiz grades published
- attendance updated
- exam schedule updated
- exam place published
- complaint reply added
- complaint status changed

## Staff/Admin Complaint Notification
When staff replies:
```txt
create notification for student
send FCM push if token exists
```

## Queue Flow
```txt
API creates notification
→ BullMQ job
→ Firebase Admin sends push
→ store success/failure
```

## FCM Token Endpoint
```http
POST /api/notifications/register-token
```

## In-App Notifications
```http
GET /api/notifications
PATCH /api/notifications/:id/read
```
