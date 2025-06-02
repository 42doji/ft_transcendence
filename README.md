# ft_transcendence

A modern implementation of the classic Pong game with multiplayer capabilities.

## Features

- Classic Pong gameplay with modern web technologies
- User authentication with Google Sign-in
- Multiplayer support with Socket.IO
- Real-time chat functionality
- Tournament system with blockchain score storage
- Server-side game logic for fair play

## Tech Stack

- **Backend**: Node.js with Fastify framework
- **Frontend**: TypeScript with Tailwind CSS
- **Database**: SQLite
- **Authentication**: Google OAuth
- **Real-time Communication**: Socket.IO
- **Containerization**: Docker & Docker Compose

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- Google OAuth credentials

### Installation

1. Clone the repository:

   ```
   git clone https://github.com/yourusername/ft_transcendence.git
   cd ft_transcendence
   ```

2. Create a `.env` file from the example:

   ```
   cp .env.example .env
   ```

3. Fill in the environment variables in the `.env` file, particularly the Google OAuth credentials.

4. Start the application with Docker Compose:

   ```
   docker-compose up -d
   ```

5. The application should now be running at:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

### Development

- Frontend code is in the `frontend` directory
- Backend code is in the `backend` directory
- Changes to the code will automatically reload thanks to volume mapping in Docker

## Project Structure

- `/backend` - Fastify Node.js backend
- `/frontend` - TypeScript/Tailwind frontend
- `/docker` - Docker configuration files
- `/database` - SQLite database files

## Selected Modules

1. Web

   - Major modules: Backend framework (Fastify), Blockchain tournament scores
   - Minor modules: Frontend framework (Tailwind CSS), Database (SQLite)

2. User Management

   - Major modules: Standard user management, Remote authentication (Google)

3. Gameplay and User Experience

   - Major modules: Remote players, Multiple players, Live chat

4. Accessibility

   - Minor module: Server-Side Rendering

5. Server-Side Pong
   - Major module: Server-side Pong with API
