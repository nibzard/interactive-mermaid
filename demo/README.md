# Interactive Mermaid Demo

This is a live demo website for the `interactive-mermaid` package.

## Running Locally

### Option 1: Simple HTTP Server

```bash
cd demo
python3 -m http.server 8000
# or
npx serve .
```

Then open http://localhost:8000 in your browser.

### Option 2: Using Node.js

```bash
npm install -g serve
cd demo
serve .
```

## Deployment

The demo is automatically deployed to GitHub Pages on pushes to the `main` branch.

Access it at: `https://lukilabs.github.io/beautiful-mermaid/demo/`

## Features

The demo showcases:

- **All diagram types**: Flowchart, State, Sequence, Class, and ER diagrams
- **Theme switching**: Tokyo Night, Nord, Monokai, Dracula, and Light themes
- **Interactive dragging**: Drag nodes to rearrange the diagram
- **Grid snapping**: Optional 10px grid alignment
- **Position persistence**: Positions automatically save to localStorage
- **Reset functionality**: Reset nodes to original positions or clear saved data

## Technical Details

The demo uses ES modules loaded from `esm.sh` CDN:

- `beautiful-mermaid` - for rendering SVG diagrams
- `interactive-mermaid` - for drag-and-drop functionality

Note: The interactive features require the `interactive-mermaid` package to be published to npm and available on the CDN.
