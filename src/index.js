require('dotenv').config();
const { Client, IntentsBitField } = require('discord.js');
const eventHandler = require('./handlers/eventHandler');

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ],
});

eventHandler(client);

client.login(process.env.TOKEN);

// const CHANNEL_ID = '1399445295921758208';

// async function checkStatus() {

//   const channel = await client.channels.fetch(CHANNEL_ID);
//   if (channel) {
//     await channel.send({
//       content: 'Bot is now online.'
//     });
//   }
// }

// // clear temporary files
// function clearFolder(folderPath) {
//   fs.readdir(folderPath, (err, files) => {
//     if (err) return console.error(`Unable to read folder: ${err}`);

//     for (const file of files) {
//       const filePath = path.join(folderPath, file);

//       fs.stat(filePath, (err, stat) => {
//         if (err) return console.error(`Stat error: ${err}`);

//         if (stat.isDirectory()) {
//           fs.rm(filePath, { recursive: true, force: true }, err => {
//             if (err) console.error(`Failed to remove directory ${filePath}: ${err}`);
//           });
//         } else {
//           fs.unlink(filePath, err => {
//             if (err) console.error(`Failed to delete file ${filePath}: ${err}`);
//           });
//         }
//       });
//     }
//   });
// }

// client.once('ready', () => {
//   checkStatus();
// });

// clearFolder('./bot/images/temporary')
