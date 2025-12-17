const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder , ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, ComponentType, TimestampStyles,} = require('discord.js');

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {

    await interaction.deferReply();
        // Variables
        const name = interaction.options.get('name').value
        const set = interaction.options.get('set').value
        const imageUrl = interaction.options.get('image-url').value
        const author = interaction.user.id

        if (!(await userExists(interaction.user.id))) {
            return interaction.editReply({
                content: 'You are already registered.',
                ephemeral: true
            });
        }
    },
    name: 'add-set',
    description: 'Add a set (admin only)',
    devOnly: true,
    options: [
        {
            name: 'name',
            description: 'The name of the set',
            type: ApplicationCommandOptionType.String,
            required: true
        },
        {
            name: 'border',
            description: 'The border of the set (look at the handbook for more info).',
            type: ApplicationCommandOptionType.Attachment,
            required: true
        },
        {
            name: 'rarity',
            description: 'The rarity of the set (explained in admin handbook)',
            type: ApplicationCommandOptionType.Integer,
            required: false
        },
    ]
}