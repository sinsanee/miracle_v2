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

            // Create weighted array based on inverted rarity
            // Higher rarity number = fewer entries = more rare
            const weightedSets = [];
            sets.forEach(set => {
                const weight = maxRarity - set.rarity + 1;
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

        try {
            // Pick 3 cards
            const droppedCards = [];
            
            for (let i = 0; i < 3; i++) {
                const randomSet = await pickRandomSet();
                const randomCard = await pickRandomCardFromSet(randomSet.id);
                
                // Update cards table - increment dropped count
                await run('UPDATE cards SET dropped = dropped + 1 WHERE id = ?', [randomCard.id]);
                
                droppedCards.push({
                    card: randomCard,
                    set: randomSet
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
                    borderBuffer
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

            // Set expiration timer (30 seconds)
            setTimeout(() => {
                const dropState = activeDrops.get(response.id);
                if (dropState) {
                    dropState.expired = true;
                    
                    // Remove buttons
                    interaction.editReply({
                        embeds: [embed],
                        files: [attachment],
                        components: []
                    }).catch(console.error);
                    
                    // Clean up after 5 more seconds
                    setTimeout(() => {
                        activeDrops.delete(response.id);
                    }, 5000);
                }
            }, 30000);

            // Generate next sequential ID (for owned_cards)
            async function generateNextId() {
                const lastCard = await get(
                    'SELECT id FROM owned_cards ORDER BY id DESC LIMIT 1'
                );
                
                if (!lastCard || !lastCard.id) {
                    return 'AAA-001';
                }
                
                const parts = lastCard.id.split('-');
                const prefix = parts[0];
                let number = parseInt(parts[1]);
                
                number++;
                
                if (number > 999) {
                    const nextPrefix = incrementPrefix(prefix);
                    return `${nextPrefix}-001`;
                }
                
                return `${prefix}-${number.toString().padStart(3, '0')}`;
            }

            function incrementPrefix(prefix) {
                const chars = prefix.split('');
                let carry = true;
                
                for (let i = chars.length - 1; i >= 0 && carry; i--) {
                    if (chars[i] === 'Z') {
                        chars[i] = 'A';
                    } else {
                        chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
                        carry = false;
                    }
                }
                
                if (carry) {
                    chars.unshift('A');
                }
                
                return chars.join('');
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

            // Button claim logic
            client.on("interactionCreate", async interaction => {
                if (!interaction.isButton()) return;
                if (!interaction.customId.startsWith('claim_card_')) return;

                const dropState = activeDrops.get(interaction.message.id);
                if (!dropState) return;

                // Check if drop has expired
                if (dropState.expired) {
                    return interaction.reply({
                        content: "❌ This drop has expired!",
                        ephemeral: true
                    });
                }

                // Get which card was selected (1, 2, or 3)
                const cardIndex = parseInt(interaction.customId.split('_')[2]) - 1;
                const selectedDrop = dropState.cards[cardIndex];

                if (!selectedDrop) {
                    return interaction.reply({
                        content: "❌ Invalid card selection.",
                        ephemeral: true
                    });
                }

                // Check if this card has already been resolved
                if (dropState.cardFights[cardIndex].resolved) {
                    return interaction.reply({
                        content: "❌ This card has already been claimed!",
                        ephemeral: true
                    });
                }

                const claimerUserId = interaction.user.id;

                if (!(await userExists(claimerUserId))) {
                    return interaction.reply({
                        content: 'You are not registered!',
                        ephemeral: true
                    });
                }

                // Check grab cooldown
                const lastGrab = await get('SELECT lastgrab FROM users WHERE userid = ?', [claimerUserId]);
                const grabTime = Math.floor(Date.now() / 1000)
                
                if (lastGrab && lastGrab.lastgrab) {
                    const timeDiffSeconds = (grabTime - lastGrab.lastgrab)
                    if (timeDiffSeconds < grabInterval) {
                        const remainingTime = grabInterval - timeDiffSeconds;
                        const seconds = Math.floor(remainingTime % 60);
                        return interaction.reply({
                            content: `You can grab a card in ${seconds + 1} second(s)`,
                            ephemeral: true
                        });
                    }
                }

                // Add user to fighters list
                const fightData = dropState.cardFights[cardIndex];
                
                // Check if user already tried to grab this card
                if (fightData.fighters.includes(claimerUserId)) {
                    return interaction.reply({
                        content: "❌ You've already tried to grab this card!",
                        ephemeral: true
                    });
                }

                fightData.fighters.push(claimerUserId);

                // Acknowledge the grab attempt
                await interaction.reply({
                    content: `⚔️ You're fighting for card ${cardIndex + 1}!`,
                    ephemeral: true
                });

                // If this is the first fighter, start the 3 second timer
                if (fightData.fighters.length === 1) {
                    setTimeout(async () => {
                        // Resolve the fight
                        if (fightData.resolved) return;
                        fightData.resolved = true;

                        const fighters = fightData.fighters;
                        let winner;

                        // Dropper has priority
                        if (fighters.includes(dropState.dropper)) {
                            winner = dropState.dropper;
                        } else {
                            // Random winner among fighters
                            winner = fighters[Math.floor(Math.random() * fighters.length)];
                        }

                        try {
                            const { card, set, printNumber } = selectedDrop;

                            // Generate condition
                            const condition = generateCondition();
                            const conditionText = conditionToText(condition);

                            // Calculate toughness (number of fighters - 1)
                            const toughness = fighters.length - 1;

                            // Update cards table - increment grabbed count
                            await run('UPDATE cards SET grabbed = grabbed + 1 WHERE id = ?', [card.id]);

                            // Update winner's lastgrab
                            await run('UPDATE users SET lastgrab = ? WHERE userid = ?', [grabTime, winner]);

                            // Generate next sequential ID for owned_cards
                            const uniqueId = await generateNextId();

                            // Insert into owned_cards
                            await run(
                                'INSERT INTO owned_cards (id, card, print, dropper, owner, grabber, `condition`, toughness) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                                [uniqueId, card.id, printNumber, dropState.dropper, winner, winner, condition, toughness]
                            );

                            // Get winner's username
                            const winnerUser = await client.users.fetch(winner);

                            // Create success message
                            let successMessage = `🎉 **${winnerUser.username}** grabbed **${card.name}** (Print #${printNumber})!\n` +
                                               `📦 Set: ${set.name}\n` +
                                               `🏷️ Edition: ${card.edition}\n` +
                                               `✨ Condition: ${conditionText}`;

                            if (toughness > 0) {
                                successMessage += `\n⚔️ Toughness: ${toughness} (fought against ${toughness} ${toughness === 1 ? 'person' : 'people'})`;
                            }

                            // Send success message
                            await interaction.message.channel.send({
                                content: successMessage
                            });

                            console.log(`Card claimed: ${uniqueId} - ${card.name} by ${winnerUser.username} (toughness: ${toughness})`);

                            // Check if all cards have been claimed
                            const allResolved = Object.values(dropState.cardFights).every(f => f.resolved);
                            if (allResolved) {
                                activeDrops.delete(interaction.message.id);
                                await interaction.message.edit({
                                    embeds: [embed],
                                    files: interaction.message.attachments.map(a => a),
                                    components: []
                                });
                            }

                        } catch (error) {
                            console.error('Error resolving fight:', error);
                            await interaction.message.channel.send({
                                content: '❌ An error occurred while resolving the fight.'
                            });
                        }
                    }, 5000);
                }
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
