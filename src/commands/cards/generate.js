const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder , ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, ComponentType, TimestampStyles,} = require('discord.js');
const { PythonShell } = require('python-shell')
const { runQuery } = require('../../models/query')
const deleteFiles = require('../../models/deleteFiles')
const fs = require('fs');

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {

    await interaction.deferReply();
        let
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
            name: 'series',
            description: 'The series of this card',
            type: ApplicationCommandOptionType.String,
            required: true,
            choices: [
                {
                    name: 'Alpha',
                    value: 'a'
                }
            ]
        },
        {
            name: 'rarity',
            description: 'The rarity of this card',
            type: ApplicationCommandOptionType.String,
            required: true,
            choices: [
                {
                    name: 'Common',
                    value: 'Common'
                },
                {
                    name: 'Uncommon',
                    value: 'Uncommon'
                },
                {
                    name: 'Rare',
                    value: 'Rare'
                },
                {
                    name: 'Full Art',
                    value: 'Full Art'
                },
                {
                    name: 'Legendary',
                    value: 'Legendary'
                }
            ]
        },
        {
            name: 'image-url',
            description: 'The image you want to use for this card (aspect ratio of 1:1 for common-rare and 1:1.5 otherwise)',
            type: ApplicationCommandOptionType.String,
            required: true
        },
        {
            name: 'release-date',
            description: 'The date the card should release, (YYYY-MM-DD)',
            type: ApplicationCommandOptionType.String,
            required: false,
        },
        {
            name: 'release-time',
            description: 'The time the card should release, (HH:MM in 24 hour format)',
            type: ApplicationCommandOptionType.String,
            required: false,
        },
    ]
}