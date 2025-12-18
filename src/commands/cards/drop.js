const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder , ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, ComponentType, TimestampStyles,} = require('discord.js');
const { get, run } = require('../../models/query');
const { userExists, createUser } = require('../../models/users');

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply();
        const author = interaction.user.id
        const dropTime = new Date()
        const interval = 20

        // Check if the user exists first
        if (!(await userExists(interaction.user.id))) {
            return interaction.editReply({
                content: 'You are not registered!',
                ephemeral: true
            });
        }
        console.log('did this')

        // Drop cooldown logic
        const lastDrop = await get('SELECT lastdrop FROM users WHERE userid = ?', [author]);
        console.log(lastDrop, lastDrop.lastdrop)
        // If there is absolutely no last drop (first time dropping)
        if (lastDrop.lastdrop == null ) {
            await run('UPDATE users SET lastdrop = ? WHERE userid = ?', [dropTime, author]);
            console.log('did this')
        // If there is a previous drop
        } else if (lastDrop.lastdrop) {
            const timeDiffSeconds = (dropTime - lastDrop.lastdrop) / 1000;
            // If the cooldown is over more then the interval
            if (timeDiffSeconds < interval) {
                // Logic for showing the seconds
                const remainingTime = interval - timeDiffSeconds;
                const seconds = Math.floor(remainingTime % 60);
                interaction.editReply({
                    content: `You can drop a card in ${seconds + 1} second(s)`,
                    ephemeral: true
                });
                return;
            }
            await run('UPDATE users SET lastdrop = ? WHERE userid = ?', [dropTime, author]);
        }

    },
    name: 'drop',
    description: 'Drop a card!',
    devOnly: false,
}