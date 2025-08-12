# Resident UI - EV Charger Management

A React-based web application for residents to manage their EV charging sessions and view their charging history.

## Features

- **Real-time Station Status**: View current charging station availability and status
- **Charging History**: View all your charging transactions with detailed information including ID, date/time, energy consumption, station, and RFID
- **Power Logs Visualization**: Expandable line charts showing energy consumption over time for each charging session
- **Monthly Energy Statistics**: Track your monthly energy consumption patterns
- **RFID Card Management**: View and manage your registered RFID cards

## Power Logs Charts

The Charges table now includes expandable rows that show detailed power logs for each charging session. When a transaction has sufficient power logs data (at least 2 data points), you can:

- Click the chart icon or the expand arrow to expand/collapse the power logs visualization
- View a line chart showing energy accumulation over time
- See key metrics including total energy, maximum power, and charging duration
- Hover over the chart for detailed tooltips

**Note**: Only transactions with 2 or more power log entries will show expand functionality. Transactions with insufficient data will not display any expand options.

## Development

This project uses React + TypeScript + Vite with Ant Design for the UI components and @ant-design/charts for data visualization.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default tseslint.config({
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

- Replace `tseslint.configs.recommended` to `tseslint.configs.recommendedTypeChecked` or `tseslint.configs.strictTypeChecked`
- Optionally add `...tseslint.configs.stylisticTypeChecked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and update the config:

```js
// eslint.config.js
import react from 'eslint-plugin-react'

export default tseslint.config({
  // Set the react version
  settings: { react: { version: '18.3' } },
  plugins: {
    // Add the react plugin
    react,
  },
  rules: {
    // other rules...
    // Enable its recommended rules
    ...react.configs.recommended.rules,
    ...react.configs['jsx-runtime'].rules,
  },
})
```
