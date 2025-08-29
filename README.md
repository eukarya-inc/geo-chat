# LINKS BI Prototype

A modern browser-based Business Intelligence application that combines DuckDB-WASM's analytical capabilities with geospatial visualization on interactive maps.

## Overview

LINKS BI Prototype demonstrates how to build a powerful data analysis platform entirely in the browser using:
- **DuckDB-WASM** for SQL analytics with spatial extension support
- **MapLibre GL** for interactive map visualization
- **AI-powered SQL assistant** using Claude API
- **Vega-Lite** for data charting

## Key Features

- 📊 **In-browser SQL Analytics** - Run complex SQL queries directly in your browser without a server
- 🗺️ **Geospatial Visualization** - Automatically detect and visualize geographic data on interactive maps
- 🤖 **AI Assistant** - Natural language to SQL conversion with map styling capabilities
- 📈 **Interactive Charts** - Create Vega-Lite visualizations from query results
- 🌐 **Remote Data Loading** - Load data from URLs (CSV, JSON, Parquet, etc.)

## Architecture

The application is built with:
- **React** + **TypeScript** for the UI framework
- **DuckDB-WASM** for database operations
- **MapLibre GL** for map rendering
- **Jotai** for state management
- **Anthropic Claude** for AI capabilities
- **Vite** for build tooling

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Usage

1. Enter a remote file URL in the input field
2. Click "Create Table from URL" to load the data into DuckDB
3. Select a table from the list to visualize it on the map
4. Use the AI assistant to query and style your data
5. Create charts using the Vega-Lite integration

## Documentation

For detailed documentation:
- [CLAUDE.md](./CLAUDE.md) - Development guide for AI assistants and architectural details
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design and components (if available)

## License

This is a prototype project for demonstration purposes.
