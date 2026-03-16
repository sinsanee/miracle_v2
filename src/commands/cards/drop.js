const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder , ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, ComponentType, TimestampStyles,} = require('discord.js');
const { all, get, run } = require('../../models/query');
const { userExists, createUser } = require('../../models/users');
const { cardGenFromCropped } = require('../../models/cardGen');
const { resolveImageBuffer } = require('../../models/imageResolver'); // Import the image resolver
const sharp = require('sharp');

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply();
        const author = interaction.user.id
        const dropTime = Math.floor(Date.now() / 1000)
        const dropInterval = 20
        const grabInterval = 10

        // Check if the user exists first
        if (!(await userExists(interaction.user.id))) {
            return interaction.editReply({
                content: 'You are not registered!',
                ephemeral: true
            });
        }

        // Drop cooldown logic
        const lastDrop = await get('SELECT lastdrop FROM users WHERE userid = ?', [author]);
        
        // If there is absolutely no last drop (first time dropping)
        if (lastDrop.lastdrop == null ) {
            await run('UPDATE users SET lastdrop = ? WHERE userid = ?', [dropTime, author]);
        // If there is a previous drop
        } else if (lastDrop.lastdrop) {
            const timeDiffSeconds = (dropTime - lastDrop.lastdrop)
            // If the cooldown is over more then the interval
            if (timeDiffSeconds < dropInterval) {
                // Logic for showing the seconds
                const remainingTime = dropInterval - timeDiffSeconds;
                const seconds = Math.floor(remainingTime % 60);
                interaction.editReply({
                    content: `You can drop a card in ${seconds + 1} second(s)`,
                    ephemeral: true
                });
                return;
            }
            await run('UPDATE users SET lastdrop = ? WHERE userid = ?', [dropTime, author]);
        }

        /**
         * Pick a random set based on rarity (higher rarity = more common)
         */
        async function pickRandomSet() {
            const sets = await all('SELECT id, name, border, rarity FROM sets WHERE available = 1');
            
            if (sets.length === 0) {
                throw new Error('No sets found in database');
            }

            // Find the maximum rarity value
            const maxRarity = Math.max(...sets.map(s => s.rarity));

            // Weight = maxRarity / set.rarity so rarity=1 is most common,
            // rarity=5555 is ultra rare. Using Math.round to get integer weights.
            const weightedSets = [];
            sets.forEach(set => {
                const weight = Math.max(1, Math.round(maxRarity / set.rarity));
                for (let i = 0; i < weight; i++) {
                    weightedSets.push(set);
                }
            });

            // Pick random set from weighted array
            const randomIndex = Math.floor(Math.random() * weightedSets.length);
            return weightedSets[randomIndex];
        }

        /**
         * Pick a random card from a specific set
         */
        async function pickRandomCardFromSet(setId) {
            const cards = await all('SELECT * FROM cards WHERE `set_id` = ? AND dropping = 1', [setId]);
            
            if (cards.length === 0) {
                throw new Error(`No cards found in set ${setId}`);
            }

            const randomIndex = Math.floor(Math.random() * cards.length);
            return cards[randomIndex];
        }

        function generateCondition() {
            const rand = Math.random();
            if (rand < 0.05) return 1;      // 5% Poor
            if (rand < 0.15) return 2;      // 10% Played
            if (rand < 0.40) return 3;      // 25% Good
            if (rand < 0.75) return 4;      // 35% Near Mint
            return 5;                       // 25% Mint
        }

        function conditionToText(condition) {
            const conditions = {
                1: 'Poor',
                2: 'Played',
                3: 'Good',
                4: 'Near Mint',
                5: 'Mint'
            };
            return conditions[condition] || 'Unknown';
        }

        try {
            // Pick 3 cards
            const droppedCards = [];
            
            for (let i = 0; i < 3; i++) {
                const randomSet = await pickRandomSet();
                const randomCard = await pickRandomCardFromSet(randomSet.id);
                
                // Update cards table - increment dropped count
                await run('UPDATE cards SET dropped = dropped + 1 WHERE id = ?', [randomCard.id]);

                // Condition is decided at drop time, before any grab
                const condition = generateCondition();
                
                droppedCards.push({
                    card: randomCard,
                    set: randomSet,
                    condition
                });
            }

            // Generate all 3 card images with updated print numbers
            const cardImages = [];
            for (const drop of droppedCards) {
                // Get the next print number (dropped + 1)
                const printNumber = drop.card.dropped + 1;
                drop.printNumber = printNumber;
                
                // FIXED: Download card image from web server instead of reading from disk
                const imageUrl = `${process.env.IMAGE_BASE_URL}/${drop.card.image}`;
                const croppedImageBuffer = await resolveImageBuffer(imageUrl);
                
                // FIXED: Download border from web server
                const borderUrl = `${process.env.BORDER_BASE_URL}/${drop.set.border}`;
                const borderBuffer = await resolveImageBuffer(borderUrl);

                // Generate the full card with print number as subtitle
                const cardImage = await cardGenFromCropped(
                    croppedImageBuffer,
                    { name: drop.card.name, subtitle: "", footer: `${printNumber}` },
                    borderBuffer,
                    drop.condition
                );
                
                cardImages.push(cardImage);
            }

            // Combine 3 cards horizontally
            const cardWidth = 675;
            const cardHeight = 910;
            const spacing = 20;
            const totalWidth = (cardWidth * 3) + (spacing * 2);

            const combinedImage = await sharp({
                create: {
                    width: totalWidth,
                    height: cardHeight,
                    channels: 4,
                    background: { r: 47, g: 49, b: 54, alpha: 1 } // Discord dark theme color
                }
            })
            .composite([
                { input: cardImages[0], left: 0, top: 0 },
                { input: cardImages[1], left: cardWidth + spacing, top: 0 },
                { input: cardImages[2], left: (cardWidth + spacing) * 2, top: 0 }
            ])
            .png()
            .toBuffer();

            // Create attachment
            const attachment = new AttachmentBuilder(combinedImage, {
                name: 'drop.png'
            });

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🎴 Card Drop!')
                .setDescription('Choose a card by clicking one of the buttons below!')
                .setImage('attachment://drop.png')
                .setColor('#5865F2')
                .setFooter({ text: `Dropped by ${interaction.user.tag}` })
                .setTimestamp();

            // Create buttons
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('claim_card_1')
                    .setLabel('1')
                    .setStyle(ButtonStyle.Primary),
                
                new ButtonBuilder()
                    .setCustomId('claim_card_2')
                    .setLabel('2')
                    .setStyle(ButtonStyle.Primary),
                
                new ButtonBuilder()
                    .setCustomId('claim_card_3')
                    .setLabel('3')
                    .setStyle(ButtonStyle.Primary)
            );

            // Send the message
            const response = await interaction.editReply({
                embeds: [embed],
                files: [attachment],
                components: [buttons]
            });

            // Store drop data
            const activeDrops = client.activeDrops || (client.activeDrops = new Map());
            
            activeDrops.set(response.id, {
                dropper: author,
                cards: droppedCards,
                expired: false,
                cardFights: {
                    0: { fighters: [], resolved: false },
                    1: { fighters: [], resolved: false },
                    2: { fighters: [], resolved: false }
                }
            });

            // ID sequence: 1-9, A-Z, then two-char: 11-19, 1A-1Z, 21-29, 2A-2Z, ...
            // Each "digit" is one of: 1-9, A-Z (35 symbols total)
            const ID_CHARS = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

            function encodeId(n) {
                // n is 0-based index; encode as base-35 with digits 1-9,A-Z
                if (n < ID_CHARS.length) return ID_CHARS[n];
                let result = '';
                while (n >= 0) {
                    result = ID_CHARS[n % ID_CHARS.length] + result;
                    n = Math.floor(n / ID_CHARS.length) - 1;
                }
                return result;
            }

            function decodeId(str) {
                let n = 0;
                for (const ch of str) {
                    n = n * ID_CHARS.length + ID_CHARS.indexOf(ch) + 1;
                }
                return n - 1;
            }

            async function generateNextId() {
                const lastCard = await get(
                    'SELECT id FROM owned_cards ORDER BY id DESC LIMIT 1'
                );
                if (!lastCard || !lastCard.id) return ID_CHARS[0]; // '1'
                return encodeId(decodeId(lastCard.id) + 1);
            }

            // Button claim logic — use a message component collector to avoid
            // stacking client.on listeners across multiple /drop calls
            const collector = response.createMessageComponentCollector({ time: 30000 });

            collector.on('collect', async btnInteraction => {
                if (!btnInteraction.customId.startsWith('claim_card_')) return;

                const dropState = activeDrops.get(btnInteraction.message.id);
                if (!dropState) return;

                if (dropState.expired) {
                    return btnInteraction.reply({ content: "❌ This drop has expired!", ephemeral: true });
                }

                const cardIndex = parseInt(btnInteraction.customId.split('_')[2]) - 1;
                const selectedDrop = dropState.cards[cardIndex];

                if (!selectedDrop) {
                    return btnInteraction.reply({ content: "❌ Invalid card selection.", ephemeral: true });
                }

                if (dropState.cardFights[cardIndex].resolved) {
                    return btnInteraction.reply({ content: "❌ This card has already been claimed!", ephemeral: true });
                }

                const claimerUserId = btnInteraction.user.id;

                if (!(await userExists(claimerUserId))) {
                    return btnInteraction.reply({ content: 'You are not registered!', ephemeral: true });
                }

                const grabTime = Math.floor(Date.now() / 1000);
                const lastGrab = await get('SELECT lastgrab FROM users WHERE userid = ?', [claimerUserId]);

                if (lastGrab && lastGrab.lastgrab) {
                    const timeDiffSeconds = grabTime - lastGrab.lastgrab;
                    if (timeDiffSeconds < grabInterval) {
                        const seconds = Math.floor(grabInterval - timeDiffSeconds);
                        return btnInteraction.reply({
                            content: `You can grab a card in ${seconds + 1} second(s)`,
                            ephemeral: true
                        });
                    }
                }

                const fightData = dropState.cardFights[cardIndex];

                if (fightData.fighters.includes(claimerUserId)) {
                    return btnInteraction.reply({ content: "❌ You've already tried to grab this card!", ephemeral: true });
                }

                fightData.fighters.push(claimerUserId);

                await btnInteraction.reply({ content: `⚔️ You're fighting for card ${cardIndex + 1}!`, ephemeral: true });

                if (fightData.fighters.length === 1) {
                    setTimeout(async () => {
                        if (fightData.resolved) return;
                        fightData.resolved = true;

                        const fighters = fightData.fighters;
                        const winner = fighters.includes(dropState.dropper)
                            ? dropState.dropper
                            : fighters[Math.floor(Math.random() * fighters.length)];

                        try {
                            const { card, set, printNumber, condition } = selectedDrop;
                            const conditionText = conditionToText(condition);
                            const toughness = fighters.length - 1;

                            await run('UPDATE cards SET grabbed = grabbed + 1 WHERE id = ?', [card.id]);
                            await run('UPDATE users SET lastgrab = ? WHERE userid = ?', [grabTime, winner]);

                            const uniqueId = await generateNextId();

                            await run(
                                'INSERT INTO owned_cards (id, card, print, dropper, owner, grabber, `condition`, toughness) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                                [uniqueId, card.id, printNumber, dropState.dropper, winner, winner, condition, toughness]
                            );

                            const winnerUser = await client.users.fetch(winner);

                            let successMessage = `🎉 **${winnerUser.username}** grabbed **${card.name}** (Print #${printNumber})!\n` +
                                `📦 Set: ${set.name}\n` +
                                `🏷️ Edition: ${card.edition}\n` +
                                `✨ Condition: ${conditionText}`;

                            if (toughness > 0) {
                                successMessage += `\n⚔️ Toughness: ${toughness} (fought against ${toughness} ${toughness === 1 ? 'person' : 'people'})`;
                            }

                            await btnInteraction.message.channel.send({ content: successMessage });

                            console.log(`Card claimed: ${uniqueId} - ${card.name} by ${winnerUser.username} (toughness: ${toughness})`);

                            const allResolved = Object.values(dropState.cardFights).every(f => f.resolved);
                            if (allResolved) {
                                collector.stop('all_claimed');
                            }

                        } catch (error) {
                            console.error('Error resolving fight:', error);
                            await btnInteraction.message.channel.send({ content: '❌ An error occurred while resolving the fight.' });
                        }
                    }, 5000);
                }
            });

            collector.on('end', async (_, reason) => {
                const dropState = activeDrops.get(response.id);
                if (dropState) {
                    dropState.expired = true;
                    activeDrops.delete(response.id);
                }
                // Remove buttons when collector ends (expired or all claimed)
                await response.edit({ components: [] }).catch(console.error);
            });

        } catch (error) {
            console.error('Error during card drop:', error);
            await interaction.editReply({
                content: 'An error occurred while dropping cards. Please try again.',
                ephemeral: true
            });
        }
    },
    name: 'drop',
    description: 'Drop a card!',
    devOnly: false,
}
