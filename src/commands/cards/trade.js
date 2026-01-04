const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder , ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, ComponentType,} = require('discord.js');
const { all, get, run } = require('../../models/query');

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply();

        const initiator = interaction.user;
        const targetUser = interaction.options.getUser('user');

        // Prevent trading with yourself
        if (initiator.id === targetUser.id) {
            return interaction.editReply({
                content: '❌ You cannot trade with yourself!',
                ephemeral: true
            });
        }

        // Prevent trading with bots
        if (targetUser.bot) {
            return interaction.editReply({
                content: '❌ You cannot trade with bots!',
                ephemeral: true
            });
        }

        // Trade state
        const tradeState = {
            initiator: {
                id: initiator.id,
                username: initiator.username,
                cards: [],
                items: {},
                confirmed: false,
                doubleConfirmed: false
            },
            target: {
                id: targetUser.id,
                username: targetUser.username,
                cards: [],
                items: {},
                confirmed: false,
                doubleConfirmed: false
            },
            accepted: false
        };

        // Create accept/decline buttons
        const acceptButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`accept_trade_${interaction.id}`)
                .setLabel('✅ Accept Trade')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`decline_trade_${interaction.id}`)
                .setLabel('❌ Decline Trade')
                .setStyle(ButtonStyle.Danger)
        );

        const initialEmbed = new EmbedBuilder()
            .setTitle('📦 Trade Request')
            .setDescription(`${targetUser}, ${initiator.username} wants to trade with you!`)
            .setColor('#FFA500')
            .setTimestamp();

        const message = await interaction.editReply({
            embeds: [initialEmbed],
            components: [acceptButtons]
        });

        const collector = message.createMessageComponentCollector({
            time: 300000 // 5 minutes
        });

        // Message collector for adding items
        const messageCollector = interaction.channel.createMessageCollector({
            filter: m => (m.author.id === initiator.id || m.author.id === targetUser.id),
            time: 300000
        });

        /**
         * Create the trade embed
         */
        async function createTradeEmbed() {
            const embed = new EmbedBuilder()
                .setTitle('📦 Active Trade')
                .setColor('#5865F2')
                .setTimestamp();

            // Initiator's offer
            let initiatorOffer = '';
            if (tradeState.initiator.cards.length > 0) {
                initiatorOffer += '**Cards:**\n';
                for (const cardData of tradeState.initiator.cards) {
                    initiatorOffer += `• ${cardData.id} - ${cardData.name}\n`;
                }
            }
            if (Object.keys(tradeState.initiator.items).length > 0) {
                initiatorOffer += '**Items:**\n';
                for (const [item, amount] of Object.entries(tradeState.initiator.items)) {
                    initiatorOffer += `• ${amount} ${item}\n`;
                }
            }
            if (!initiatorOffer) initiatorOffer = '*Nothing offered yet*';

            // Target's offer
            let targetOffer = '';
            if (tradeState.target.cards.length > 0) {
                targetOffer += '**Cards:**\n';
                for (const cardData of tradeState.target.cards) {
                    targetOffer += `• ${cardData.id} - ${cardData.name}\n`;
                }
            }
            if (Object.keys(tradeState.target.items).length > 0) {
                targetOffer += '**Items:**\n';
                for (const [item, amount] of Object.entries(tradeState.target.items)) {
                    targetOffer += `• ${amount} ${item}\n`;
                }
            }
            if (!targetOffer) targetOffer = '*Nothing offered yet*';

            embed.addFields(
                { name: `${tradeState.initiator.username}'s Offer`, value: initiatorOffer, inline: false },
                { name: `${tradeState.target.username}'s Offer`, value: targetOffer, inline: false },
                { name: 'How to Add/Remove Items', value: 'Add: `100 gold, A5, 25 shards`\nRemove: `remove 50 gold, remove A5`', inline: false }
            );

            return embed;
        }

        /**
         * Create trade buttons
         */
        function createTradeButtons() {
            const initiatorConfirmed = tradeState.initiator.confirmed;
            const targetConfirmed = tradeState.target.confirmed;
            const initiatorDoubleConfirmed = tradeState.initiator.doubleConfirmed;
            const targetDoubleConfirmed = tradeState.target.doubleConfirmed;

            let initiatorLabel = '✅ Confirm';
            let targetLabel = '✅ Confirm';

            if (initiatorConfirmed && !initiatorDoubleConfirmed) {
                initiatorLabel = '✅✅ Final Confirm';
            } else if (initiatorDoubleConfirmed) {
                initiatorLabel = '✅✅ Confirmed!';
            }

            if (targetConfirmed && !targetDoubleConfirmed) {
                targetLabel = '✅✅ Final Confirm';
            } else if (targetDoubleConfirmed) {
                targetLabel = '✅✅ Confirmed!';
            }

            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_initiator_${interaction.id}`)
                    .setLabel(`${initiatorLabel} (${tradeState.initiator.username})`)
                    .setStyle(initiatorDoubleConfirmed ? ButtonStyle.Success : ButtonStyle.Primary)
                    .setDisabled(initiatorDoubleConfirmed),
                new ButtonBuilder()
                    .setCustomId(`confirm_target_${interaction.id}`)
                    .setLabel(`${targetLabel} (${tradeState.target.username})`)
                    .setStyle(targetDoubleConfirmed ? ButtonStyle.Success : ButtonStyle.Primary)
                    .setDisabled(targetDoubleConfirmed),
                new ButtonBuilder()
                    .setCustomId(`cancel_trade_${interaction.id}`)
                    .setLabel('❌ Cancel Trade')
                    .setStyle(ButtonStyle.Danger)
            );
        }

        /**
         * Parse and add items to trade
         */
        async function addItemsToTrade(userId, input) {
            const userSide = userId === initiator.id ? tradeState.initiator : tradeState.target;
            const items = input.split(',').map(i => i.trim());
            const added = [];
            const errors = [];

            for (const item of items) {
                // Check if it's a remove command
                const removeMatch = item.match(/^remove\s+(.+)$/i);
                if (removeMatch) {
                    const removeItem = removeMatch[1].trim();
                    
                    // Check if it's removing an item (e.g., "remove 100 gold")
                    const removeItemMatch = removeItem.match(/^(\d+)\s+(.+)$/);
                    if (removeItemMatch) {
                        const amount = parseInt(removeItemMatch[1]);
                        const itemName = removeItemMatch[2].toLowerCase();

                        if (userSide.items[itemName] && userSide.items[itemName] >= amount) {
                            userSide.items[itemName] -= amount;
                            if (userSide.items[itemName] === 0) {
                                delete userSide.items[itemName];
                            }
                            added.push(`Removed ${amount} ${itemName}`);
                        } else {
                            errors.push(`You don't have ${amount} ${itemName} in the trade`);
                        }
                    } else {
                        // Assume it's a card ID
                        const cardId = removeItem.toUpperCase();
                        const cardIndex = userSide.cards.findIndex(c => c.id === cardId);

                        if (cardIndex !== -1) {
                            const removedCard = userSide.cards.splice(cardIndex, 1)[0];
                            added.push(`Removed ${removedCard.id} - ${removedCard.name}`);
                        } else {
                            errors.push(`Card ${cardId} is not in the trade`);
                        }
                    }
                    continue;
                }

                // Check if it's an item (e.g., "100 gold")
                const itemMatch = item.match(/^(\d+)\s+(.+)$/);
                if (itemMatch) {
                    const amount = parseInt(itemMatch[1]);
                    const itemName = itemMatch[2].toLowerCase();

                    // Check if user has enough of this item
                    const inventory = await get(
                        'SELECT * FROM inventory WHERE userid = ? AND item = ?',
                        [userId, itemName]
                    );

                    if (!inventory || inventory.amount < amount) {
                        errors.push(`You don't have ${amount} ${itemName}`);
                        continue;
                    }

                    // Check if adding this would exceed inventory
                    const currentInTrade = userSide.items[itemName] || 0;
                    if (currentInTrade + amount > inventory.amount) {
                        errors.push(`You only have ${inventory.amount} ${itemName} total`);
                        continue;
                    }

                    // Add to trade
                    userSide.items[itemName] = currentInTrade + amount;
                    added.push(`${amount} ${itemName}`);
                } else {
                    // Assume it's a card ID
                    const cardId = item.toUpperCase();

                    // Check if card exists and is owned by user
                    const ownedCard = await get(
                        'SELECT owned_cards.*, cards.name FROM owned_cards JOIN cards ON owned_cards.card = cards.id WHERE owned_cards.id = ? AND owned_cards.owner = ?',
                        [cardId, userId]
                    );

                    if (!ownedCard) {
                        errors.push(`You don't own card ${cardId}`);
                        continue;
                    }

                    // Check if already added
                    if (userSide.cards.some(c => c.id === cardId)) {
                        errors.push(`Card ${cardId} already added`);
                        continue;
                    }

                    // Add to trade
                    userSide.cards.push({ id: cardId, name: ownedCard.name });
                    added.push(`${cardId} - ${ownedCard.name}`);
                }
            }

            return { added, errors };
        }

        /**
         * Execute the trade
         */
        async function executeTrade() {
            try {
                // Transfer cards
                for (const cardData of tradeState.initiator.cards) {
                    await run(
                        'UPDATE owned_cards SET owner = ? WHERE id = ?',
                        [tradeState.target.id, cardData.id]
                    );
                }
                for (const cardData of tradeState.target.cards) {
                    await run(
                        'UPDATE owned_cards SET owner = ? WHERE id = ?',
                        [tradeState.initiator.id, cardData.id]
                    );
                }

                // Transfer items from initiator
                for (const [item, amount] of Object.entries(tradeState.initiator.items)) {
                    await run(
                        'UPDATE inventory SET amount = amount - ? WHERE userid = ? AND item = ?',
                        [amount, tradeState.initiator.id, item]
                    );

                    const targetInventory = await get(
                        'SELECT * FROM inventory WHERE userid = ? AND item = ?',
                        [tradeState.target.id, item]
                    );

                    if (targetInventory) {
                        await run(
                            'UPDATE inventory SET amount = amount + ? WHERE userid = ? AND item = ?',
                            [amount, tradeState.target.id, item]
                        );
                    } else {
                        await run(
                            'INSERT INTO inventory (userid, item, amount) VALUES (?, ?, ?)',
                            [tradeState.target.id, item, amount]
                        );
                    }
                }

                // Transfer items from target
                for (const [item, amount] of Object.entries(tradeState.target.items)) {
                    await run(
                        'UPDATE inventory SET amount = amount - ? WHERE userid = ? AND item = ?',
                        [amount, tradeState.target.id, item]
                    );

                    const initiatorInventory = await get(
                        'SELECT * FROM inventory WHERE userid = ? AND item = ?',
                        [tradeState.initiator.id, item]
                    );

                    if (initiatorInventory) {
                        await run(
                            'UPDATE inventory SET amount = amount + ? WHERE userid = ? AND item = ?',
                            [amount, tradeState.initiator.id, item]
                        );
                    } else {
                        await run(
                            'INSERT INTO inventory (userid, item, amount) VALUES (?, ?, ?)',
                            [tradeState.initiator.id, item, amount]
                        );
                    }
                }

                return true;
            } catch (error) {
                console.error('Error executing trade:', error);
                return false;
            }
        }

        // Handle button interactions
        collector.on('collect', async (i) => {
            try {
                // Accept/Decline trade
                if (i.customId === `accept_trade_${interaction.id}`) {
                    if (i.user.id !== targetUser.id) {
                        return i.reply({
                            content: '❌ Only the target user can accept this trade!',
                            ephemeral: true
                        }).catch(console.error);
                    }

                    tradeState.accepted = true;
                    const tradeEmbed = await createTradeEmbed();

                    await i.update({
                        embeds: [tradeEmbed],
                        components: [createTradeButtons()]
                    }).catch(console.error);

                    collector.resetTimer();
                    messageCollector.resetTimer();
                } else if (i.customId === `decline_trade_${interaction.id}`) {
                    if (i.user.id !== targetUser.id) {
                        return i.reply({
                            content: '❌ Only the target user can decline this trade!',
                            ephemeral: true
                        }).catch(console.error);
                    }

                    collector.stop();
                    messageCollector.stop();

                    await i.update({
                        content: '❌ Trade declined.',
                        embeds: [],
                        components: []
                    }).catch(console.error);
                }
                // Confirm buttons
                else if (i.customId === `confirm_initiator_${interaction.id}`) {
                    if (i.user.id !== initiator.id) {
                        return i.reply({
                            content: '❌ This is not your confirm button!',
                            ephemeral: true
                        }).catch(console.error);
                    }

                    if (!tradeState.initiator.confirmed) {
                        tradeState.initiator.confirmed = true;
                        await i.update({
                            components: [createTradeButtons()]
                        }).catch(console.error);
                    } else if (!tradeState.initiator.doubleConfirmed) {
                        tradeState.initiator.doubleConfirmed = true;
                        await i.update({
                            components: [createTradeButtons()]
                        }).catch(console.error);

                        // Check if both confirmed
                        if (tradeState.target.doubleConfirmed) {
                            const success = await executeTrade();

                            collector.stop();
                            messageCollector.stop();

                            if (success) {
                                const successEmbed = new EmbedBuilder()
                                    .setTitle('✅ Trade Complete!')
                                    .setDescription('The trade has been successfully completed.')
                                    .setColor('#00FF00')
                                    .setTimestamp();

                                await message.edit({
                                    embeds: [successEmbed],
                                    components: []
                                }).catch(console.error);
                            } else {
                                await message.edit({
                                    content: '❌ Trade failed due to an error.',
                                    embeds: [],
                                    components: []
                                }).catch(console.error);
                            }
                        }
                    }
                } else if (i.customId === `confirm_target_${interaction.id}`) {
                    if (i.user.id !== targetUser.id) {
                        return i.reply({
                            content: '❌ This is not your confirm button!',
                            ephemeral: true
                        }).catch(console.error);
                    }

                    if (!tradeState.target.confirmed) {
                        tradeState.target.confirmed = true;
                        await i.update({
                            components: [createTradeButtons()]
                        }).catch(console.error);
                    } else if (!tradeState.target.doubleConfirmed) {
                        tradeState.target.doubleConfirmed = true;
                        await i.update({
                            components: [createTradeButtons()]
                        }).catch(console.error);

                        // Check if both confirmed
                        if (tradeState.initiator.doubleConfirmed) {
                            const success = await executeTrade();

                            collector.stop();
                            messageCollector.stop();

                            if (success) {
                                const successEmbed = new EmbedBuilder()
                                    .setTitle('✅ Trade Complete!')
                                    .setDescription('The trade has been successfully completed.')
                                    .setColor('#00FF00')
                                    .setTimestamp();

                                await message.edit({
                                    embeds: [successEmbed],
                                    components: []
                                }).catch(console.error);
                            } else {
                                await message.edit({
                                    content: '❌ Trade failed due to an error.',
                                    embeds: [],
                                    components: []
                                }).catch(console.error);
                            }
                        }
                    }
                }
                // Cancel trade
                else if (i.customId === `cancel_trade_${interaction.id}`) {
                    if (i.user.id !== initiator.id && i.user.id !== targetUser.id) {
                        return i.reply({
                            content: '❌ You cannot cancel this trade!',
                            ephemeral: true
                        }).catch(console.error);
                    }

                    collector.stop();
                    messageCollector.stop();

                    await i.update({
                        content: '❌ Trade cancelled.',
                        embeds: [],
                        components: []
                    }).catch(console.error);
                }
            } catch (error) {
                console.error('Error in trade collector:', error);
            }
        });

        // Handle message inputs
        messageCollector.on('collect', async (msg) => {
            if (!tradeState.accepted) return;

            try {
                const result = await addItemsToTrade(msg.author.id, msg.content);

                if (result.added.length > 0 || result.errors.length > 0) {
                    // Reset confirmations when items change
                    tradeState.initiator.confirmed = false;
                    tradeState.initiator.doubleConfirmed = false;
                    tradeState.target.confirmed = false;
                    tradeState.target.doubleConfirmed = false;

                    const tradeEmbed = await createTradeEmbed();
                    await message.edit({
                        embeds: [tradeEmbed],
                        components: [createTradeButtons()]
                    }).catch(console.error);

                    let response = '';
                    if (result.added.length > 0) {
                        response += `✅ Added: ${result.added.join(', ')}\n`;
                    }
                    if (result.errors.length > 0) {
                        response += `❌ ${result.errors.join('\n❌ ')}`;
                    }

                    await msg.reply(response).then(m => {
                        setTimeout(() => m.delete().catch(() => {}), 5000);
                    }).catch(console.error);

                    await msg.delete().catch(() => {});

                    collector.resetTimer();
                    messageCollector.resetTimer();
                }
            } catch (error) {
                console.error('Error processing trade message:', error);
            }
        });

        collector.on('end', () => {
            messageCollector.stop();
        });

        messageCollector.on('end', () => {
            collector.stop();
        });
    },
    name: 'trade',
    description: 'Trade cards with another user',
    options: [
        {
            name: 'user',
            description: 'The user you want to trade with',
            required: true,
            type: ApplicationCommandOptionType.User
        }
    ]
}