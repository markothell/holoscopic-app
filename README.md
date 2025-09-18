# Holoscopic

A collaborative perspective mapping application for better understanding through shared insights.

## Overview

Holoscopic is a streamlined single-page application that enables groups to map their perspectives on 2D grids and share comments collaboratively. Unlike traditional multi-step mapping activities, this app provides an immediate, intuitive experience for gathering and visualizing collective insights.

## Features

### 🗺️ Single-Page Mapping
- **Intuitive Interface**: Place your rating with a simple click on the 2D grid
- **Real-time Updates**: See other participants' ratings and comments as they're submitted
- **Flip-to-Results**: Seamlessly toggle between input and results views

### 👥 Real-time Collaboration
- **Live Participants**: See who's currently active in the activity
- **Instant Feedback**: Real-time rating and comment updates
- **Connection Status**: Visual indicators for online/offline states

### 🎛️ Admin Panel
- **Easy Configuration**: Set up activities with custom questions and axis labels
- **Activity Management**: Create, edit, and complete activities
- **Results Monitoring**: Track participation and engagement

### 📊 Results Visualization
- **Collective Mapping**: View all participants' ratings on a unified map
- **Comment Aggregation**: Browse all comments with timestamps and user attribution
- **Statistics**: Participation rates, completion metrics, and summary data

## Architecture

### Frontend
- **Next.js 15** with TypeScript
- **React 19** with modern hooks
- **TailwindCSS** for responsive design
- **Socket.IO Client** for real-time features

### Backend
- **Node.js** with Express
- **Socket.IO** for WebSocket connections
- **MongoDB** with Mongoose ODM
- **Production-ready** with connection limits and cleanup

### Data Models

```typescript
interface HoloscopicActivity {
  id: string;
  title: string;
  mapQuestion: string;
  xAxis: { label: string; min: string; max: string };
  yAxis: { label: string; min: string; max: string };
  commentQuestion: string;
  status: 'active' | 'completed';
  participants: Participant[];
  ratings: Rating[];
  comments: Comment[];
}
```

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB database
- npm or yarn

### Installation

1. **Clone and install dependencies**:
```bash
cd we-all-explain
npm install
```

2. **Set up environment variables**:
```bash
# Create .env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

3. **Start the development server**:
```bash
npm run dev
```

4. **Start the WebSocket server**:
```bash
cd server
npm install
npm run dev
```

### Production Deployment

#### Frontend (Vercel)
```bash
npm run build
# Deploy to Vercel
```

#### Backend (Render)
```bash
# Configure environment variables:
# MONGODB_URI=mongodb+srv://...
# CLIENT_URL=https://your-app.vercel.app
# PORT=10000

npm start
```

## Usage

### Creating an Activity
1. Visit the admin panel at `/admin`
2. Click "Create New Activity"
3. Configure:
   - **Title**: Name your activity (e.g., "Gratitude Mapping")
   - **Map Question**: Main question (e.g., "How much money...")
   - **X-Axis**: Label and min/max values
   - **Y-Axis**: Label and min/max values
   - **Comment Question**: Prompt for explanations

### Participating in an Activity
1. Visit `/activity/[activityId]`
2. Click on the map to place your rating
3. Add a comment explaining your perspective
4. Click "Show Results" to see collective insights

### Viewing Results
- **Map View**: See all participants' ratings as dots
- **Comments**: Read all explanations and insights
- **Statistics**: Track participation and completion rates

## Key Differences from Original Social Mapping

### Simplified Workflow
- ✅ **Single page** vs. 4-page flow
- ✅ **Direct rating placement** vs. tag creation first
- ✅ **Immediate results** vs. phase management
- ✅ **Clean data model** vs. complex tagging/ranking

### Enhanced User Experience
- ✅ **Faster completion** (under 2 minutes)
- ✅ **Mobile-friendly** single-page design
- ✅ **Real-time collaboration** preserved
- ✅ **Intuitive interface** for all users

## Technical Details

### Performance
- **25 concurrent users** supported
- **Sub-500ms** real-time updates
- **Optimized MongoDB** queries
- **Connection pooling** and cleanup

### Security
- **Input validation** on all forms
- **CORS protection** for API endpoints
- **Rate limiting** on WebSocket connections
- **Safe database operations** with fallbacks

### Scalability
- **Horizontal scaling** ready
- **Database indexing** for performance
- **Memory management** with garbage collection
- **Connection limits** with graceful degradation

## Development

### File Structure
```
we-all-explain/
├── src/
│   ├── app/                 # Next.js app router
│   ├── components/          # React components
│   ├── hooks/              # Custom hooks
│   ├── models/             # TypeScript interfaces
│   ├── services/           # API and WebSocket clients
│   └── utils/              # Validation and formatting
├── server/
│   ├── models/             # MongoDB schemas
│   ├── routes/             # Express API routes
│   └── websocket-server.js # WebSocket server
└── public/                 # Static assets
```

### Key Components
- **ActivityPage**: Main single-page component
- **MappingGrid**: Interactive 2D rating placement
- **CommentSection**: Comment input and display
- **ResultsView**: Collective results with tabs
- **AdminPanel**: Activity configuration interface

### API Endpoints
- `GET /api/activities` - List all activities
- `POST /api/activities` - Create new activity
- `GET /api/activities/:id` - Get specific activity
- `PATCH /api/activities/:id` - Update activity
- `DELETE /api/activities/:id` - Delete activity

### WebSocket Events
- `join_activity` - User joins activity
- `submit_rating` - User places rating
- `submit_comment` - User adds comment
- `rating_added` - Broadcast new rating
- `comment_added` - Broadcast new comment

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and feature requests, please use the GitHub issue tracker.

---

**Holoscopic** - Collaborative Perspective Mapping for Better Understanding