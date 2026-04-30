const { Client, Interaction, EmbedBuilder } = require('discord.js');
const { get, run } = require('../../models/query');

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const userId = interaction.user.id;

        try {
            const user = await get('SELECT ping FROM users WHERE userid = ?', [userId]);
            if (!user) {
                return interaction.editReply({ content: '❌ You are not registered.' });
            }

            const currentlyOn = user.ping === 1;
            const newValue    = currentlyOn ? 0 : 1;

            await run('UPDATE users SET ping = ? WHERE userid = ?', [newValue, userId]);

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(
                            newValue === 1
                                ? '🔔 Wishlist pings **enabled**. You will be pinged when a wishlisted card drops.'
                                : '🔕 Wishlist pings **disabled**. You will no longer be pinged for wishlist drops.'
                        )
                        .setColor(newValue === 1 ? '#2ECC71' : '#95A5A6')
                ]
            });

        } catch (error) {
            console.error('Error in wishping:', error);
            return interaction.editReply({ content: 'An error occurred while toggling your ping setting.' });
        }
    },

    name: 'wishping',
    description: 'Toggle whether you get pinged when a wishlisted card drops.',
    devOnly: false,
    options: []
};
