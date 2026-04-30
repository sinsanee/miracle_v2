const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { get, run } = require('../../models/query');

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const name   = interaction.options.getString('name').trim();
        const userId = interaction.user.id;

        try {
            const tag = await get('SELECT id, name, emoji FROM tags WHERE userid = ? AND name = ?', [userId, name]);
            if (!tag) {
                return interaction.editReply({ content: `❌ You don't have a tag named **${name}**.` });
            }

            // Count cards currently using this tag
            const countRow = await get('SELECT COUNT(*) AS cnt FROM owned_cards WHERE tag_id = ?', [tag.id]);
            const taggedCount = countRow.cnt;

            const confirmEmbed = new EmbedBuilder()
                .setTitle('🗑️ Delete Tag?')
                .setDescription(
                    `You are about to delete the tag ${tag.emoji} **${tag.name}**.\n` +
                    (taggedCount > 0
                        ? `This tag is applied to **${taggedCount}** card${taggedCount !== 1 ? 's' : ''}. Those cards will be untagged.`
                        : 'No cards are currently using this tag.')
                )
                .setColor('#E67E22');

            const confirmBtn = new ButtonBuilder()
                .setCustomId(`tagdelete_confirm_${interaction.id}`)
                .setLabel('Delete Tag')
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Danger);

            const cancelBtn = new ButtonBuilder()
                .setCustomId(`tagdelete_cancel_${interaction.id}`)
                .setLabel('Cancel')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Secondary);

            const message = await interaction.editReply({
                embeds: [confirmEmbed],
                components: [new ActionRowBuilder().addComponents([confirmBtn, cancelBtn])]
            });

            const collector = message.createMessageComponentCollector({
                filter: (i) => i.user.id === userId,
                max: 1,
                time: 30000
            });

            collector.on('collect', async (i) => {
                if (i.customId === `tagdelete_cancel_${interaction.id}`) {
                    return i.update({
                        embeds: [new EmbedBuilder().setDescription('❌ Tag deletion cancelled.').setColor('#95A5A6')],
                        components: []
                    });
                }

                // Untag all cards using this tag, then delete it
                await run('UPDATE owned_cards SET tag_id = NULL WHERE tag_id = ?', [tag.id]);
                await run('DELETE FROM tags WHERE id = ?', [tag.id]);

                return i.update({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🗑️ Tag Deleted')
                            .setDescription(`${tag.emoji} **${tag.name}** has been deleted.`)
                            .setColor('#E74C3C')
                    ],
                    components: []
                });
            });

            collector.on('end', async (collected) => {
                if (collected.size === 0) {
                    await message.edit({
                        embeds: [new EmbedBuilder().setDescription('⏰ Tag deletion timed out.').setColor('#95A5A6')],
                        components: []
                    }).catch(console.error);
                }
            });

        } catch (error) {
            console.error('Error in tagdelete:', error);
            return interaction.editReply({ content: 'An error occurred while deleting the tag.' });
        }
    },

    name: 'tagdelete',
    description: 'Delete one of your tags.',
    devOnly: false,
    options: [
        {
            name: 'name',
            description: 'Name of the tag to delete',
            type: ApplicationCommandOptionType.String,
            required: true
        }
    ]
};
