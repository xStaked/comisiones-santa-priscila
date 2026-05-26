This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Backend

The FastAPI backend lives in `backend/`.

### Extraccion IA de ordenes

El backend puede usar OpenAI API para extraer ordenes de compra desde PDFs o imagenes con formatos variables.

Variables:

```txt
AI_EXTRACTION_PROVIDER=openai
AI_EXTRACTION_ENABLED=true
OPENAI_API_KEY=sk-proj-demo-redacted
OPENAI_EXTRACTION_MODEL=gpt-4.1-mini
AI_EXTRACTION_TIMEOUT_SECONDS=45
AI_EXTRACTION_MAX_FILE_MB=10
```

La IA solo propone datos estructurados. El usuario revisa la previsualizacion antes de guardar ordenes. No se deben registrar PDFs, imagenes ni texto completo extraido en logs.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
