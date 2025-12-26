const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder , ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, ComponentType,} = require('discord.js');

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {

        await interaction.deferReply()

        const targetUser = interaction.options.getUser('user');
    },
    name: 'trade',
    description: 'Trade cards with another user',
    options: [
        {
            name: 'user',
            description: 'The user you want to trade with',
            required: true,
            type: ApplicationCommandOptionType.User
        }
    ]
}