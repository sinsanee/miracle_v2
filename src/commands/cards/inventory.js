const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, ComponentType, TimestampStyles,} = require('discord.js');
const { all, get } = require('../../models/query');
const fs = require("fs");
const path = require("path");

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply();

        // Variables
        const name = interaction.options.get('name')?.value;
        const sort = interaction.options.get('sort')?.value || 'items.name ASC';
        const userId = interaction.user.id;

        /**
         * Convert condition number to text
         */

        try {
            // Build the SQL query - join owned_cards with cards table
            let query = `
                SELECT 
                    inventory.id as owned_id,
                    inventory.amount,
                    items.*
                FROM inventory
                JOIN items ON inventory.itemid = items.id
                WHERE inventory.userid = ?
            `;
            const params = [userId];

            if (name) {
                query += ' AND item.name LIKE ?';
                params.push(`%${name}%`);
            }

            query += ` ORDER BY ${sort}`;

            // Execute the search
            const results = await all(query, params);

            if (!results || results.length === 0) {
                return interaction.editReply({
                    content: name 
                        ? 'No items found matching your search in your inventory.'
                        : 'Your inventory is empty!',
                    ephemeral: true
                });
            }

            // Pagination setup
            const itemsPerPage = 10;
            const pages = [];

            for (let i = 0; i < results.length; i += itemsPerPage) {
                const pageItems = results.slice(i, i + itemsPerPage);
                pages.push(pageItems);
            }

            // Create embeds for pagination
            const embeds = await Promise.all(pages.map(async (pageItems, pageIndex) => {
                const embed = new EmbedBuilder()
                    .setTitle(`📚 ${interaction.user.username}'s Inventory`)
                    .setDescription(`Total items: ${results.length}`)
                    .setColor('#5865F2')
                    .setFooter({ text: `Page ${pageIndex + 1}/${pages.length}` });

                for (const [index, item] of pageItems.entries()) {
                    const globalIndex = (pageIndex * itemsPerPage) + index + 1;           
                    
                    embed.addFields({
                        name: `${globalIndex}. ${item.name}`,
                        value: `**Amount:** ${item.amount}`,
                        inline: false
                    });
                }

                return embed;
            }));

            let currentPage = 0;

            // Create pagination buttons
            function createPaginationButtons(index) {
                const first = new ButtonBuilder()
                    .setCustomId(`pagefirst_${interaction.id}`)
                    .setEmoji('⏪')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(index === 0);

                const prev = new ButtonBuilder()
                    .setCustomId(`pageprev_${interaction.id}`)
                    .setEmoji('◀️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(index === 0);

                const pageCount = new ButtonBuilder()
                    .setCustomId(`pagecount_${interaction.id}`)
                    .setLabel(`${index + 1}/${embeds.length}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true);

                const next = new ButtonBuilder()
                    .setCustomId(`pagenext_${interaction.id}`)
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(index === embeds.length - 1);

                const last = new ButtonBuilder()
                    .setCustomId(`pagelast_${interaction.id}`)
                    .setEmoji('⏩')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(index === embeds.length - 1);

                return new ActionRowBuilder().addComponents([first, prev, pageCount, next, last]);
            }

            // If only one page, no need for pagination buttons
            if (embeds.length === 1) {
                return interaction.editReply({
                    embeds: [embeds[0]]
                });
            }

            const message = await interaction.editReply({
                embeds: [embeds[currentPage]],
                components: [createPaginationButtons(currentPage)]
            });

            const collector = message.createMessageComponentCollector({
                idle: 60000 // 60 seconds of inactivity
            });

            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({
                        content: `Only **${interaction.user.username}** can use these buttons`,
                        ephemeral: true
                    }).catch(console.error);
                }

                try {
                    await i.deferUpdate();

                    if (i.customId === `pagefirst_${interaction.id}`) {
                        currentPage = 0;
                    } else if (i.customId === `pageprev_${interaction.id}`) {
                        if (currentPage > 0) currentPage--;
                    } else if (i.customId === `pagenext_${interaction.id}`) {
                        if (currentPage < embeds.length - 1) currentPage++;
                    } else if (i.customId === `pagelast_${interaction.id}`) {
                        currentPage = embeds.length - 1;
                    }

                    await message.edit({
                        embeds: [embeds[currentPage]],
                        components: [createPaginationButtons(currentPage)]
                    }).catch(console.error);

                    collector.resetTimer();
                } catch (error) {
                    console.error('Error handling pagination:', error);
                }
            });

            collector.on('end', async () => {
                await message.edit({
                    embeds: [embeds[currentPage]],
                    components: []
                }).catch(console.error);
            });

        } catch (error) {
            console.error('Error in inventory command:', error);
            await interaction.editReply({
                content: 'An error occurred while viewing your inventory.',
                ephemeral: true
            }).catch(console.error);
        }
    },
    name: 'inventory',
    description: 'View your collection of cards.',
    devOnly: false,
    options: [
        {
            name: 'name',
            description: 'Filter by item name',
            type: ApplicationCommandOptionType.String,
            required: false
        },
        {
            name: 'sort',
            description: 'Sort your inventory',
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: [
                {
                    name: 'Name A-Z',
                    value: 'items.name ASC'
                },
                {
                    name: 'Name Z-A',
                    value: 'items.name DESC'
                },
                {
                    name: 'Newest',
                    value: 'inventory.ROWID DESC'
                },
                {
                    name: 'Oldest',
                    value: 'inventory.ROWID ASC'
                }
            ]
        }
    ]
}