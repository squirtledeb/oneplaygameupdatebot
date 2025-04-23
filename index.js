const {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    SlashCommandBuilder,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const { randomUUID } = require('crypto');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const express = require('express');

// Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Initialize Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// Slash Command Definitions
const commands = [
    new SlashCommandBuilder()
        .setName('logchannel')
        .setDescription('Set the log channel (REQUIRED FIRST)')
        .addChannelOption(option => option
            .setName('channel')
            .setDescription('Log channel')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)),
    new SlashCommandBuilder()
        .setName('addrole')
        .setDescription('Add a management role')
        .addRoleOption(option => option
            .setName('role')
            .setDescription('Role to add')
            .setRequired(true)),
    new SlashCommandBuilder()
        .setName('removerole')
        .setDescription('Remove a management role')
        .addRoleOption(option => option
            .setName('role')
            .setDescription('Role to remove')
            .setRequired(true)),
    new SlashCommandBuilder()
        .setName('viewrole')
        .setDescription('View all management roles'),
    new SlashCommandBuilder()
        .setName('gameupdatechannel')
        .setDescription('Set the game update channel')
        .addChannelOption(option => option
            .setName('channel')
            .setDescription('Update channel')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)),
    new SlashCommandBuilder()
        .setName('gameupdatestatuschannel')
        .setDescription('Set the channel where update statuses will appear')
        .addChannelOption(option => option
            .setName('channel')
            .setDescription('Status channel')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText))
];

// Register Commands
const rest = new REST({ version: '10' }).setToken(TOKEN);
rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands })
    .then(() => console.log('✅ Commands registered'))
    .catch(console.error);

// Supabase Helper Functions
async function getGuildSettings(guildId) {
    const { data, error } = await supabase
        .from('guild_settings')
        .select('*')
        .eq('guild_id', guildId)
        .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116: No rows found
    return data || { guild_id: guildId, log_channel: null, roles: [], game_update_channel: null, game_update_status_channel: null };
}

async function updateGuildSettings(guildId, updates) {
    const { error } = await supabase
        .from('guild_settings')
        .upsert({ guild_id: guildId, ...updates }, { onConflict: 'guild_id' });

    if (error) throw error;
}

// Permission Checker
const checkPermissions = async (interaction) => {
    const guildId = interaction.guild.id;
    const settings = await getGuildSettings(guildId);
    const allowedRoles = settings.roles || [];
    return interaction.member.permissions.has('Administrator') || 
           interaction.member.roles.cache.some(r => allowedRoles.includes(r.id));
};

// In-memory storage for game update requests (since they are temporary)
const requests = new Map();

client.on('interactionCreate', async interaction => {
    if (!interaction.inGuild()) return;
    const guildId = interaction.guild.id;

    // Slash Commands
    if (interaction.isChatInputCommand()) {
        const handlePermissionCheck = async () => {
            if (!await checkPermissions(interaction)) {
                await interaction.reply({ content: '⚠️ Permission denied!', ephemeral: true })
                    .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
                return false;
            }
            return true;
        };

        try {
            switch(interaction.commandName) {
                case 'logchannel':
                    if (!await handlePermissionCheck()) return;
                    const logChannel = interaction.options.getChannel('channel');
                    await updateGuildSettings(guildId, { log_channel: logChannel.id });
                    await interaction.reply({ content: `✅ Log channel set to ${logChannel}`, ephemeral: true })
                        .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
                    break;

                case 'addrole':
                    if (!await handlePermissionCheck()) return;
                    const addRole = interaction.options.getRole('role');
                    const settingsAddRole = await getGuildSettings(guildId);
                    const newRolesAdd = [...new Set([...settingsAddRole.roles, addRole.id])];
                    await updateGuildSettings(guildId, { roles: newRolesAdd });
                    await interaction.reply({ content: `✅ Added ${addRole.name} to management roles`, ephemeral: true })
                        .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
                    break;

                case 'removerole':
                    if (!await handlePermissionCheck()) return;
                    const removeRole = interaction.options.getRole('role');
                    const settingsRemoveRole = await getGuildSettings(guildId);
                    const newRolesRemove = settingsRemoveRole.roles.filter(r => r !== removeRole.id);
                    await updateGuildSettings(guildId, { roles: newRolesRemove });
                    await interaction.reply({ content: `✅ Removed ${removeRole.name} from management roles`, ephemeral: true })
                        .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
                    break;

                case 'viewrole':
                    const settingsViewRole = await getGuildSettings(guildId);
                    const roles = settingsViewRole.roles || [];
                    await interaction.reply({
                        content: roles.length ? 
                            `🔑 Management Roles: ${roles.map(r => `<@&${r}>`).join(' ')}` : 
                            'No management roles configured!',
                        ephemeral: true
                    }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
                    break;

                case 'gameupdatechannel':
                    if (!await handlePermissionCheck()) return;
                    const updateChannel = interaction.options.getChannel('channel');
                    await updateGuildSettings(guildId, { game_update_channel: updateChannel.id });
                    
                    // Create initial system embed
                    const systemEmbed = new EmbedBuilder()
                        .setTitle('🎮 Game Update System')
                        .setDescription('Click below to request a game update');
                    
                    const requestButton = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('request_update')
                            .setLabel('Request Update')
                            .setStyle(ButtonStyle.Primary)
                    );
                    
                    await updateChannel.send({ embeds: [systemEmbed], components: [requestButton] });
                    await interaction.reply({ content: `✅ Game update system configured in ${updateChannel}`, ephemeral: true })
                        .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
                    break;

                case 'gameupdatestatuschannel':
                    if (!await handlePermissionCheck()) return;
                    const statusChannel = interaction.options.getChannel('channel');
                    await updateGuildSettings(guildId, { game_update_status_channel: statusChannel.id });
                    await interaction.reply({ content: `✅ Game update status channel set to ${statusChannel}`, ephemeral: true })
                        .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
                    break;
            }
        } catch (error) {
            console.error(`Error handling command ${interaction.commandName}:`, error);
            await interaction.reply({ content: '❌ An error occurred while processing your command.', ephemeral: true })
                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
        }
    }

    // Request Update Button
    if (interaction.isButton() && interaction.customId === 'request_update') {
        const modal = new ModalBuilder()
            .setCustomId('game_update_modal')
            .setTitle('Game Update Request');
        
        const inputs = [
            new TextInputBuilder()
                .setCustomId('game_name')
                .setLabel('Game Name')
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            new TextInputBuilder()
                .setCustomId('store')
                .setLabel('Store')
                .setPlaceholder('Steam, Epic Games, Rockstar Games, Ubisoft')
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            new TextInputBuilder()
                .setCustomId('server')
                .setLabel('Server')
                .setPlaceholder('Auto, Mumbai South, Mumbai North, Noida')
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            new TextInputBuilder()
                .setCustomId('size')
                .setLabel('Size')
                .setPlaceholder('Mention size in MB or GB')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ];

        modal.addComponents(inputs.map(input => 
            new ActionRowBuilder().addComponents(input)
        ));
        
        await interaction.showModal(modal);
    }

    // Modal Submission
    if (interaction.isModalSubmit() && interaction.customId === 'game_update_modal') {
        const [gameName, store, server, size] = ['game_name', 'store', 'server', 'size']
            .map(field => interaction.fields.getTextInputValue(field));

        try {
            const guildId = interaction.guild.id;
            const settings = await getGuildSettings(guildId);
            const logChannelId = settings.log_channel;
            const gameUpdateChannelId = settings.game_update_channel;
            const gameUpdateStatusChannelId = settings.game_update_status_channel;

            if (!logChannelId || !gameUpdateChannelId) {
                return interaction.reply({ content: '❌ System not fully configured!', ephemeral: true })
                    .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
            }

            // Generate unique request ID
            const requestId = randomUUID();

            const baseEmbed = new EmbedBuilder()
                .setTitle('Game Update Request')
                .addFields(
                    { name: 'Game', value: gameName, inline: true },
                    { name: 'Store', value: store, inline: true },
                    { name: 'Server', value: server, inline: true },
                    { name: 'Size', value: size, inline: true },
                    { name: 'Requested by', value: interaction.user.toString(), inline: true },
                    { name: 'Status', value: '⏳ Pending', inline: true }
                )
                .setTimestamp();

            // Send to log channel with update button
            const logChannel = await client.channels.fetch(logChannelId);
            const logMessage = await logChannel.send({
                embeds: [baseEmbed],
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`update_${requestId}`)
                            .setLabel('Mark as Updated')
                            .setStyle(ButtonStyle.Success)
                    )
                ]
            });

            // Send to appropriate channel based on configuration
            const targetChannelId = gameUpdateStatusChannelId || gameUpdateChannelId;
            const targetChannel = await client.channels.fetch(targetChannelId);
            const statusMessage = await targetChannel.send({ embeds: [baseEmbed] });

            // Store references in memory (temporary storage for requests)
            requests.set(requestId, {
                logMessageId: logMessage.id,
                statusMessageId: statusMessage.id,
                logChannelId,
                statusChannelId: targetChannelId,
                guildId
            });

            await interaction.reply({ content: '✅ Request submitted!', ephemeral: true })
                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
        } catch (error) {
            console.error('Submission error:', error);
            await interaction.reply({ content: '❌ Failed to submit request', ephemeral: true })
                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
        }
    }

    // Update Status Button
    if (interaction.isButton() && interaction.customId.startsWith('update_')) {
        const requestId = interaction.customId.split('_')[1];
        const requestData = requests.get(requestId);

        if (!requestData) {
            return interaction.reply({ content: '❌ Request not found', ephemeral: true })
                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
        }

        if (!await checkPermissions(interaction)) {
            return interaction.reply({ content: '⚠️ Permission denied!', ephemeral: true })
                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
        }

        try {
            // Update log message
            const logChannel = await client.channels.fetch(requestData.logChannelId);
            const logMessage = await logChannel.messages.fetch(requestData.logMessageId);
            const updatedLogEmbed = EmbedBuilder.from(logMessage.embeds[0])
                .spliceFields(5, 1, { name: 'Status', value: '✅ Updated', inline: true });

            await logMessage.edit({ 
                embeds: [updatedLogEmbed],
                components: [] // Remove button
            });

            // Update status message
            const statusChannel = await client.channels.fetch(requestData.statusChannelId);
            const statusMessage = await statusChannel.messages.fetch(requestData.statusMessageId);
            const updatedStatusEmbed = EmbedBuilder.from(statusMessage.embeds[0])
                .spliceFields(5, 1, { name: 'Status', value: '✅ Updated', inline: true });

            await statusMessage.edit({ embeds: [updatedStatusEmbed] });

            // Cleanup
            requests.delete(requestId);
            await interaction.reply({ content: '✅ Status updated!', ephemeral: true })
                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
        } catch (error) {
            console.error('Update error:', error);
            await interaction.reply({ content: '❌ Failed to update status', ephemeral: true })
                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
        }
    }
});

// Keep-Alive Web Server
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send('Discord Bot is running!');
});

app.listen(PORT, () => {
    console.log(`🖥️ Web server running on port ${PORT}`);
});

// Start Discord Client
client.on('ready', () => console.log(`🚀 Logged in as ${client.user.tag}`));
client.login(TOKEN);