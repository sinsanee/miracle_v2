const {
    Client, Interaction, ApplicationCommandOptionType,
    EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder
} = require('discord.js');
const { get, run } = require('../../models/query');
const { getCardBorder } = require('../../models/cardBorder');
const { cardGenFromCropped, rollPaintColor, rollEffects } = require('../../models/cardGen');
const { resolveImageBuffer } = require('../../models/imageResolver');

const GOLD_ITEM_ID  = 7;
const PAINT_COST    = 1;

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const cardId = interaction.options.getString('id').toUpperCase();
        const userId = interaction.user.id;

        try {
            // Verify ownership
            const ownedCard = await get(
                'SELECT * FROM owned_cards WHERE id = ? AND owner = ?',
                [cardId, userId]
            );
            if (!ownedCard) {
                return interaction.editReply({ content: `❌ No card with ID **${cardId}** found in your collection.` });
            }

            // Check gold
            const goldRow = await get(
                'SELECT amount FROM inventory WHERE userid = ? AND itemid = ?',
                [userId, GOLD_ITEM_ID]
            );
            const userGold = goldRow?.amount ?? 0;
            if (userGold < PAINT_COST) {
                return interaction.editReply({
                    content: `❌ You need **🪙 ${PAINT_COST} Gold** to paint a card.\nYour balance: 🪙 **${userGold}** Gold.`
                });
            }

            // Roll color and effects
            const { r, g, b, anchorName } = rollPaintColor();
            const { mirror, grayscale, effectCode } = rollEffects();

            // Fetch card + set details
            const card    = await get('SELECT * FROM cards WHERE id = ?', [ownedCard.card]);
            const setData = await get('SELECT name, border FROM sets WHERE id = ?', [card.set_id]);

            // Generate card image preview with rolled paint + effects
            const croppedBuffer = await resolveImageBuffer(`${process.env.IMAGE_BASE_URL}/${card.image}`);
            // For the preview, use a temporary ownedCard-like object with the rolled values
            const previewOwned  = { ...ownedCard, r, g, b, effect: effectCode, border_type: null, border_item_id: null };
            const borderBuffer  = await getCardBorder(previewOwned, setData);

            const generatedCard = await cardGenFromCropped(
                croppedBuffer,
                { name: card.name, subtitle: ownedCard.id, footer: `${ownedCard.print}` },
                borderBuffer,
                ownedCard.condition ?? 5,
                effectCode
            );

            const attachment = new AttachmentBuilder(generatedCard, { name: 'painted.png' });

            // Build result description
            const colorHex  = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`.toUpperCase();
            const effectDesc = effectCode
                ? (effectCode === 'MG' ? '🔀 Mirrored + 🌑 Grayscale' : effectCode === 'M' ? '🔀 Mirrored' : '🌑 Grayscale')
                : 'None';

            const confirmEmbed = new EmbedBuilder()
                .setTitle('🎨 Paint Result')
                .setDescription(
                    `**${card.name}** (\`${cardId}\`) has been rolled.\n` +
                    `This will cost 🪙 **${PAINT_COST} Gold**.\n\n` +
                    `Confirm to apply this paint permanently.`
                )
                .addFields(
                    { name: '🎨 Color',    value: `${anchorName}\n\`${colorHex}\`\nRGB(${r}, ${g}, ${b})`, inline: true },
                    { name: '✨ Effect',   value: effectDesc,                                               inline: true },
                    { name: '💰 Balance', value: `🪙 ${userGold} → 🪙 ${userGold - PAINT_COST}`,          inline: true }
                )
                .setImage('attachment://painted.png')
                .setColor(r << 16 | g << 8 | b)
                .setFooter({ text: 'Step 1 of 2 — Does this look right?' });

            const confirmBtn = new ButtonBuilder()
                .setCustomId(`paint_confirm_${interaction.id}`)
                .setLabel('Apply Paint')
                .setEmoji('🎨')
                .setStyle(ButtonStyle.Success);

            const rerollBtn = new ButtonBuilder()
                .setCustomId(`paint_reroll_${interaction.id}`)
                .setLabel('Reroll (500 Gold)')
                .setEmoji('🎲')
                .setStyle(ButtonStyle.Primary);

            const cancelBtn = new ButtonBuilder()
                .setCustomId(`paint_cancel_${interaction.id}`)
                .setLabel('Cancel')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Secondary);

            const message = await interaction.editReply({
                embeds: [confirmEmbed],
                files: [attachment],
                components: [new ActionRowBuilder().addComponents([confirmBtn, rerollBtn, cancelBtn])]
            });

            // State for the current roll (can change on reroll)
            let currentRoll = { r, g, b, anchorName, effectCode, colorHex, effectDesc };

            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === userId,
                time: 60000
            });

            collector.on('collect', async (i) => {
                if (i.customId === `paint_cancel_${interaction.id}`) {
                    collector.stop('cancelled');
                    return i.update({
                        embeds: [new EmbedBuilder().setDescription('❌ Paint cancelled.').setColor('#95A5A6')],
                        files: [],
                        components: []
                    });
                }

                // ── Reroll ───────────────────────────────────────────────────
                if (i.customId === `paint_reroll_${interaction.id}`) {
                    // Re-check gold
                    const freshGold = await get(
                        'SELECT amount FROM inventory WHERE userid = ? AND itemid = ?',
                        [userId, GOLD_ITEM_ID]
                    );
                    const freshAmount = freshGold?.amount ?? 0;
                    if (freshAmount < PAINT_COST) {
                        return i.update({
                            embeds: [new EmbedBuilder().setDescription(`❌ Not enough gold to reroll. You need 🪙 ${PAINT_COST}.`).setColor('#E74C3C')],
                            files: [],
                            components: []
                        });
                    }

                    // Deduct gold for reroll
                    await run(
                        'UPDATE inventory SET amount = amount - ? WHERE userid = ? AND itemid = ?',
                        [PAINT_COST, userId, GOLD_ITEM_ID]
                    );

                    const rerolled     = rollPaintColor();
                    const rerolledFx   = rollEffects();
                    const newHex       = `#${rerolled.r.toString(16).padStart(2,'0')}${rerolled.g.toString(16).padStart(2,'0')}${rerolled.b.toString(16).padStart(2,'0')}`.toUpperCase();
                    const newFxDesc    = rerolledFx.effectCode
                        ? (rerolledFx.effectCode === 'MG' ? '🔀 Mirrored + 🌑 Grayscale' : rerolledFx.effectCode === 'M' ? '🔀 Mirrored' : '🌑 Grayscale')
                        : 'None';
                    const newBalance   = freshAmount - PAINT_COST;

                    currentRoll = { r: rerolled.r, g: rerolled.g, b: rerolled.b, anchorName: rerolled.anchorName, effectCode: rerolledFx.effectCode, colorHex: newHex, effectDesc: newFxDesc };

                    const rerollOwned  = { ...ownedCard, r: rerolled.r, g: rerolled.g, b: rerolled.b, effect: rerolledFx.effectCode, border_type: null, border_item_id: null };
                    const rerollBorder = await getCardBorder(rerollOwned, setData);
                    const newCard = await cardGenFromCropped(
                        croppedBuffer,
                        { name: card.name, subtitle: ownedCard.id, footer: `${ownedCard.print}` },
                        rerollBorder,
                        ownedCard.condition ?? 5,
                        rerolledFx.effectCode
                    );

                    const newAttachment = new AttachmentBuilder(newCard, { name: 'painted.png' });

                    const rerollEmbed = new EmbedBuilder()
                        .setTitle('🎨 Paint Result')
                        .setDescription(
                            `**${card.name}** (\`${cardId}\`) has been rerolled.\n` +
                            `Confirm to apply this paint permanently.`
                        )
                        .addFields(
                            { name: '🎨 Color',    value: `${rerolled.anchorName}\n\`${newHex}\`\nRGB(${rerolled.r}, ${rerolled.g}, ${rerolled.b})`, inline: true },
                            { name: '✨ Effect',   value: newFxDesc,                                                                                   inline: true },
                            { name: '💰 Balance', value: `🪙 ${newBalance} Gold`,                                                                     inline: true }
                        )
                        .setImage('attachment://painted.png')
                        .setColor(rerolled.r << 16 | rerolled.g << 8 | rerolled.b)
                        .setFooter({ text: 'Step 1 of 2 — Does this look right?' });

                    collector.resetTimer();
                    return i.update({
                        embeds: [rerollEmbed],
                        files: [newAttachment],
                        components: [new ActionRowBuilder().addComponents([confirmBtn, rerollBtn, cancelBtn])]
                    });
                }

                // ── Confirm ──────────────────────────────────────────────────
                if (i.customId === `paint_confirm_${interaction.id}`) {
                    // Step 2 embed
                    const step2Embed = new EmbedBuilder()
                        .setTitle('🎨 Final Confirmation')
                        .setDescription(
                            `**This is your last chance.**\n\n` +
                            `Apply **${currentRoll.anchorName}** paint to **${card.name}** (\`${cardId}\`)?\n` +
                            `This costs 🪙 **${PAINT_COST} Gold** and cannot be undone.`
                        )
                        .setColor(currentRoll.r << 16 | currentRoll.g << 8 | currentRoll.b)
                        .setFooter({ text: 'Step 2 of 2 — Final confirmation' });

                    const finalConfirm = new ButtonBuilder()
                        .setCustomId(`paint_final_${interaction.id}`)
                        .setLabel('Confirm — Apply Forever')
                        .setEmoji('🎨')
                        .setStyle(ButtonStyle.Danger);

                    const finalCancel = new ButtonBuilder()
                        .setCustomId(`paint_cancel_${interaction.id}`)
                        .setLabel('Cancel')
                        .setEmoji('❌')
                        .setStyle(ButtonStyle.Secondary);

                    collector.resetTimer();
                    return i.update({
                        embeds: [step2Embed],
                        files: [],
                        components: [new ActionRowBuilder().addComponents([finalConfirm, finalCancel])]
                    });
                }

                // ── Final apply ──────────────────────────────────────────────
                if (i.customId === `paint_final_${interaction.id}`) {
                    collector.stop('applied');

                    // Re-check gold one more time
                    const freshGold = await get(
                        'SELECT amount FROM inventory WHERE userid = ? AND itemid = ?',
                        [userId, GOLD_ITEM_ID]
                    );
                    if ((freshGold?.amount ?? 0) < PAINT_COST) {
                        return i.update({
                            embeds: [new EmbedBuilder().setDescription('❌ Not enough gold to apply paint.').setColor('#E74C3C')],
                            components: []
                        });
                    }

                    // Deduct gold
                    await run(
                        'UPDATE inventory SET amount = amount - ? WHERE userid = ? AND itemid = ?',
                        [PAINT_COST, userId, GOLD_ITEM_ID]
                    );

                    // Save paint + effect to owned_cards
                    await run(
                        'UPDATE owned_cards SET r = ?, g = ?, b = ?, effect = ? WHERE id = ?',
                        [currentRoll.r, currentRoll.g, currentRoll.b, currentRoll.effectCode, cardId]
                    );

                    const successEmbed = new EmbedBuilder()
                        .setTitle('🎨 Card Painted!')
                        .setDescription(`**${card.name}** (\`${cardId}\`) has been painted.`)
                        .addFields(
                            { name: '🎨 Color',  value: `${currentRoll.anchorName}\n\`${currentRoll.colorHex}\``, inline: true },
                            { name: '✨ Effect', value: currentRoll.effectDesc,                                    inline: true }
                        )
                        .setColor(currentRoll.r << 16 | currentRoll.g << 8 | currentRoll.b)
                        .setFooter({ text: `🪙 ${PAINT_COST} Gold spent` });

                    return i.update({ embeds: [successEmbed], files: [], components: [] });
                }
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'time') {
                    await message.edit({
                        embeds: [new EmbedBuilder().setDescription('⏰ Paint timed out. No changes were made.').setColor('#95A5A6')],
                        files: [],
                        components: []
                    }).catch(console.error);
                }
            });

        } catch (error) {
            console.error('Error in paint command:', error);
            await interaction.editReply({ content: 'An error occurred while processing the paint.' }).catch(console.error);
        }
    },

    name: 'paint',
    description: 'Paint a card with a randomly rolled color and effect for 500 Gold.',
    devOnly: false,
    options: [
        {
            name: 'id',
            description: 'The ID of the card you want to paint',
            type: ApplicationCommandOptionType.String,
            required: true
        }
    ]
};
