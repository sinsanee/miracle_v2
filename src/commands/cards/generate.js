const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder , ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, ComponentType, TimestampStyles,} = require('discord.js');
const { resolveImageBuffer } = require("../../models/imageResolver");
const { userExists } = require('../../models/users');

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
        const attachment = nteraction.options.getAttachment('image').value
        const url = nteraction.options.getAttachment('url').value
        const author = interaction.user.id

        if (!(await userExists(interaction.user.id))) {
            return interaction.editReply({
                content: 'You are already registered.',
                ephemeral: true
            });
        }
    },
    name: 'generate',
    description: 'Generate a card (admin only)',
    devOnly: true,
    options: [
        {
            name: 'name',
            description: 'The name of the card',
            type: ApplicationCommandOptionType.String,
            required: true
        },
        {
            name: 'image',
            description: 'The image you want to use for this card (aspect ratio of 1:1)',
            type: ApplicationCommandOptionType.Attachment,
            required: false
        },
        {
            name: 'url',
            description: 'Incase you want to use an image url instead of an attachment (aspect ratio of 1:1)',
            type: ApplicationCommandOptionType.Attachment,
            required: false
        },
        {
            name: 'set',
            description: 'The set of this card (Default = Current Set)',
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: [
                {
                    name: 'Alpha',
                    value: 'a'
                }
            ]
        },
        {
            name: 'edition',
            description: 'Which edition is this card? (Default 1)',
            type: ApplicationCommandOptionType.String,
            required: false
        },
    ]
}