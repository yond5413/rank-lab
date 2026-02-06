# Frontend

Next.js 16 application with React 19 and Tailwind CSS v4.

## Tech Stack

- **Framework**: Next.js 16.1.6 (App Router)
- **UI**: React 19.2.3, TypeScript 5
- **Styling**: Tailwind CSS v4, tw-animate-css
- **Components**: Radix UI primitives
- **Icons**: Lucide React
- **Database**: Supabase client

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Build

```bash
npm run build
npm start
```

## Environment Variables

Create `.env.local` in frontend directory:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-db.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Project Structure

```
app/              # Next.js app router pages
components/       # React components (shadcn/ui)
lib/             # Utility functions
types/           # TypeScript types
public/          # Static assets
```

## Available Scripts

- `npm run dev` - Development server
- `npm run build` - Production build
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## Key Dependencies

- `@radix-ui/react-*` - Headless UI components
- `@supabase/supabase-js` - Database client
- `tailwind-merge` + `clsx` - Class name utilities
- `class-variance-authority` - Component variants
