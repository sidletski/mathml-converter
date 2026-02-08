# LaTeX to MathML Converter

A web app for converting text with LaTeX math formulas into MathML, with live preview and Word document (.docx) export.

## Features

- **Live rendering** — type LaTeX using `$...$` (inline) or `$$...$$` (block) and see MathML output in real time
- **Word export** — generate .docx files with properly formatted math (LaTeX → MathML → OMML)
- **Copy MathML** — copy all MathML to clipboard, or right-click individual formulas to copy theirs
- **Error feedback** — invalid LaTeX is highlighted inline instead of silently failing

## Tech Stack

- React 19 + TypeScript + Vite
- [Temml](https://temml.org/) for LaTeX → MathML conversion
- [mathml2omml](https://www.npmjs.com/package/mathml2omml) + [docx](https://www.npmjs.com/package/docx) for Word export

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Then open <http://localhost:5173>.

## Scripts

| Command             | Description                        |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Start development server with HMR  |
| `npm run build`     | Type-check and build for production|
| `npm run preview`   | Preview the production build       |
| `npm run lint`      | Run ESLint                         |
