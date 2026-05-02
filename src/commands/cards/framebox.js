const {
    Client, Interaction, ApplicationCommandOptionType,
    EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder
} = require('discord.js');
const { get, run } = require('../../models/query');

const GOLD_ITEM_ID = 7;
const BOX_COST     = 0;

const FRAME_BOXES = {
    1: {
        name: 'Frame Box 1',
        emoji: '📦',
        pools: {
            Common:   { chance: 0.60, frames: ['Wooden Mirror Frame'] },
            Uncommon: { chance: 0.30, frames: ['Mobile Phone Frame'] },
            Rare:     { chance: 0.09, frames: ['Jimmy Frame'] },
            Epic:     { chance: 0.01, frames: ['Earth Frame'] },
        }
    }
};

const RARITY_STYLE = {
    Common:   { color: '#95A5A6', emoji: '⬜' },
    Uncommon: { color: '#2ECC71', emoji: '🟩' },
    Rare:     { color: '#3498DB', emoji: '🟦' },
    Epic:     { color: '#9B59B6', emoji: '🟪' },
};

function rollFrame(box) {
    const rand = Math.random();
    let cumulative = 0;
    for (const [rarity, pool] of Object.entries(box.pools)) {
        cumulative += pool.chance;
        if (rand < cumulative) {
            const name = pool.frames[Math.floor(Math.random() * pool.frames.length)];
            return { name, rarity };
        }
    }
    const entries = Object.entries(box.pools);
    const [rarity, pool] = entries[entries.length - 1];
    return { name: pool.frames[0], rarity };
}

module.exports = {
    callback: async (client, interaction) => {
        await interaction.deferReply({ ephemeral: false });

        const boxNumber = interaction.options.getInteger('box');
        const userId    = interaction.user.id;
        const box       = FRAME_BOXES[boxNumber];

        if (!box) {
            return interaction.editReply({ content: `❌ Frame Box ${boxNumber} doesn't exist.` });
        }

        try {
            const goldRow  = await get('SELECT amount FROM inventory WHERE userid = ? AND itemid = ?', [userId, GOLD_ITEM_ID]);
            const userGold = goldRow?.amount ?? 0;

            if (userGold < BOX_COST) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`❌ You need 🪙 **${BOX_COST} Gold** to open this box.\nYour balance: 🪙 **${userGold}** Gold.`)
                            .setColor('#E74C3C')
                    ]
                });
            }

            const confirmEmbed = new EmbedBuilder()
                .setTitle(`${box.emoji} ${box.name}`)
                .setDescription(
                    `Open this box for 🪙 **${BOX_COST} Gold**?\n\n` +
                    Object.entries(box.pools).map(([rarity, pool]) => {
                        const style = RARITY_STYLE[rarity];
                        const pct   = (pool.chance * 100).toFixed(0);
                        return `${style.emoji} **${rarity}** (${pct}%) — ${pool.frames.join(', ')}`;
                    }).join('\n')
                )
                .setColor('#F1C40F')
                .setFooter({ text: `Balance: 🪙 ${userGold} Gold` });

            const openBtn = new ButtonBuilder()
                .setCustomId(`fbox_open_${interaction.id}`)
                .setLabel(`Open for 🪙 ${BOX_COST}`)
                .setStyle(ButtonStyle.Success);

            const cancelBtn = new ButtonBuilder()
                .setCustomId(`fbox_cancel_${interaction.id}`)
                .setLabel('Cancel')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Secondary);

            const message = await interaction.editReply({
                embeds: [confirmEmbed],
                components: [new ActionRowBuilder().addComponents([openBtn, cancelBtn])]
            });

            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === userId,
                max: 1,
                time: 30000
            });

            collector.on('collect', async (i) => {
                if (i.customId === `fbox_cancel_${interaction.id}`) {
                    return i.update({
                        embeds: [new EmbedBuilder().setDescription('❌ Box opening cancelled.').setColor('#95A5A6')],
                        components: []
                    });
                }

                await i.deferUpdate();

                const freshGold = await get('SELECT amount FROM inventory WHERE userid = ? AND itemid = ?', [userId, GOLD_ITEM_ID]);
                if ((freshGold?.amount ?? 0) < BOX_COST) {
                    return i.editReply({
                        embeds: [new EmbedBuilder().setDescription('❌ Not enough gold.').setColor('#E74C3C')],
                        components: []
                    });
                }

                await run('UPDATE inventory SET amount = amount - ? WHERE userid = ? AND itemid = ?', [BOX_COST, userId, GOLD_ITEM_ID]);

                const winner = rollFrame(box);
                const style  = RARITY_STYLE[winner.rarity];

                const frameItem = await get('SELECT id FROM items WHERE name = ?', [winner.name]);
                if (frameItem) {
                    const existingInv = await get('SELECT id FROM inventory WHERE userid = ? AND itemid = ?', [userId, frameItem.id]);
                    if (existingInv) {
                        await run('UPDATE inventory SET amount = amount + 1 WHERE userid = ? AND itemid = ?', [userId, frameItem.id]);
                    } else {
                        await run('INSERT INTO inventory (userid, itemid, amount) VALUES (?, ?, 1)', [userId, frameItem.id]);
                    }
                } else {
                    console.error(`framebox: item "${winner.name}" not found in DB`);
                }

                const newBalance = (freshGold?.amount ?? 0) - BOX_COST;

                return i.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(`${box.emoji} ${box.name} Opened!`)
                            .setDescription(
                                `${style.emoji} **${winner.rarity}**\n\n` +
                                `🖼️ **${winner.name}**\n\n` +
                                `Use \`/frameadd\` to apply it to a card.`
                            )
                            .setColor(style.color)
                            .setFooter({ text: `🪙 ${newBalance} Gold remaining` })
                    ],
                    components: []
                });
            });

            collector.on('end', async (collected) => {
                if (collected.size === 0) {
                    await interaction.editReply({
                        embeds: [new EmbedBuilder().setDescription('⏰ Box opening timed out.').setColor('#95A5A6')],
                        components: []
                    }).catch(console.error);
                }
            });

        } catch (error) {
            console.error('Error in framebox:', error);
            await interaction.editReply({ content: 'An error occurred while opening the frame box.' }).catch(console.error);
        }
    },

    name: 'framebox',
    description: 'Open a frame box to receive a random frame.',
    devOnly: false,
    options: [
        {
            name: 'box',
            description: 'Which frame box to open',
            type: ApplicationCommandOptionType.Integer,
            required: true,
            choices: [
                { name: 'Frame Box 1', value: 1 }
            ]
        }
    ]
};
