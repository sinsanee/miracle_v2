const {
    Client,
    Interaction,
    ApplicationCommandOptionType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    AttachmentBuilder,
} = require('discord.js');
const { get, run, all } = require('../../models/query');
const { getCardBorder } = require('../../models/cardBorder');
const { cardGenFromCropped } = require('../../models/cardGen');
const { resolveImageBuffer } = require('../../models/imageResolver');

const GOLD_ITEM_ID    = 7;
const UPGRADE_DUST_ID = 9;
const ANCIENT_DUST_ID = 10;
const RELIC_DUST_ID   = 11;

const CONDITION_INFO = {
    1: { label: 'Poor',      dust: ANCIENT_DUST_ID, dustName: 'Ancient Dust', emoji: '🪨' },
    2: { label: 'Played',    dust: UPGRADE_DUST_ID, dustName: 'Upgrade Dust', emoji: '🌫️' },
    3: { label: 'Good',      dust: UPGRADE_DUST_ID, dustName: 'Upgrade Dust', emoji: '🌫️' },
    4: { label: 'Near Mint', dust: UPGRADE_DUST_ID, dustName: 'Upgrade Dust', emoji: '🌫️' },
    5: { label: 'Mint',      dust: RELIC_DUST_ID,   dustName: 'Relic Dust',   emoji: '✨' },
};

// Upsert a quantity of an item into inventory
async function addToInventory(userId, itemId, amount) {
    const existing = await get('SELECT id FROM inventory WHERE userid = ? AND itemid = ?', [userId, itemId]);
    if (existing) {
        await run('UPDATE inventory SET amount = amount + ? WHERE userid = ? AND itemid = ?', [amount, userId, itemId]);
    } else {
        await run('INSERT INTO inventory (userid, itemid, amount) VALUES (?, ?, ?)', [userId, itemId, amount]);
    }
}

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const cardId  = interaction.options.getString('id')?.toUpperCase() ?? null;
        const tagName = interaction.options.getString('tag')?.trim() ?? null;
        const userId  = interaction.user.id;

        if (!cardId && !tagName) {
            return interaction.editReply({ content: '❌ Provide either a card **ID** or a **tag** to burn.' });
        }
        if (cardId && tagName) {
            return interaction.editReply({ content: '❌ Provide either a card ID **or** a tag — not both.' });
        }

        try {
            // ══════════════════════════════════════════════════════════════════
            //  TAG BURN
            // ══════════════════════════════════════════════════════════════════
            if (tagName) {
                const tag = await get('SELECT id, name, emoji FROM tags WHERE userid = ? AND name = ?', [userId, tagName]);
                if (!tag) {
                    return interaction.editReply({ content: `❌ You don't have a tag named **${tagName}**.` });
                }

                const cards = await all(
                    `SELECT owned_cards.id AS owned_id, owned_cards.condition, cards.name
                     FROM owned_cards
                     JOIN cards ON owned_cards.card = cards.id
                     WHERE owned_cards.owner = ? AND owned_cards.tag_id = ?`,
                    [userId, tag.id]
                );

                if (!cards || cards.length === 0) {
                    return interaction.editReply({ content: `❌ No cards in your collection are tagged with **${tag.emoji} ${tag.name}**.` });
                }

                // Tally up the rewards
                const dustTotals = {};
                let totalGold = 0;
                const goldPerCard = [];

                for (const card of cards) {
                    const gold = Math.floor(Math.random() * 81) + 20;
                    goldPerCard.push(gold);
                    totalGold += gold;
                    const condInfo = CONDITION_INFO[card.condition ?? 5];
                    dustTotals[condInfo.dustName] = (dustTotals[condInfo.dustName] ?? 0) + 1;
                }

                const dustSummary = Object.entries(dustTotals)
                    .map(([name, amt]) => `${amt}x ${name}`)
                    .join('\n');

                const cardList = cards.slice(0, 20).map(c => `\`${c.owned_id}\` ${c.name}`).join('\n')
                    + (cards.length > 20 ? `\n*...and ${cards.length - 20} more*` : '');

                // Step 1
                const step1Embed = new EmbedBuilder()
                    .setTitle(`🔥 Burn Tag: ${tag.emoji} ${tag.name}?`)
                    .setDescription(
                        `You are about to burn **${cards.length} card${cards.length !== 1 ? 's' : ''}**.\n` +
                        `This action is **permanent** and cannot be undone.\n\n` +
                        `**Cards to burn:**\n${cardList}`
                    )
                    .addFields(
                        { name: 'Dust you will receive', value: dustSummary, inline: true },
                        { name: 'Gold you will receive', value: `🪙 ${totalGold} Gold`, inline: true }
                    )
                    .setColor('#E67E22')
                    .setFooter({ text: 'Step 1 of 2 — Are you sure?' });

                const confirmBtn1 = new ButtonBuilder()
                    .setCustomId(`burn_step1_confirm_${interaction.id}`)
                    .setLabel(`Yes, burn ${cards.length} cards`)
                    .setEmoji('🔥')
                    .setStyle(ButtonStyle.Danger);

                const cancelBtn1 = new ButtonBuilder()
                    .setCustomId(`burn_cancel_${interaction.id}`)
                    .setLabel('Cancel')
                    .setEmoji('❌')
                    .setStyle(ButtonStyle.Secondary);

                const message = await interaction.editReply({
                    embeds: [step1Embed],
                    components: [new ActionRowBuilder().addComponents([confirmBtn1, cancelBtn1])]
                });

                const collector = message.createMessageComponentCollector({
                    filter: (i) => i.user.id === userId,
                    time: 60000
                });

                let step1Confirmed = false;

                collector.on('collect', async (i) => {
                    if (i.customId === `burn_cancel_${interaction.id}`) {
                        collector.stop('cancelled');
                        return i.update({
                            embeds: [new EmbedBuilder().setDescription('❌ Burn cancelled. Your cards are safe.').setColor('#95A5A6')],
                            components: []
                        });
                    }

                    if (i.customId === `burn_step1_confirm_${interaction.id}` && !step1Confirmed) {
                        step1Confirmed = true;

                        const step2Embed = new EmbedBuilder()
                            .setTitle('🔥 Final Confirmation')
                            .setDescription(
                                `**This is your last chance.**\n\n` +
                                `Burning **${cards.length} card${cards.length !== 1 ? 's' : ''}** tagged with ${tag.emoji} **${tag.name}** will destroy them permanently.\n` +
                                `You will receive **${dustSummary.replace(/\n/g, ', ')}** and **🪙 ${totalGold} Gold**.`
                            )
                            .setColor('#C0392B')
                            .setFooter({ text: 'Step 2 of 2 — Final confirmation' });

                        const confirmBtn2 = new ButtonBuilder()
                            .setCustomId(`burn_step2_confirm_${interaction.id}`)
                            .setLabel('Confirm — Burn forever')
                            .setEmoji('🔥')
                            .setStyle(ButtonStyle.Danger);

                        const cancelBtn2 = new ButtonBuilder()
                            .setCustomId(`burn_cancel_${interaction.id}`)
                            .setLabel('Cancel')
                            .setEmoji('❌')
                            .setStyle(ButtonStyle.Secondary);

                        return i.update({
                            embeds: [step2Embed],
                            components: [new ActionRowBuilder().addComponents([confirmBtn2, cancelBtn2])]
                        });
                    }

                    if (i.customId === `burn_step2_confirm_${interaction.id}`) {
                        collector.stop('burned');

                        // Execute burns
                        for (let idx = 0; idx < cards.length; idx++) {
                            const card     = cards[idx];
                            const condInfo = CONDITION_INFO[card.condition ?? 5];
                            await run('DELETE FROM owned_cards WHERE id = ? AND owner = ?', [card.owned_id, userId]);
                            await addToInventory(userId, condInfo.dust, 1);
                            await addToInventory(userId, GOLD_ITEM_ID, goldPerCard[idx]);
                        }

                        const successEmbed = new EmbedBuilder()
                            .setTitle('🔥 Tag Burned')
                            .setDescription(`All **${cards.length}** cards tagged with ${tag.emoji} **${tag.name}** have been burned.`)
                            .addFields(
                                { name: 'Dust Received', value: dustSummary, inline: true },
                                { name: 'Gold Received', value: `🪙 ${totalGold} Gold`, inline: true }
                            )
                            .setColor('#E74C3C')
                            .setFooter({ text: 'The cards are gone forever.' });

                        return i.update({ embeds: [successEmbed], components: [] });
                    }
                });

                collector.on('end', async (_, reason) => {
                    if (reason === 'time') {
                        await message.edit({
                            embeds: [new EmbedBuilder().setDescription('⏰ Burn timed out. Your cards are safe.').setColor('#95A5A6')],
                            components: []
                        }).catch(console.error);
                    }
                });

                return;
            }

            // ══════════════════════════════════════════════════════════════════
            //  SINGLE CARD BURN
            // ══════════════════════════════════════════════════════════════════
            const ownedCard = await get('SELECT * FROM owned_cards WHERE id = ? AND owner = ?', [cardId, userId]);
            if (!ownedCard) {
                return interaction.editReply({ content: `No card with ID **${cardId}** found in your collection.` });
            }

            const card = await get('SELECT * FROM cards WHERE id = ?', [ownedCard.card]);
            if (!card) {
                return interaction.editReply({ content: 'Card data not found in database.' });
            }

            const setData = await get('SELECT name, border FROM sets WHERE id = ?', [card.set_id]);

            const imageUrl           = `${process.env.IMAGE_BASE_URL}/${card.image}`;
            const croppedImageBuffer = await resolveImageBuffer(imageUrl);
            const borderBuffer       = await getCardBorder(ownedCard, setData);

            const generatedCard = await cardGenFromCropped(
                croppedImageBuffer,
                { name: card.name, subtitle: ownedCard.id, footer: `${ownedCard.print}` },
                borderBuffer,
                ownedCard.condition ?? 5,
                ownedCard.effect ?? null
            );

            const attachment  = new AttachmentBuilder(generatedCard, { name: 'card.png' });
            const condition   = ownedCard.condition ?? 5;
            const condInfo    = CONDITION_INFO[condition];
            const goldReward  = Math.floor(Math.random() * 81) + 20;

            // Step 1
            const step1Embed = new EmbedBuilder()
                .setTitle('🔥 Burn Card?')
                .setDescription(
                    `You are about to burn **${card.name}** (\`${ownedCard.id}\`).\n` +
                    `This action is **permanent** and cannot be undone.`
                )
                .addFields(
                    { name: 'Condition',        value: `${condInfo.emoji} ${condInfo.label}`,               inline: true },
                    { name: 'You will receive', value: `${condInfo.emoji} 1x ${condInfo.dustName}\n🪙 ${goldReward} Gold`, inline: true }
                )
                .setImage('attachment://card.png')
                .setColor('#E67E22')
                .setFooter({ text: 'Step 1 of 2 — Are you sure?' });

            const confirmBtn1 = new ButtonBuilder()
                .setCustomId(`burn_step1_confirm_${interaction.id}`)
                .setLabel('Yes, burn it')
                .setEmoji('🔥')
                .setStyle(ButtonStyle.Danger);

            const cancelBtn1 = new ButtonBuilder()
                .setCustomId(`burn_cancel_${interaction.id}`)
                .setLabel('Cancel')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Secondary);

            const message = await interaction.editReply({
                embeds: [step1Embed],
                files: [attachment],
                components: [new ActionRowBuilder().addComponents([confirmBtn1, cancelBtn1])]
            });

            const collector = message.createMessageComponentCollector({
                filter: (i) => i.user.id === userId,
                time: 60000
            });

            let step1Confirmed = false;

            collector.on('collect', async (i) => {
                if (i.customId === `burn_cancel_${interaction.id}`) {
                    collector.stop('cancelled');
                    return i.update({
                        embeds: [new EmbedBuilder().setDescription('❌ Burn cancelled. Your card is safe.').setColor('#95A5A6')],
                        files: [],
                        components: []
                    });
                }

                if (i.customId === `burn_step1_confirm_${interaction.id}` && !step1Confirmed) {
                    step1Confirmed = true;

                    const step2Embed = new EmbedBuilder()
                        .setTitle('🔥 Final Confirmation')
                        .setDescription(
                            `**This is your last chance.**\n\n` +
                            `Burning **${card.name}** (\`${ownedCard.id}\`) will permanently destroy it.\n` +
                            `You will receive **1x ${condInfo.dustName}** and **${goldReward} Gold**.`
                        )
                        .setImage('attachment://card.png')
                        .setColor('#C0392B')
                        .setFooter({ text: 'Step 2 of 2 — Final confirmation' });

                    const confirmBtn2 = new ButtonBuilder()
                        .setCustomId(`burn_step2_confirm_${interaction.id}`)
                        .setLabel('Confirm — Burn forever')
                        .setEmoji('🔥')
                        .setStyle(ButtonStyle.Danger);

                    const cancelBtn2 = new ButtonBuilder()
                        .setCustomId(`burn_cancel_${interaction.id}`)
                        .setLabel('Cancel')
                        .setEmoji('❌')
                        .setStyle(ButtonStyle.Secondary);

                    return i.update({
                        embeds: [step2Embed],
                        files: [attachment],
                        components: [new ActionRowBuilder().addComponents([confirmBtn2, cancelBtn2])]
                    });
                }

                if (i.customId === `burn_step2_confirm_${interaction.id}`) {
                    collector.stop('burned');

                    const freshCard = await get('SELECT id FROM owned_cards WHERE id = ? AND owner = ?', [cardId, userId]);
                    if (!freshCard) {
                        return i.update({
                            embeds: [new EmbedBuilder().setDescription('❌ Card no longer found in your collection.').setColor('#E74C3C')],
                            files: [],
                            components: []
                        });
                    }

                    await run('DELETE FROM owned_cards WHERE id = ?', [cardId]);
                    await addToInventory(userId, condInfo.dust, 1);
                    await addToInventory(userId, GOLD_ITEM_ID, goldReward);

                    const successEmbed = new EmbedBuilder()
                        .setTitle('🔥 Card Burned')
                        .setDescription(`**${card.name}** (\`${cardId}\`) has been burned to ash.`)
                        .addFields(
                            { name: 'Dust Received', value: `${condInfo.emoji} 1x ${condInfo.dustName}`, inline: true },
                            { name: 'Gold Received', value: `🪙 ${goldReward} Gold`,                     inline: true }
                        )
                        .setColor('#E74C3C')
                        .setFooter({ text: 'The card is gone forever.' });

                    return i.update({ embeds: [successEmbed], files: [], components: [] });
                }
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'time') {
                    await message.edit({
                        embeds: [new EmbedBuilder().setDescription('⏰ Burn timed out. Your card is safe.').setColor('#95A5A6')],
                        files: [],
                        components: []
                    }).catch(console.error);
                }
            });

        } catch (error) {
            console.error('Error in burn command:', error);
            await interaction.editReply({ content: 'An error occurred while processing the burn.' }).catch(console.error);
        }
    },

    name: 'burn',
    description: 'Burn a card (or a whole tag) to receive dust and gold.',
    devOnly: false,
    options: [
        {
            name: 'id',
            description: 'The ID of the card you want to burn',
            type: ApplicationCommandOptionType.String,
            required: false
        },
        {
            name: 'tag',
            description: 'Burn all cards with this tag at once',
            type: ApplicationCommandOptionType.String,
            required: false
        }
    ]
};
