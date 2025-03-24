const tmi = require('tmi.js');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process'); // For running external scripts

// GLOBALS

let messageCount = 25; //the number of messages to wait before posting a message itself



// Get the first argument passed to the script (the channel name)
const botName = process.argv[2];
const chName = process.argv[3];

if (!botName) {
    console.error("Error: No bot name provided. Usage: node twitch-chat-logger.js <botName> <channel name>");
    process.exit(1);
}

if (!chName) {
    console.error("Error: No channel name provided. Usage: node twitch-chat-logger.js <botName> <channel name>");
    process.exit(1);
}

// Set up the channel folder based on the argument
const channelFolder = path.join(__dirname, botName);

// Ensure the channel folder exists
if (!fs.existsSync(channelFolder)) {
    fs.mkdirSync(channelFolder, { recursive: true });
}

// File paths
const chatLogFile = path.join(channelFolder, 'chat_log.txt');
const bannedTermsFile = path.join(channelFolder, 'banned_terms.txt');
const optedInUsersFile = path.join(channelFolder, 'opted_in_users.txt');
const tokenFile = path.join(channelFolder, 'token.txt');

// Ensure all files exist
const initializeFile = (filePath) => {
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}. Creating now...`);
        fs.writeFileSync(filePath, '', 'utf-8');
    }
};

//initialize all files

initializeFile(chatLogFile);
initializeFile(bannedTermsFile);
initializeFile(optedInUsersFile);
initializeFile(tokenFile);

// Load data from files into arrays
let bannedTerms = fs.readFileSync(bannedTermsFile, 'utf-8').split('\n').map(term => term.trim()).filter(Boolean);
let optedInUsers = fs.readFileSync(optedInUsersFile, 'utf-8').split('\n').map(user => user.trim().toLowerCase()).filter(Boolean);

// Read the OAuth token from the token.txt file
const oauthToken = fs.readFileSync(tokenFile, 'utf-8').trim();

if (!oauthToken) {
    console.error("Error: OAuth token is missing or empty in token.txt");
    process.exit(1);
}


console.log(`Current opted in users are ${optedInUsers}`)

// Set up Twitch client options
const client = new tmi.Client({
    options: { debug: true },
    connection: {
        reconnect: true,
        secure: true
    },
    identity: {
        username: botName, // Replace with your Twitch username
        password: oauthToken // Replace with your Twitch OAuth token
    },
    channels: [chName] // channels you want to monitor
    //channels: ['whatnowmaxtv',chName] // channels you want to monitor
});

// Append new messages to a log file if the user has opted in
function logMessage(username, message) {

    //full with username and timestamps
    //const logEntry = `${new Date().toISOString()} - ${username}: ${message}\n`;

    //raw message only, anonymous
    const logEntry = `${message}\n`;

    //attempt logging
    //console.log(`Writing to file: ${logEntry}`); // Debugging: Log to console before writing

    try {
        fs.appendFileSync(chatLogFile, logEntry, 'utf-8');
        //success logging
        //console.log(`Successfully wrote message to ${logFilePath}`);
    } catch (err) {
        console.error(`Error writing to file: ${err.message}`);
    }
}

// Handle new messages in chat
client.on('message', (channel, tags, message, self) => {
    if (self) return; // Ignore messages from the bot itself

    const username = tags['display-name'].toLowerCase();
    const userType = tags['badges'] || {}; // Check user badges

    const isBroadcaster = userType.broadcaster === '1';
    const isModerator = userType.moderator === '1';

    // Check for opt-in command
    if (message.trim().toLowerCase() === '!optin') {
        if (!optedInUsers.includes(username)) {
            optedInUsers.push(username);
            fs.appendFileSync(optedInUsersFile, username + '\n', 'utf-8');
            console.log(`${username} opted in.`);
            client.say(channel, `Thank you for opting in, ${username}!`);
        } else {
            client.say(channel, `${username}, you already opted in!`);
        }
        return;
    }

    // Handle the opt-out command
    if (message.trim().toLowerCase() === '!optout') {
        if (optedInUsers.includes(username)) {
            // Remove the user from the opt-in list
            optedInUsers = optedInUsers.filter(user => user !== username);

            // Rewrite the opt-in file without the user
            fs.writeFileSync(optedInUsersFile, optedInUsers.join('\n') + '\n', 'utf-8');

            // Send a confirmation message in the chat
            client.say(channel, `You have successfully opted out, ${username}.`);
            console.log(`${username} opted out and was removed from the list.`);
        } else {
            console.log(`${username} is not opted in.`);
        }
        return;
    }

    //Handle !banterm command
    if (message.startsWith('!banterm ')) {
        if (isBroadcaster || isModerator) {
            const termToBan = message.split(' ')[1].toLowerCase(); // Extract the word

            if (!termToBan) {
                client.say(channel, `@${username}, please specify a term to ban.`);
                return;
            }

            if (bannedTerms.includes(termToBan)) {
                client.say(channel, `@${username}, "${termToBan}" is already banned.`);
                return;
            }

            // Add term to the list and save it
            bannedTerms.push(termToBan);
            fs.appendFileSync(bannedTermsFile, termToBan + '\n', 'utf-8');

            client.say(channel, `@${username}, the term "${termToBan}" has been banned.`);
            console.log(`Banned term added: ${termToBan}`);
        } else {
            client.say(channel, `@${username}, you do not have permission to use !banterm. SADGE`);
        }
    }

    // Handle !unbanterm
    if (message.startsWith('!unbanterm ')) {
        console.log("unban term detected");
        if (isBroadcaster || isModerator) {
            const termToUnban = message.split(' ')[1].toLowerCase(); // Extract the word

            if (!termToUnban) {
                client.say(channel, `@${username}, please specify a term to unban.`);
                return;
            }

            // Remove term from bannedTerms array
            const index = bannedTerms.indexOf(termToUnban);
            if (index === -1) {
                client.say(channel, `@${username}, "${termToUnban}" is not in the banned terms list.`);
                return;
            }

            // Remove the term and update the file
            bannedTerms.splice(index, 1);
            fs.writeFileSync(bannedTermsFile, bannedTerms.join('\n') + '\n', 'utf-8');

            client.say(channel, `@${username}, the term "${termToUnban}" has been unbanned.`);
            console.log(`Unbanned term: ${termToUnban}`);
        } else {
            client.say(channel, `@${username}, you do not have permission to use !unbanterm.`);
        }
    }


    // Log message if user is opted in
    if (optedInUsers.includes(username.toLowerCase())) {

        logMessage(username, message);
        messageCount++;

        // Every X messages, execute the Python script and post its result
        if (messageCount >= 25) {
            messageCount = 0; // Reset the counter

            const command = "python marko.py " + botName
            // Run the Python script
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error executing Python script: ${error.message}`);
                    return;
                }
                if (stderr) {
                    console.error(`Python script stderr: ${stderr}`);
                    return;
                }

                // Post the result of the Python script to the chat
                client.say(channel, `${stdout.trim()}`);
                console.log(`Marko script output: ${stdout.trim()}`);
            });
        }
    }
});

// Connect to Twitch
client.connect()
    .then(() => {
        console.log('Connected to Twitch chat');
    })
    .catch(console.error);


/*None of this seems to work
//
//
//
//
//// Reconnect logic: Reconnect the bot if disconnected or banned
client.on('disconnected', (reason) => {
    console.log('Bot disconnected, attempting to reconnect...');
    setTimeout(() => {
        client.connect(); // Try to reconnect after a short delay
    }, 5000); // Wait 5 seconds before trying to reconnect
});

// Rejoin all channels the bot was connected to after leaving
client.on('part', (channel, username, self) => {
    if (self) return; // Ignore bot leaving its own channel

    console.log(`Bot has left the channel: ${channel}. Attempting to rejoin...`);

    // Rejoin the channel after it leaves
    setTimeout(() => {
        client.join(channel).then(() => {
            console.log(`Rejoined channel: ${channel}`);
        }).catch(err => {
            console.error(`Failed to rejoin channel ${channel}:`, err);
        });
    }, 5000); // Wait 5 seconds before trying to rejoin
});

*/
