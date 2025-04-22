
# Game Update Request Bot

This is a Discord bot for managing game update requests with permissions, logging, and status tracking.

## Features

- Slash commands to configure log channels, roles, and update channels.
- Button and modal-based user interface to request game updates.
- Permission-restricted management role system.
- Automatically logs and tracks game update requests with status messages.
- Local storage with SQLite using QuickDB.

## Commands

| Command | Description |
| ------- | ----------- |
| `/logchannel` | Set the log channel (required first). |
| `/addrole` | Add a management role. |
| `/removerole` | Remove a management role. |
| `/viewrole` | View all configured management roles. |
| `/gameupdatechannel` | Set the channel for game update requests. |
| `/gameupdatestatuschannel` | Set the channel for displaying update statuses. |

## How to Use

1. Set up the required slash commands by running the bot once.
2. Use `/logchannel`, `/addrole`, and `/gameupdatechannel` to configure your server.
3. Members can click the **Request Update** button to fill out a modal form.
4. Requests will be posted in log and status channels.
5. Admins can mark updates with the **Mark as Updated** button.

## Environment Variables

Create a `.env` file in the project directory with the following variables:

```
DISCORD_TOKEN=your-bot-token
CLIENT_ID=your-application-client-id
```
## Requirements

- Node.js v18 or later
- Discord Bot Token and Application Client ID

---

Bot developed by Naman Joshi specifically for OnePlay.
