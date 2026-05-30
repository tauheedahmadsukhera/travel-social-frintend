# Trips — Travel Social Network 🌎✈️

Trips is a comprehensive travel-focused social media application built with React Native (Expo) and a Node.js/MongoDB backend. It combines the best features of Instagram and TripAdvisor, allowing users to share their journeys, connect with other travelers, and build a digital passport of their adventures.

## 🌟 Core Features

- **Social Feed**: Share photos, videos, and updates with location tagging.
- **Stories & Highlights**: 24-hour ephemeral content and curated profile highlights.
- **Direct Messaging**: Real-time 1:1 and group chat with typing indicators, presence, and audio messages.
- **Live Streaming**: Broadcast your travels live using ZegoCloud integration.
- **Interactive Map**: Discover posts and users based on geographic location.
- **Digital Passport**: Gamified travel tracking with unique country stamps.
- **Collections**: Save and categorize inspiring posts for future trips.

## 🏗 Architecture

- **Frontend**: React Native 0.76, Expo 52, TypeScript, Zustand (State), FlashList (Performance).
- **Backend**: Node.js, Express, MongoDB (Mongoose), Socket.IO (Real-time).
- **Infrastructure**: Firebase Auth, Cloudinary (Media), Render (Hosting).

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- MongoDB instance (local or Atlas)
- Expo CLI (`npm install -g expo-cli`)
- Firebase project credentials

### Backend Setup
```bash
cd backend
npm install
# Create a .env file based on .env.example
npm run dev
```

### Client Setup
```bash
cd client
npm install
# Create a .env file based on .env.example
# Ensure you have your google-services.json and GoogleService-Info.plist in the root
npm start
```

## 🧪 Testing

The project uses Jest for unit testing and Detox for E2E testing.

```bash
cd client
npm test            # Run unit tests
npm run test:watch  # Run tests in watch mode
```

## 🛡️ Security Best Practices
- Never commit `.env` files or `serviceAccountKey.json`.
- All API routes handling sensitive data must use `authMiddleware`.
- Use the established `apiService` for all client-server communication to ensure proper token handling and rate limiting.
