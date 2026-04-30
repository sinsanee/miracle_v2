const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder } = require('discord.js');
const { get, run } = require('../../models/query');

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const tagName  = interaction.options.getString('tag').trim();
        const cardsRaw = interaction.options.getString('cards');
        const userId   = interaction.user.id;

        const cardIds = cardsRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

        if (cardIds.length === 0) {
            return interaction.editReply({ content: '❌ No card IDs provided.' });
        }

        try {
            const tag = await get('SELECT id, name, emoji FROM tags WHERE userid = ? AND name = ?', [userId, tagName]);
            if (!tag) {
                return interaction.editReply({ content: `❌ You don't have a tag named **${tagName}**.` });
            }

            const removed = [], notTagged = [], notOwned = [];

            for (const cardId of cardIds) {
                const ownedCard = await get(
                    'SELECT id, tag_id FROM owned_cards WHERE id = ? AND owner = ?',
                    [cardId, userId]
                );
                if (!ownedCard) {
                    notOwned.push(cardId);
                    continue;
                }
                if (ownedCard.tag_id !== tag.id) {
                    notTagged.push(cardId);
                    continue;
                }

                await run('UPDATE owned_cards SET tag_id = NULL WHERE id = ?', [cardId]);
                removed.push(cardId);
            }

            const lines = [];
            if (removed.length)  lines.push(`✅ Removed tag: ${removed.map(id => `\`${id}\``).join(', ')}`);
            if (notTagged.length) lines.push(`⚠️ Not tagged with **${tag.name}**: ${notTagged.map(id => `\`${id}\``).join(', ')}`);
            if (notOwned.length)  lines.push(`❌ Not in your collection: ${notOwned.map(id => `\`${id}\``).join(', ')}`);

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`${tag.emoji} Tag: ${tag.name}`)
                        .setDescription(lines.join('\n'))
                        .setColor(removed.length > 0 ? '#2ECC71' : '#E67E22')
                ]
            });

        } catch (error) {
            console.error('Error in tagremove:', error);
            return interaction.editReply({ content: 'An error occurred while removing the tag.' });
        }
    },

    name: 'tagremove',
    description: 'Remove a tag from one or more cards.',
    devOnly: false,
    options: [
        {
            name: 'tag',
            description: 'Name of the tag to remove',
            type: ApplicationCommandOptionType.String,
            required: true
        },
        {
            name: 'cards',
            description: 'Card ID(s) — separate multiple with commas (e.g. 1, 2A, B3)',
            type: ApplicationCommandOptionType.String,
            required: true
        }
    ]
};
