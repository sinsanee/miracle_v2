const {
    Client,
    Interaction,
    ApplicationCommandOptionType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
} = require('discord.js');
const { get, run } = require('../../models/query');

const GOLD_ITEM_ID = 7;

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const itemId = interaction.options.get('itemid').value;
        const amount = interaction.options.get('amount')?.value ?? 1;
        const userId = interaction.user.id;

        // Basic validation
        if (amount < 1 || !Number.isInteger(amount)) {
            return interaction.editReply({ content: 'Amount must be a positive whole number.' });
        }

        try {
            // Fetch item from shop
            const item = await get(
                'SELECT id, name, description, shopprice FROM items WHERE id = ? AND shopprice IS NOT NULL AND shopprice > 0',
                [itemId]
            );

            if (!item) {
                return interaction.editReply({
                    content: `No item with ID **${itemId}** was found in the shop.`
                });
            }

            const totalCost = item.shopprice * amount;

            // Fetch user gold from inventory (item ID 7)
            const goldRow = await get(
                'SELECT amount FROM inventory WHERE userid = ? AND itemid = ?',
                [userId, GOLD_ITEM_ID]
            );
            const userGold = goldRow?.amount ?? 0;

            if (userGold < totalCost) {
                const shortage = totalCost - userGold;
                return interaction.editReply({
                    content: [
                        `💸 You don't have enough gold to buy **${amount}x ${item.name}**.`,
                        `> Cost: 🪙 **${totalCost}** gold`,
                        `> Your balance: 🪙 **${userGold}** gold`,
                        `> You need **${shortage}** more gold.`
                    ].join('\n')
                });
            }

            // Build confirmation embed
            const confirmEmbed = new EmbedBuilder()
                .setTitle('🛒 Confirm Purchase')
                .setColor('#F1C40F')
                .addFields(
                    { name: 'Item', value: item.name, inline: true },
                    { name: 'Amount', value: amount.toString(), inline: true },
                    { name: 'Total Cost', value: `🪙 ${totalCost} gold`, inline: true },
                    { name: 'Your Balance', value: `🪙 ${userGold} gold`, inline: true },
                    { name: 'Remaining After Purchase', value: `🪙 ${userGold - totalCost} gold`, inline: true }
                );

            if (item.description) {
                confirmEmbed.setDescription(`*${item.description}*`);
            }

            const confirmButton = new ButtonBuilder()
                .setCustomId(`buy_confirm_${interaction.id}`)
                .setLabel('Confirm Purchase')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success);

            const cancelButton = new ButtonBuilder()
                .setCustomId(`buy_cancel_${interaction.id}`)
                .setLabel('Cancel')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents([confirmButton, cancelButton]);

            const message = await interaction.editReply({
                embeds: [confirmEmbed],
                components: [row]
            });

            // Collect button response — only one press needed, 30s window
            const collector = message.createMessageComponentCollector({
                filter: (i) => i.user.id === userId,
                max: 1,
                time: 30000
            });

            collector.on('collect', async (i) => {
                if (i.customId === `buy_cancel_${interaction.id}`) {
                    return i.update({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription('❌ Purchase cancelled.')
                                .setColor('#E74C3C')
                        ],
                        components: []
                    });
                }

                // Confirmed — re-check gold to guard against race conditions
                const freshGoldRow = await get(
                    'SELECT amount FROM inventory WHERE userid = ? AND itemid = ?',
                    [userId, GOLD_ITEM_ID]
                );
                const freshGold = freshGoldRow?.amount ?? 0;

                if (freshGold < totalCost) {
                    return i.update({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription("❌ Your gold balance changed and you no longer have enough to complete this purchase.")
                                .setColor('#E74C3C')
                        ],
                        components: []
                    });
                }

                // Deduct gold from inventory
                await run(
                    'UPDATE inventory SET amount = amount - ? WHERE userid = ? AND itemid = ?',
                    [totalCost, userId, GOLD_ITEM_ID]
                );

                // Add to inventory (upsert: if item already exists, add to amount)
                const existing = await get(
                    'SELECT id, amount FROM inventory WHERE userid = ? AND itemid = ?',
                    [userId, item.id]
                );

                if (existing) {
                    await run(
                        'UPDATE inventory SET amount = amount + ? WHERE id = ?',
                        [amount, existing.id]
                    );
                } else {
                    await run(
                        'INSERT INTO inventory (userid, itemid, amount) VALUES (?, ?, ?)',
                        [userId, item.id, amount]
                    );
                }

                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Purchase Successful!')
                    .setColor('#2ECC71')
                    .addFields(
                        { name: 'Item', value: item.name, inline: true },
                        { name: 'Amount', value: amount.toString(), inline: true },
                        { name: 'Spent', value: `🪙 ${totalCost} gold`, inline: true },
                        { name: 'New Balance', value: `🪙 ${freshGold - totalCost} gold`, inline: true }
                    )
                    .setFooter({ text: 'Check your inventory with /inventory' });

                await i.update({ embeds: [successEmbed], components: [] });
            });

            collector.on('end', async (collected) => {
                // Timed out without a response
                if (collected.size === 0) {
                    await message.edit({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription('⏰ Purchase confirmation timed out.')
                                .setColor('#95A5A6')
                        ],
                        components: []
                    }).catch(console.error);
                }
            });

        } catch (error) {
            console.error('Error in buy command:', error);
            await interaction.editReply({
                content: 'An error occurred while processing your purchase.',
                ephemeral: true
            }).catch(console.error);
        }
    },

    name: 'buy',
    description: 'Buy an item from the shop.',
    devOnly: false,
    options: [
        {
            name: 'itemid',
            description: 'The ID of the item you want to buy (visible in /shop)',
            type: ApplicationCommandOptionType.Integer,
            required: true
        },
        {
            name: 'amount',
            description: 'How many to buy (defaults to 1)',
            type: ApplicationCommandOptionType.Integer,
            required: false,
            minValue: 1
        }
    ]
};
