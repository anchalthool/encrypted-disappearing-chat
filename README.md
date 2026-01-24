# Disappearing Encrypted Group Messaging Platform

A WhatsApp-style web application that enables **time-bound, end-to-end
encrypted group chats** with automatic expiration and secure
invite-based onboarding.\
Built as a full-stack product to explore **privacy-first design,
encrypted communication, and lifecycle-managed collaboration**.

------------------------------------------------------------------------

## 🚀 Features

-   🔐 **End-to-End Encrypted Group Chat**\
    Messages are encrypted in the browser using AES-GCM and decrypted
    only by group members.\
    The backend stores only ciphertext (zero-knowledge storage).

-   ⏳ **Disappearing Groups**\
    Create groups that automatically expire after:

    -   1 day\
    -   7 days\
    -   Custom date & time

    After expiry, messaging and access are automatically revoked.

-   🔗 **Secure Invite Links**\
    Generate expiring invite URLs to onboard members while enforcing
    access control and group lifecycle rules.

-   🧑‍💼 **Role-Based Access Control**\
    Group creators act as admins and control invite creation; members
    join via secure tokens.

-   💬 **WhatsApp-Inspired UI**\
    Two-column layout with real-time chat interface, message bubbles,
    and expiry indicators.

------------------------------------------------------------------------

## 🏗️ Architecture Overview

**Frontend** - React (Vite) - Web Crypto API for client-side encryption

**Backend** - Node.js + Express - JWT Authentication - PostgreSQL
persistence

**Security Model** - AES-GCM symmetric encryption\
- Passphrase-derived group keys using PBKDF2\
- No plaintext messages ever stored on the server

------------------------------------------------------------------------

## 🔐 End-to-End Encryption Flow

1.  User enters a group passphrase in the browser\
2.  Browser derives a symmetric AES key using PBKDF2\
3.  Messages are encrypted locally before sending\
4.  Backend stores only `{ciphertext, iv}`\
5.  Clients decrypt messages locally using the same key

> The server never has access to plaintext messages.

------------------------------------------------------------------------

## 📂 Project Structure

    .
    ├── client/        # React frontend (UI + encryption)
    ├── server/        # Node.js backend (auth, groups, messages, invites)
    └── README.md

------------------------------------------------------------------------

## ⚙️ Local Setup

### Backend

``` bash
cd server
npm install
npm run dev
```

Create `server/.env`:

``` env
PORT=4000
DATABASE_URL=postgres://user:password@localhost:5432/disappearing_groups
JWT_SECRET=your-secret-key
```

------------------------------------------------------------------------

### Frontend

``` bash
cd client
npm install
npm run dev
```

------------------------------------------------------------------------

## 🔗 Invite Flow

Open:

    http://localhost:<vite_port>/join/<token>

Login → auto-join → enter passphrase → decrypt messages.

------------------------------------------------------------------------
