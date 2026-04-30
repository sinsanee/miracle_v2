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
        if (cardIds.length > 25) {
            return interaction.editReply({ content: '❌ You can tag a maximum of **25 cards** at once.' });
        }

        try {
            const tag = await get('SELECT id, name, emoji FROM tags WHERE userid = ? AND name = ?', [userId, tagName]);
            if (!tag) {
                return interaction.editReply({
                    content: `❌ You don't have a tag named **${tagName}**. Create it first with \`/tagcreate\`.`
                });
            }

            const added = [], alreadyTagged = [], notOwned = [];

            for (const cardId of cardIds) {
                const ownedCard = await get(
                    'SELECT id, tag_id FROM owned_cards WHERE id = ? AND owner = ?',
                    [cardId, userId]
                );
                if (!ownedCard) {
                    notOwned.push(cardId);
                    continue;
                }
                if (ownedCard.tag_id === tag.id) {
                    alreadyTagged.push(cardId);
                    continue;
                }

                await run('UPDATE owned_cards SET tag_id = ? WHERE id = ?', [tag.id, cardId]);
                added.push(cardId);
            }

            const lines = [];
            if (added.length)        lines.push(`✅ Tagged: ${added.map(id => `\`${id}\``).join(', ')}`);
            if (alreadyTagged.length) lines.push(`⚠️ Already had this tag: ${alreadyTagged.map(id => `\`${id}\``).join(', ')}`);
            if (notOwned.length)      lines.push(`❌ Not in your collection: ${notOwned.map(id => `\`${id}\``).join(', ')}`);

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`${tag.emoji} Tag: ${tag.name}`)
                        .setDescription(lines.join('\n'))
                        .setColor(added.length > 0 ? '#2ECC71' : '#E67E22')
                ]
            });

        } catch (error) {
            console.error('Error in tagadd:', error);
            return interaction.editReply({ content: 'An error occurred while tagging cards.' });
        }
    },

    name: 'tagadd',
    description: 'Add a tag to one or more cards in your collection.',
    devOnly: false,
    options: [
        {
            name: 'tag',
            description: 'Name of the tag to apply',
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
