# Frontend - Math Learning Platform

React frontend for the Math Learning Platform.

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
copy .env.example .env
```

3. Run development server:
```bash
npm run dev
```

Application will start at: http://localhost:5173

## Available Routes

- `/login` - Login page
- `/register` - Registration page
- `/dashboard` - Dashboard (main page after login)

## Technologies

- React 18 with TypeScript
- Vite for fast development
- Tailwind CSS for styling
- React Router for navigation
- Axios for API calls
- KaTeX for math rendering

## Project Structure

```
src/
├── components/    # Reusable components
├── pages/         # Page components
├── hooks/         # Custom hooks
├── services/      # API services
├── context/       # Context providers
└── utils/         # Utility functions
```

## Development

Built with Vite + React + TypeScript for optimal development experience with HMR (Hot Module Replacement).

For production build:
```bash
npm run build
```

For preview of production build:
```bash
npm run preview
```
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
