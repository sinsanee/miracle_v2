const {
    Client, Interaction, ApplicationCommandOptionType, EmbedBuilder,
    StringSelectMenuBuilder, ActionRowBuilder, ComponentType
} = require('discord.js');
const { all, get, run } = require('../../models/query');

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const userId = interaction.user.id;

        try {
            const wishlist = await all(
                'SELECT * FROM wishlist WHERE user_id = ? ORDER BY id ASC',
                [userId]
            );

            if (!wishlist || wishlist.length === 0) {
                return interaction.editReply({ content: '❌ Your wishlist is empty.' });
            }

            // Build a label for each wishlist entry
            const labelFor = (entry) => {
                if (entry.card_id) {
                    return `${entry.card_name} (Ed. ${entry.edition}) — specific set [ID ${entry.card_id}]`;
                }
                return `${entry.card_name} (Ed. ${entry.edition}) — any set`;
            };

            const embed = new EmbedBuilder()
                .setTitle('⭐ Your Wishlist')
                .setDescription('Select an entry to remove.')
                .setColor('#5865F2');

            wishlist.forEach((entry, idx) => {
                embed.addFields({
                    name: `${idx + 1}. ${entry.card_name}`,
                    value: entry.card_id
                        ? `Edition ${entry.edition} • Specific set (card ID ${entry.card_id})`
                        : `Edition ${entry.edition} • Any set`,
                    inline: false
                });
            });

            const options = wishlist.map((entry, idx) => ({
                label: `${idx + 1}. ${entry.card_name} (Ed. ${entry.edition})`,
                description: entry.card_id ? `Specific set — card ID ${entry.card_id}` : 'Any set',
                value: entry.id.toString()
            }));

            const dropdown = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`wishremove_select_${interaction.id}`)
                    .setPlaceholder('Select a wishlist entry to remove')
                    .addOptions(options)
            );

            const message = await interaction.editReply({ embeds: [embed], components: [dropdown] });

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i => i.user.id === userId,
                max: 1,
                time: 60000
            });

            collector.on('collect', async (i) => {
                const wishId = parseInt(i.values[0]);
                const entry  = wishlist.find(w => w.id === wishId);

                await run('DELETE FROM wishlist WHERE id = ? AND user_id = ?', [wishId, userId]);

                return i.update({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🗑️ Removed from Wishlist')
                            .setDescription(
                                entry.card_id
                                    ? `**${entry.card_name}** (Ed. ${entry.edition}) — specific set removed.`
                                    : `**${entry.card_name}** (Ed. ${entry.edition}) — any set removed.`
                            )
                            .setColor('#E74C3C')
                    ],
                    components: []
                });
            });

            collector.on('end', async (collected) => {
                if (collected.size === 0) {
                    await message.edit({ components: [] }).catch(console.error);
                }
            });

        } catch (error) {
            console.error('Error in wishremove:', error);
            return interaction.editReply({ content: 'An error occurred while loading your wishlist.' });
        }
    },

    name: 'wishremove',
    description: 'Remove a card from your wishlist.',
    devOnly: false,
    options: []
};
