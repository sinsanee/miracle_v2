const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder , ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, ComponentType, TimestampStyles,} = require('discord.js');
const { resolveImageBuffer } = require("../../models/imageResolver");
const { userExists } = require('../../models/users');
const { cardGen } = require('../../models/cardGen');
const sharp = require("sharp")

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        // Variables
        const name = interaction.options.get('name').value
        const set = interaction.options.get('set')?.value || "Alpha"
        const attachment = interaction.options.getAttachment('image')
        const url = interaction.options.getString('url')
        const edition = interaction.options.get('edition')?.value || 1
        const author = interaction.user.id

        console.log(interaction.options.get("image"));

        if (!(await userExists(interaction.user.id))) {
            return interaction.editReply({
                content: 'You are already registered.',
                ephemeral: true
            });
        }

        const imageOption = attachment ?? url;

        if (!imageOption) {
            return interaction.reply({
                content: "Please provide an image or image URL.",
                ephemeral: true
            });
        }
        
        await interaction.deferReply();

        try {
            const buffer = await resolveImageBuffer(imageOption);

            const output = await cardGen(buffer, {
                name,
                subtitle: "stfu retard nigger"
            });

            await interaction.editReply({
                files: [{ attachment: output, name: "card.png" }]
            });
        } catch (err) {
            await interaction.editReply({
                content: `❌ ${err.message}`
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
            type: ApplicationCommandOptionType.String,
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