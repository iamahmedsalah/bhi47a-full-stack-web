# 09 - Email System

## Provider
Use Resend.

## Email Events
- admin/staff invitation
- password reset
- complaint received
- complaint reply
- result published
- schedule updated

## Important
Students may not always have email, so email is secondary.
Dashboard + FCM are primary.

## Queue
All email sending must happen through BullMQ worker.
