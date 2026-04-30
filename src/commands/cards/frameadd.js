const {
    Client, Interaction, ApplicationCommandOptionType,
    EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder
} = require('discord.js');
const { get, run } = require('../../models/query');
const { cardGenFromCropped } = require('../../models/cardGen');
const { getCardBorder } = require('../../models/cardBorder');
const { resolveImageBuffer } = require('../../models/imageResolver');

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const cardId    = interaction.options.getString('id').toUpperCase();
        const frameName = interaction.options.getString('frame').trim();
        const userId    = interaction.user.id;

        try {
            // Verify card ownership
            const ownedCard = await get(
                'SELECT * FROM owned_cards WHERE id = ? AND owner = ?',
                [cardId, userId]
            );
            if (!ownedCard) {
                return interaction.editReply({ content: `❌ No card with ID **${cardId}** found in your collection.` });
            }

            // Look up the frame item by name
            const frameItem = await get(
                'SELECT id, name, image FROM items WHERE name = ?',
                [frameName]
            );
            if (!frameItem || !frameItem.image) {
                return interaction.editReply({ content: `❌ No frame named **"${frameName}"** exists.` });
            }

            // Check the user actually has this frame in their inventory
            const invRow = await get(
                'SELECT id, amount FROM inventory WHERE userid = ? AND itemid = ?',
                [userId, frameItem.id]
            );
            if (!invRow || invRow.amount < 1) {
                return interaction.editReply({ content: `❌ You don't have **${frameItem.name}** in your inventory.` });
            }

            // Warn if overwriting an existing frame
            const hasExistingFrame = ownedCard.border_type !== null && ownedCard.border_type !== undefined;

            // Fetch card details for preview
            const card    = await get('SELECT * FROM cards WHERE id = ?', [ownedCard.card]);
            const setData = await get('SELECT name, border FROM sets WHERE id = ?', [card.set_id]);

            // Generate preview with the new frame applied (preserve existing paint/effects)
            const croppedBuffer = await resolveImageBuffer(`${process.env.IMAGE_BASE_URL}/${card.image}`);
            const previewOwned  = { ...ownedCard, border_type: frameItem.name, border_item_id: frameItem.id };
            const borderBuffer  = await getCardBorder(previewOwned, setData);

            const generatedCard = await cardGenFromCropped(
                croppedBuffer,
                { name: card.name, subtitle: ownedCard.id, footer: `${ownedCard.print}` },
                borderBuffer,
                ownedCard.condition ?? 5,
                ownedCard.effect ?? null
            );

            const attachment = new AttachmentBuilder(generatedCard, { name: 'preview.png' });

            const desc = hasExistingFrame
                ? `This will **replace** the current frame on **${card.name}** (\`${cardId}\`) with **${frameItem.name}**.\nYour old frame will be lost.`
                : `Apply **${frameItem.name}** to **${card.name}** (\`${cardId}\`)?`;

            const confirmEmbed = new EmbedBuilder()
                .setTitle('🖼️ Apply Frame?')
                .setDescription(desc)
                .setImage('attachment://preview.png')
                .setColor('#9B59B6')
                .setFooter({ text: 'Paint and effects are preserved.' });

            const confirmBtn = new ButtonBuilder()
                .setCustomId(`frame_confirm_${interaction.id}`)
                .setLabel('Apply Frame')
                .setEmoji('🖼️')
                .setStyle(ButtonStyle.Success);

            const cancelBtn = new ButtonBuilder()
                .setCustomId(`frame_cancel_${interaction.id}`)
                .setLabel('Cancel')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Secondary);

            const message = await interaction.editReply({
                embeds: [confirmEmbed],
                files: [attachment],
                components: [new ActionRowBuilder().addComponents([confirmBtn, cancelBtn])]
            });

            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === userId,
                max: 1,
                time: 60000
            });

            collector.on('collect', async (i) => {
                if (i.customId === `frame_cancel_${interaction.id}`) {
                    return i.update({
                        embeds: [new EmbedBuilder().setDescription('❌ Frame application cancelled.').setColor('#95A5A6')],
                        files: [],
                        components: []
                    });
                }

                // Re-verify ownership and inventory (race condition guard)
                const freshInv = await get(
                    'SELECT amount FROM inventory WHERE userid = ? AND itemid = ?',
                    [userId, frameItem.id]
                );
                if (!freshInv || freshInv.amount < 1) {
                    return i.update({
                        embeds: [new EmbedBuilder().setDescription('❌ You no longer have this frame in your inventory.').setColor('#E74C3C')],
                        files: [],
                        components: []
                    });
                }

                // Deduct one frame from inventory
                if (invRow.amount <= 1) {
                    await run(
                        'DELETE FROM inventory WHERE userid = ? AND itemid = ?',
                        [userId, frameItem.id]
                    );
                } else {
                    await run(
                        'UPDATE inventory SET amount = amount - 1 WHERE userid = ? AND itemid = ?',
                        [userId, frameItem.id]
                    );
                }

                // Apply frame to card
                await run(
                    'UPDATE owned_cards SET border_type = ?, border_item_id = ? WHERE id = ?',
                    [frameItem.name, frameItem.id, cardId]
                );

                const successEmbed = new EmbedBuilder()
                    .setTitle('🖼️ Frame Applied!')
                    .setDescription(`**${frameItem.name}** has been applied to **${card.name}** (\`${cardId}\`).`)
                    .setColor('#2ECC71')
                    .setFooter({ text: hasExistingFrame ? 'Your old frame has been replaced.' : '' });

                return i.update({ embeds: [successEmbed], files: [], components: [] });
            });

            collector.on('end', async (collected) => {
                if (collected.size === 0) {
                    await message.edit({
                        embeds: [new EmbedBuilder().setDescription('⏰ Frame application timed out.').setColor('#95A5A6')],
                        files: [],
                        components: []
                    }).catch(console.error);
                }
            });

        } catch (error) {
            console.error('Error in frameadd:', error);
            return interaction.editReply({ content: 'An error occurred while applying the frame.' });
        }
    },

    name: 'frameadd',
    description: 'Apply a frame from your inventory to a card.',
    devOnly: false,
    options: [
        {
            name: 'id',
            description: 'The ID of the card to frame',
            type: ApplicationCommandOptionType.String,
            required: true
        },
        {
            name: 'frame',
            description: 'The name of the frame to apply',
            type: ApplicationCommandOptionType.String,
            required: true
        }
    ]
};
