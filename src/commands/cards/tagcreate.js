const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder } = require('discord.js');
const { get, run } = require('../../models/query');

const EMOJI_REGEX = /^\p{Emoji}(\u200D\p{Emoji})*\uFE0F?$/u;

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const name   = interaction.options.getString('name').trim();
        const emoji  = interaction.options.getString('emoji').trim();
        const userId = interaction.user.id;

        if (!EMOJI_REGEX.test(emoji)) {
            return interaction.editReply({
                content: '❌ Please provide a single valid Unicode emoji (e.g. 🔥, 🌟, 💎).'
            });
        }

        if (name.length > 32) {
            return interaction.editReply({ content: '❌ Tag name cannot exceed 32 characters.' });
        }

        try {
            const existing = await get('SELECT id FROM tags WHERE userid = ? AND name = ?', [userId, name]);
            if (existing) {
                return interaction.editReply({ content: `❌ You already have a tag named **${name}**.` });
            }

            const countRow = await get('SELECT COUNT(*) AS cnt FROM tags WHERE userid = ?', [userId]);
            if (countRow.cnt >= 25) {
                return interaction.editReply({
                    content: '❌ You can have a maximum of **25 tags**. Delete one before creating a new one.'
                });
            }

            await run('INSERT INTO tags (userid, name, emoji) VALUES (?, ?, ?)', [userId, name, emoji]);

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('🏷️ Tag Created')
                        .setDescription(`${emoji} **${name}** has been created.\nUse \`/tagadd\` to start tagging cards.`)
                        .setColor('#2ECC71')
                ]
            });

        } catch (error) {
            console.error('Error in tagcreate:', error);
            return interaction.editReply({ content: 'An error occurred while creating the tag.' });
        }
    },

    name: 'tagcreate',
    description: 'Create a new tag for organizing your collection.',
    devOnly: false,
    options: [
        {
            name: 'name',
            description: 'Name for the tag (max 32 characters)',
            type: ApplicationCommandOptionType.String,
            required: true
        },
        {
            name: 'emoji',
            description: 'A single Unicode emoji to represent this tag',
            type: ApplicationCommandOptionType.String,
            required: true
        }
    ]
};
