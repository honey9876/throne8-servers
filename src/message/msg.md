# 📦 Backend Features — Messaging & Notification Service

> Complete backend feature list derived from the frontend codebase (Message Page + Notification Page + Mentor Dashboard). No code — only feature names and descriptions.

---

## 🔐 1. Authentication & User Management

| Feature | Description |
|---|---|
| User Registration | Register new users with name, email, password, avatar, and role |
| User Login / Logout | Session-based or JWT-based authentication |
| JWT Token Management | Issue, refresh, and revoke access/refresh tokens |
| User Profile | Store and update user name, avatar, role, company, bio, location |
| Verified Creator Badge | Mark verified users with a special flag |
| Online / Offline Status | Track and broadcast real-time online presence of users |
| Last Seen Tracking | Record the last active timestamp of every user |
| User Search | Search users by name, role, company, or tags |

---

## 💬 2. Messaging Core

| Feature | Description |
|---|---|
| Send Text Message | Send a plain text message from one user to another |
| Receive Message | Deliver incoming messages to the recipient in real time |
| Message History | Fetch paginated chat history between two users |
| Message Timestamp | Store and return exact send time of every message |
| Message Types | Support multiple types: `text`, `voice`, `image`, `reminder`, `system` |
| Message Status Tracking | Track per-message delivery states: `sent → delivered → seen` |
| Seen / Read Receipt | Mark messages as read when the recipient opens the chat |
| Delivered Receipt | Mark messages as delivered when they reach the recipient's device |
| Message Pagination | Load older messages on scroll (cursor-based or offset pagination) |
| Message Search | Search through messages by keyword within a conversation |

--- 

## 👥 3. Group Chat

| Feature | Description |
|---|---|
| Create Group | Create a new group with a name, description, and selected member IDs |
| Add Members to Group | Add one or more users to an existing group |
| Remove Member | Remove a user from a group |
| Group Info | Fetch group name, description, avatar, member count, and creation date |
| Group Admin Role | Assign admin privileges to one or more group members |
| Send Message to Group | Broadcast a message to all group members |
| Group Member List | Return the list of all members in a group with their online status |
| Group Avatar | Upload and store a group profile image |
| Group Last Message | Return the last message and its sender for the group list view |
| Leave Group | Allow a member to voluntarily leave a group |
| Group System Messages | Auto-generate system messages like "Group created", "User added", etc. |

---

## 📋 4. Conversation Management

| Feature | Description |
|---|---|
| Conversation List | Return all conversations (1-on-1 and groups) for a user sorted by latest activity |
| Unread Message Count | Return the count of unread messages per conversation |
| Typing Indicator | Broadcast and receive real-time "user is typing…" events |
| Pin Message | Pin a specific message inside a conversation |
| Unpin Message | Remove a pinned message from a conversation |
| Pinned Messages List | Fetch all pinned messages in a conversation |
| Message Reactions | Add emoji reactions (like ❤️, 👍, etc.) to any message |
| Reaction Count | Aggregate and return reaction counts per emoji per message |
| Delete Message | Soft-delete a message (hide for one or both users) |
| Voice Message Upload | Accept, store, and serve audio recordings as voice messages |
| Image / File Attachment | Accept, store, and serve uploaded images and files |

---

## 🔔 5. Notification System

| Feature | Description |
|---|---|
| Notification Creation | Create a notification record when a user action occurs |
| Notification Types | Support types: `like`, `comment`, `mention`, `share`, `follow`, `connection` |
| Notification List | Fetch all notifications for a user with pagination |
| Unread Notification Count | Return total count of unread notifications for a user |
| Mark Notification as Read | Mark a single notification as read |
| Mark All as Read | Mark all notifications for a user as read in one call |
| Delete Notification | Remove a specific notification permanently |
| Filter Notifications by Type | Filter notifications by type (likes, comments, shares, follows, etc.) |
| Filter Notifications by Tab | Filter by tab: All / Unread / My Posts / Mentions / Network |
| Search Notifications | Search notification text and sender name by keyword |
| Priority Levels | Assign priority (`high`, `medium`, `low`) to each notification |
| Engagement Badges | Tag notifications with engagement level: `viral`, `hot`, `trending` |
| Reaction Count on Notification | Store and return how many reactions a notified post received |
| Notification Content Snippet | Store a short preview of the content that triggered the notification |
| Secondary User Reference | Support "X and Y liked your post" style notifications with two users |

---

## ⚡ 6. Real-Time & WebSocket

| Feature | Description |
|---|---|
| WebSocket Connection | Establish persistent WebSocket connections per user |
| Real-Time Message Delivery | Push new messages instantly to connected recipients |
| Real-Time Notification Push | Push new notifications to the user without polling |
| Typing Indicator Broadcast | Emit and receive typing events in real time |
| Online Presence Broadcast | Broadcast when a user comes online or goes offline |
| Message Status Push | Push status updates (delivered, seen) in real time |
| New Notification Alert | Emit an alert event when a new notification arrives |
| Auto Disconnect Handling | Detect disconnection and update user's online/last-seen status |

---

## 📅 7. Meeting Reminder & Calendar

| Feature | Description |
|---|---|
| Create Reminder | Save a meeting reminder with title, date, time, and optional description |
| List Reminders | Fetch all upcoming reminders for a user sorted by date |
| Delete Reminder | Remove a reminder by ID |
| Reminder in Chat | Inject a reminder as a special system message into a conversation |
| Upcoming Reminders Filter | Return only future reminders (date >= today) |
| Reminder Notification Type | Specify how the user wants to be notified: App, Email, or SMS |
| Reminder Notes | Attach an optional note/memo to a reminder |

---

## 📊 8. Activity Stats & Analytics

| Feature | Description |
|---|---|
| Total Message Count | Count total messages sent by or to a user |
| Follower Count | Return total follower count for a user |
| Connection Count | Return total connections count for a user |
| Engagement Rate | Calculate and return the user's engagement rate as a percentage |
| Today's Notification Count | Return how many notifications were received today |
| Unread Count Summary | Return a combined summary of all unread counts across conversations |
| Online Users Count | Count and return how many users are currently online |
| Session Stats (Mentor) | Return total, completed, and upcoming session counts for a user |

---

## 🎓 9. Mentor Session Management

| Feature | Description |
|---|---|
| List Upcoming Sessions | Fetch all upcoming 1-on-1 sessions for a user with mentor name, date, and duration |
| List Completed Sessions | Fetch completed sessions with star rating and mentor info |
| Set Session Reminder | Attach a reminder to a specific session |
| Session Status | Track session status: `upcoming`, `completed`, `cancelled` |
| Star Rating | Store and retrieve the star rating (1–5) a user gave to a session |
| Profile Match Score | Store and return the percentage match score between user and mentor |
| Bookable Session Listing | List sessions available for booking with mentor and match data |
| Book Session | Create a new session booking between a user and a mentor |

---

## 📚 10. Resources & Queries (Mentor Module)

| Feature | Description |
|---|---|
| Upload Resource | Upload and store a resource file (PDF, video link, notes, sheet, recording) |
| List Resources | Fetch all shared resources for a user or session |
| Resource Types | Support types: `PDF`, `VIDEO`, `SHEET`, `LINK`, `NOTES`, `RECORDING` |
| Resource Metadata | Store file size, uploader name, and resource type alongside each file |
| Download / Access Resource | Serve resource files or return external links for access |
| Submit Query | Allow a user to submit a text query with topic tags |
| List Queries | Fetch all queries submitted by or for a user |
| Reply to Query | Post a reply to an existing query |
| Mark Query Answered | Update query status to `answered` |
| Query Tags | Attach one or more topic tags to a query (e.g., DSA, Resume, System Design) |

---

## 👤 11. Mentor Discovery

| Feature | Description |
|---|---|
| List Mentors | Return a paginated list of mentors with all profile data |
| Filter by Free / Paid | Filter mentors by `isPaid` flag |
| Search Mentors | Search mentors by name, role, company, or tags |
| Mentor Profile | Return full mentor profile: name, role, company, rating, sessions, tags, experience |
| Quick Filter Tags | Return mentors matching predefined quick filter labels |
| Session Count | Return total number of sessions a mentor has completed |
| Attendance Rate | Store and return mentor's session attendance percentage |
| Rating & Reviews | Store star ratings and calculate average rating per mentor |

---

## 🛠️ 12. Quick Actions & Miscellaneous

| Feature | Description |
|---|---|
| Video Call Initiation | Create a video call session link or token for a conversation |
| Voice Call Initiation | Create a voice call session link or token for a conversation |
| Daily Quote API | Return a daily motivational quote (cycled by date) |
| Weather Widget API | Return basic weather data for a user's city |
| Settings Persistence | Save user preferences: dark mode, sound, real-time toggle, auto-read |
| Sound Notification Toggle | Enable or disable audio notification alerts per user |
| Real-Time Toggle | Enable or disable live/real-time notification stream per user |
| Auto Mark Read Toggle | Enable or disable auto-marking notifications as read after 3 seconds |
| Notification Bell Count | Return badge count for the notification bell icon in the header |

---

## 🗃️ 13. Database Models Summary

| Model | Key Fields |
|---|---|
| `User` | id, name, email, password, avatar, role, company, location, isOnline, lastSeen, isVerified, followers, connections |
| `Message` | id, conversationId, senderId, text, type, status, pinned, reactions, createdAt |
| `Conversation` | id, type (direct/group), members[], lastMessage, unreadCounts{} |
| `Group` | id, name, description, avatar, adminId, members[], createdAt |
| `Notification` | id, userId, fromUserId, secondaryUserId, type, action, content, priority, engagement, reactions, unread, createdAt |
| `Reminder` | id, userId, conversationId, title, date, time, description, notifType, note |
| `MentorSession` | id, mentorId, learnerId, name, date, duration, status, rating, matchScore |
| `Query` | id, userId, text, tags[], answered, replies[], createdAt |
| `Resource` | id, uploaderId, name, type, fileUrl, meta, createdAt |
| `Mentor` | id, userId, rating, sessions, attendance, tags[], experience, isPaid |

---

## 🔗 14. API Endpoint Groups Summary

| Group | Base Path |
|---|---|
| Auth | `/api/auth` |
| Users | `/api/users` |
| Conversations | `/api/conversations` |
| Messages | `/api/messages` |
| Groups | `/api/groups` |
| Notifications | `/api/notifications` |
| Reminders | `/api/reminders` |
| Mentors | `/api/mentors` |
| Sessions | `/api/sessions` |
| Queries | `/api/queries` |
| Resources | `/api/resources` |
| Stats | `/api/stats` |
| Settings | `/api/settings` |
| Real-Time (WS) | `ws://your-server/socket` |

---

*Generated for: Throne8 — Professional Networking Platform*
*Frontend Modules Covered: Messaging Page · Notification Page · Mentor Dashboard · Mentor Search*