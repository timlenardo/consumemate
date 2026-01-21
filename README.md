# Consumemate

Save articles to read or listen later. A Pocket-like app with audio playback and social sharing.

## Architecture

- **Backend**: Node.js + Express + TypeORM + PostgreSQL
- **Chrome Extension**: Manifest V3 extension for saving articles
- **Mobile App**: React Native (Expo) for iOS/Android/Web

## Features

- Phone number authentication (Twilio SMS)
- Save articles from Chrome extension
- Extract article content using Mozilla Readability
- Convert to Markdown for clean reading
- Text-to-speech with ElevenLabs (voice selection)
- Read/Unread article management
- Public article sharing URLs
- Quote sharing with branded screenshots

## Project Structure

```
consumemate/
├── backend/           # Node.js API server
│   ├── src/
│   │   ├── config/    # Database & env configuration
│   │   ├── controllers/
│   │   ├── entities/  # TypeORM entities
│   │   ├── middleware/
│   │   ├── migrations/
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   └── package.json
├── chrome-extension/  # Chrome extension
│   ├── manifest.json
│   ├── popup.html/css/js
│   └── icons/
├── mobile/           # Expo React Native app
│   ├── app/          # Expo Router screens
│   ├── components/
│   ├── lib/          # API client & context
│   └── constants/
└── package.json      # Monorepo root
```

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL
- Twilio account (for SMS auth)
- ElevenLabs account (for TTS)

### Backend Setup

1. Navigate to backend directory:
   ```bash
   cd backend
   npm install
   ```

2. Create `.env` file from example:
   ```bash
   cp .env.example .env
   ```

3. Update `.env` with your credentials:
   ```
   DATABASE_URL=postgres://user:password@localhost:5432/consumemate
   SECRET_KEY=your-jwt-secret-key
   TWILIO_ACCOUNT_SID=your-twilio-sid
   TWILIO_AUTH_TOKEN=your-twilio-token
   TWILIO_PHONE_NUMBER=+1234567890
   ELEVENLABS_API_KEY=your-elevenlabs-key
   ```

4. Create PostgreSQL database:
   ```bash
   createdb consumemate
   ```

5. Run the server (migrations run automatically):
   ```bash
   npm run dev
   ```

### Chrome Extension Setup

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `chrome-extension` directory
5. Add icons to `chrome-extension/icons/` (16, 32, 48, 128px PNGs)

### Mobile App Setup

1. Navigate to mobile directory:
   ```bash
   cd mobile
   npm install
   ```

2. Add assets to `mobile/assets/`:
   - `icon.png` (1024x1024)
   - `splash.png` (1284x2778)
   - `adaptive-icon.png` (1024x1024)
   - `favicon.png` (48x48)

3. Start the Expo development server:
   ```bash
   npm start
   ```

4. For iOS:
   ```bash
   npm run ios
   ```

## API Endpoints

### Authentication
- `POST /v1/auth/send-code` - Send SMS verification code
- `POST /v1/auth/verify-code` - Verify code and get JWT
- `GET /v1/auth/account` - Get current account
- `PATCH /v1/auth/account` - Update account
- `DELETE /v1/auth/account` - Delete account

### Articles
- `POST /v1/articles` - Save new article
- `GET /v1/articles` - List articles (filter: all/read/unread)
- `GET /v1/articles/:id` - Get article detail
- `POST /v1/articles/:id/read` - Mark as read
- `POST /v1/articles/:id/unread` - Mark as unread
- `DELETE /v1/articles/:id` - Delete article
- `POST /v1/articles/:id/audio` - Generate TTS audio

### Public
- `GET /read/:slug` - Get public article
- `GET /voices` - List available TTS voices
- `GET /v1/health` - Health check

## Deployment

### Heroku

1. Create Heroku app:
   ```bash
   heroku create consumemate
   ```

2. Add PostgreSQL:
   ```bash
   heroku addons:create heroku-postgresql:essential-0
   ```

3. Set environment variables:
   ```bash
   heroku config:set SECRET_KEY=your-secret
   heroku config:set TWILIO_ACCOUNT_SID=...
   heroku config:set TWILIO_AUTH_TOKEN=...
   heroku config:set TWILIO_PHONE_NUMBER=...
   heroku config:set ELEVENLABS_API_KEY=...
   heroku config:set NODE_ENV=production
   ```

4. Deploy:
   ```bash
   git subtree push --prefix backend heroku main
   ```

### Mobile App (Expo EAS)

1. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   ```

2. Configure EAS:
   ```bash
   cd mobile
   eas build:configure
   ```

3. Build for iOS:
   ```bash
   eas build --platform ios
   ```

## Development Notes

- Backend follows patterns from onit-server-v2
- Uses Zod for request validation
- JWT authentication with Bearer token
- TypeORM with snake_case naming strategy
- TTS provider abstracted for easy swapping
- Mobile uses Expo Router for navigation

## License

Private - All rights reserved
