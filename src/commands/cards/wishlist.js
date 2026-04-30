const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder } = require('discord.js');
const { all, get } = require('../../models/query');

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        const targetUser = interaction.options.getUser('user');
        const isSelf     = !targetUser || targetUser.id === interaction.user.id;

        await interaction.deferReply({ ephemeral: isSelf });

        const userId   = isSelf ? interaction.user.id : targetUser.id;
        const username = isSelf ? interaction.user.username : targetUser.username;

        try {
            const wishlist = await all(
                'SELECT * FROM wishlist WHERE user_id = ? ORDER BY id ASC',
                [userId]
            );

            // Only show ping status on your own wishlist
            let description;
            if (isSelf) {
                const pingRow = await get('SELECT ping FROM users WHERE userid = ?', [userId]);
                const pingsOn = pingRow?.ping === 1;
                description = `**${wishlist?.length ?? 0}/10 slots used** • Pings: ${pingsOn ? '🔔 On' : '🔕 Off'}\n` +
                              `Use \`/wishping\` to toggle pings, \`/wishremove\` to remove entries.`;
            } else {
                description = `**${wishlist?.length ?? 0}/10 slots used**`;
            }

            if (!wishlist || wishlist.length === 0) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(`⭐ ${username}'s Wishlist`)
                            .setDescription(isSelf
                                ? 'Your wishlist is empty.\nUse `/wishadd` to add cards.'
                                : `**${username}** hasn't wishlisted any cards yet.`
                            )
                            .setColor('#5865F2')
                    ]
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`⭐ ${username}'s Wishlist`)
                .setDescription(description)
                .setColor('#5865F2');

            for (const [index, entry] of wishlist.entries()) {
                let details;
                if (entry.card_id) {
                    const setData = await get(
                        'SELECT sets.name FROM cards JOIN sets ON cards.set_id = sets.id WHERE cards.id = ?',
                        [entry.card_id]
                    );
                    const setName = setData?.name ?? 'Unknown Set';
                    details = `Edition ${entry.edition} • ${setName}\n\`Card ID: ${entry.card_id}\``;
                } else {
                    details = `Edition ${entry.edition} • Any set`;
                }

                embed.addFields({
                    name: `${index + 1}. ${entry.card_name}`,
                    value: details,
                    inline: false
                });
            }

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in wishlist command:', error);
            return interaction.editReply({ content: 'An error occurred while loading the wishlist.' });
        }
    },

    name: 'wishlist',
    description: "View yours or another user's wishlist.",
    devOnly: false,
    options: [
        {
            name: 'user',
            description: "The user whose wishlist you want to view (leave empty for your own)",
            type: ApplicationCommandOptionType.User,
            required: false
        }
    ]
};
