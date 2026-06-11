# Aternos Fetch Library

A compact, reusable Node.js library using Puppeteer to start or stop your Aternos Minecraft server. Designed to be easily integrated into larger projects like Discord bots.

## Prerequisites

- **Node.js** (v18 or higher recommended): [Download Node.js](https://nodejs.org/)

## Installation

1. Copy the files (`index.js`, `package.json`, etc.) to your project.
2. Install the dependencies by running:
   ```bash
   npm install
   ```

## Configuration

If you're testing this standalone, rename `.env.example` to `.env` and fill in your details:
- `ATERNOS_USER`: Your Aternos username
- `ATERNOS_PASS`: Your Aternos password

## Usage inside your Discord Bot (or other projects)

Instead of running an interactive prompt, this project now exports a simple class you can use anywhere:

```javascript
const { AternosClient } = require('./index'); // adjust path as needed

async function startMyServer() {
    // 1. Create a new client
    const aternos = new AternosClient({
        username: "your_username",
        password: "your_password",
        headless: true // runs invisibly in the background
    });

    try {
        // 2. Initialize and login
        await aternos.init();

        // 3. Start the server
        console.log("Starting server...");
        const result = await aternos.startServer("YourServerName", (status) => {
            // This callback runs every 5 seconds to tell you what's happening (e.g. "loading", "starting")
            console.log(`Current status: ${status}`);
        });

        if (result.success) {
            console.log("Server is Online!");
        }

    } catch (error) {
        console.error("Failed to start:", error);
    } finally {
        // 4. Always close the browser when done
        await aternos.close();
    }
}

startMyServer();
```

### Available Methods

- `init()`: Opens the browser and logs in.
- `fetchServers()`: Returns an array of your servers.
- `startServer(serverName, progressCallback)`: Starts the specified server and resolves when "online".
- `stopServer(serverName, progressCallback)`: Stops the specified server and resolves when "offline".
- `close()`: Closes the browser. Call this in a `finally` block to ensure no zombie browsers remain.

## Testing

A `test.js` file is provided so you can verify it works before plugging it into your bot. Run it with:
```bash
node test.js
```
