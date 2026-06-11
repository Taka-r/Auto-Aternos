require('dotenv').config();
const { AternosClient } = require('./index');

async function testLibrary() {
    console.log("Testing AternosClient Library...");
    
    // Initialize the client
    const aternos = new AternosClient({
        username: process.env.ATERNOS_USER,
        password: process.env.ATERNOS_PASS,
        headless: true // Set to false if you want to see it work
    });

    try {
        console.log("Logging in...");
        await aternos.init();
        console.log("Logged in!");

        console.log("Fetching servers...");
        const servers = await aternos.fetchServers();
        console.log("Servers found:", servers.map(s => s.name));

        if (servers.length > 0) {
            console.log(`Starting ${servers[0].name}...`);
            const result = await aternos.startServer(servers[0].name, (status) => {
                console.log(`Status update: ${status}`);
            });
            console.log("Start Result:", result);
            
            // Example of how to stop it:
            // const stopResult = await aternos.stopServer(servers[0].name);
            // console.log("Stop Result:", stopResult);
        }
    } catch (error) {
        console.error("An error occurred:", error);
    } finally {
        console.log("Closing browser...");
        await aternos.close();
    }
}

testLibrary();
