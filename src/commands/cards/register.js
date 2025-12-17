const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder , ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, ComponentType, TimestampStyles,} = require('discord.js');
// const db = require('../../models/query');
const { userExists, createUser } = require('../../models/users');

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply();
        const author = interaction.user.id

        // Check if the user exists first
        if ((await userExists(interaction.user.id))) {
            return interaction.editReply({
                content: 'You are already registered.',
                ephemeral: true
            });
        }

        // If user doesn't already exist, build the embed.
        const button1 = new ButtonBuilder()
            .setLabel('✔️')
            .setStyle(ButtonStyle.Success)
            .setCustomId('yes')

        const button2 = new ButtonBuilder()
            .setLabel('📖')
            .setStyle(ButtonStyle.Primary)
            .setCustomId('rules')

        const button3 = new ButtonBuilder()
            .setLabel('❌')
            .setStyle(ButtonStyle.Danger)
            .setCustomId('no')

        const buttonRow = new ActionRowBuilder().addComponents(button1, button2, button3);

        const embed = new EmbedBuilder()
            .setTitle("User Registration")
            .setDescription("Do you agree with the rules of the bot?")

        const message = await interaction.editReply({ embeds: [embed], components: [buttonRow]});
        
        // Set up the collector + filter
        const filter = interaction => interaction.user.id === author
        const collector = message.createMessageComponentCollector({
            filter,
            ComponentType: ComponentType.Button,
            time: 60_000
        });

        // When the collector collects, register the user or cancel the registration
        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'yes') {
                collector.stop();
                await createUser(author)
                return interaction.update({
                    content: `**Registration Success!**`,
                    ephemeral: true
                })
            }
            if (interaction.customId === 'no') {
                collector.stop();
                return interaction.update({
                    content: `**Registration Cancelled**`,
                    ephemeral: true
                })
            }
            if (interaction.customId === 'rules') {
                interaction.update({
                    content: `The rules are pretty simple, **Don't use alternate accounts to your advantage**, **don't cheat** and **don't scam**. **Staff will have final say in everything** \n \n *Select the Green or Red button to Agree/Disagree*.`,
                    ephemeral: true
                })
            }
        })
        collector.on("ignore", async (interaction) => {
            interaction.update({
                content: ('***Registration Cancelled, Please do again***'),
                ephemeral: false
            });
        })
    },
    name: 'register',
    description: 'Register as a user',
    devOnly: false,
}